import { attempt, fail } from '../../../shared/kernel/errors.ts';
import type { DomainEvent, EventBus } from '../../../shared/kernel/events.ts';
import type { ManagerLanguage } from '../../../shared/kernel/manager-language.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import type { Report } from '../../../shared/kernel/report.ts';
import {
  admitConfirmation,
  assertConfirmation,
  type ConfirmationLog,
  type Letter,
  letterOf,
} from '../domain/confirmation.ts';
import {
  type Channel,
  createForm,
  defaultsFor,
  editForm,
  type Form,
  type FormChange,
  type FormInput,
  type FormsEvent,
  HONEYPOT,
  parseFormName,
  removeForm,
} from '../domain/form.ts';
import type {
  FileRepository,
  FormMarkup,
  FormRepository,
  InboxStats,
  Stamps,
  SubmissionFile,
  SubmissionQuery,
  SubmissionRepository,
  UploadedFile,
  WebhookPost,
  WebhookRepository,
} from '../domain/ports.ts';
import {
  assertLabels,
  checkValues,
  type FieldSpec,
  fieldValue,
  formTextsFor,
  isShown,
  messagesFor,
  type Posted,
  sentValues,
  shownValues,
  uploadsOf,
  type Value,
  valueLabels,
} from '../domain/schema.ts';
import {
  assertSources,
  fromVisitor,
  parseUtm,
  resolveSource,
  SOURCES,
  type SourceContext,
  utmOf,
  utmText,
} from '../domain/sources.ts';
import {
  changeSubmission,
  looksLikeSpam,
  markRead,
  type Notice,
  noticeOf,
  type Submission,
  type SubmissionChange,
  type SubmissionStatus,
} from '../domain/submission.ts';
import {
  answerFailure,
  nextWebhookAttempt,
  payloadOf,
  type WebhookDelivery,
  type WebhookFailure,
} from '../domain/webhook.ts';

/** Страница сайта глазами форм: для скрытых полей, адреса возврата и языка ошибок. */
export type FormPage = {
  readonly id: number;
  readonly title: string;
  readonly path: string;
  readonly language: string;
  readonly fields: Readonly<Record<string, unknown>>;
};

/** Запрос посетителя, какой его видит форма на странице. */
export type FormRequest = {
  readonly query: Readonly<Record<string, string>>;
  readonly header: (name: string) => string | null;
  readonly cookie: (name: string) => string | null;
};

export type FormsPorts = {
  readonly forms: FormRepository;
  readonly submissions: SubmissionRepository;
  readonly files: FileRepository;
  readonly markup: FormMarkup;
  readonly stamps: Stamps;
  readonly bus: EventBus;
  readonly clock: () => Date;
  readonly site: () => {
    readonly name: string;
    readonly url: string;
    readonly language: string;
  };
  readonly pages: {
    readonly page: (id: number) => FormPage | null;
    readonly setting: (key: string) => string | null;
  };
  /** Язык уведомлений: на нём подписи уведомления о заявке. */
  readonly noticeLanguage: () => ManagerLanguage;
  /** Уведомление о заявке в каналы формы или по маршруту из настроек. */
  readonly notify: (
    notice: Notice,
    channels: readonly Channel[] | null,
    source: string
  ) => void;
  /** Письмо отправителю — в очередь почты уведомлений; почта не настроена — письма нет. */
  readonly mail: (letter: Letter, source: string) => void;
  readonly webhooks: WebhookRepository;
  readonly post: WebhookPost;
  /** Новый секрет вебхука. */
  readonly secret: () => string;
  readonly report: Report;
  /** Очередь вебхуков пополнилась: отправить сейчас, не дожидаясь расписания. */
  readonly kick: () => void;
};

/** Флеш после отправки без JS: значения и ошибки возвращаются в форму на странице. */
export type Flash = {
  readonly form: string;
  readonly values: Posted;
  readonly errors: Readonly<Record<string, string>>;
  readonly message: string | null;
};

export var FLASH_COOKIE = 'cms_form';

/** Что примет приём формы до чтения тела. */
export type Intake = 'missing' | 'limited' | 'files' | 'plain';

export type SubmitInput = {
  readonly fields: Posted;
  /** Файлы по имени поля: только у формы с полями-файлами. */
  readonly files?: Readonly<Record<string, readonly UploadedFile[]>>;
  readonly ip: string;
  readonly userAgent: string;
  /** Cookie запроса с заявкой: для скрытых полей `cookie:имя`. */
  readonly cookie?: (name: string) => string | null;
};

/** sent — принята (или тихо отброшена ловушкой), invalid — ошибки полей, stale — нужна новая печать, wait — не сейчас. */
export type SubmitResult = { readonly back: string } & (
  | {
      readonly kind: 'sent';
      readonly message: string;
      readonly redirect: string | null;
      readonly goal: string;
    }
  | {
      readonly kind: 'invalid';
      readonly message: string;
      readonly errors: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: 'stale';
      readonly message: string;
      readonly stamp: { readonly token: string; readonly iat: number };
    }
  | { readonly kind: 'wait'; readonly message: string }
  | { readonly kind: 'missing' }
);

/** Сводка формы для менеджера. */
export type FormSummary = Pick<
  Form,
  'name' | 'title' | 'revision' | 'updatedAt'
> & { readonly fields: number };

// Не больше отправок с адреса в окно на форму: фиксированное окно, без продления от каждой попытки.
const _RATE_WINDOW_MS = 10 * 60 * 1000;
const _RATE_LIMIT = 5;
const _DUPLICATE_MS = 3 * 60 * 1000;
const _ORPHAN_DAYS = 30;
const _WEBHOOK_BATCH = 20;

const _NO_COOKIE = (): string | null => null;

const _gone = (message: string): Error => new Error(message);

const _first = (posted: Posted, name: string): string =>
  posted[name]?.[0] ?? '';

const _decodeFlash = (raw: string | null): Flash | null =>
  raw
    ? attempt(
        () =>
          JSON.parse(
            new TextDecoder().decode(
              Uint8Array.fromBase64(raw, { alphabet: 'base64url' })
            )
          ) as Flash,
        () => null
      )
    : null;

/** Флеш строкой для cookie: значения длиннее и всё сверх 3 КБ отбрасываются — cookie не резиновая. */
export var encodeFlash = (flash: Flash): string =>
  ((full) =>
    new TextEncoder()
      .encode(
        full.length <= 3000 ? full : JSON.stringify({ ...flash, values: {} })
      )
      .toBase64({ alphabet: 'base64url', omitPadding: true }))(
    JSON.stringify({
      ...flash,
      values: Object.fromEntries(
        Object.entries(flash.values)
          .filter(({ 0: name }) => !name.startsWith('_'))
          .map(({ 0: name, 1: values }) => [
            name,
            values.filter((_) => _.length <= 500),
          ])
      ),
    })
  );

export var defineFormsService = ({
  forms,
  submissions,
  files,
  markup,
  stamps,
  bus,
  clock,
  site,
  pages,
  notify,
  noticeLanguage,
  mail,
  webhooks,
  post,
  secret,
  report,
  kick,
}: FormsPorts) => {
  // Поля формы — по ревизии: HTML разбирается раз на правку, а не на каждый показ.
  const parsed = new Map<string, { revision: number; fields: FieldSpec[] }>();
  let rates = new Map<string, { start: number; count: number }>();
  let recent = new Map<string, number>();
  let confirmations: ConfirmationLog = new Map();
  let running: Promise<number> | null = null;

  const iso = (): string => clock().toISOString();

  const fieldsOf = (form: Form): FieldSpec[] =>
    ((cached) =>
      cached && cached.revision === form.revision
        ? cached.fields
        : ((fields) => (
            parsed.set(form.name, { revision: form.revision, fields }), fields
          ))(markup.fields(form.source)))(parsed.get(form.name));

  const find = (name: string): Form | null =>
    attempt(
      () => forms.get(parseFormName(name)),
      () => null
    );

  const publish = (events: readonly FormsEvent[]): void =>
    events.forEach((_) => void bus.publish(_ as FormsEvent & DomainEvent));

  // Поля сохраняемой формы: служебную cookie CMS не взять в поле, подписи скрытых полей — `значение=подпись`,
  // письму отправителю нужно поле адреса.
  const assertFields = (change: FormChange): FormChange =>
    ((fields) => (
      assertSources(fields),
      assertLabels(fields),
      assertConfirmation(fields, change.state.confirmation),
      change
    ))(markup.fields(change.state.source));

  const store = (change: FormChange): Form => (
    void (change.events.length > 0 && forms.save(change.state)),
    publish(change.events),
    change.state
  );

  const contextOf = (
    page: FormPage | null,
    query: Readonly<Record<string, string>>,
    referrer: string,
    cookie: (name: string) => string | null = _NO_COOKIE
  ): SourceContext => ({
    page,
    origin: site().url,
    query,
    cookie,
    referrer,
    siteName: site().name,
    field: (name) =>
      ((value) =>
        value === null || value === undefined ? null : String(value))(
        page?.fields[name]
      ),
    setting: pages.setting,
    now: iso(),
  });

  // Ссылка [~id~] в HTML формы (политика в согласии) — адрес страницы, как в контенте.
  const linked = (source: string): string =>
    source.includes('[~')
      ? source.replace(
          /\[~(\d+)~\]/g,
          (_match, id: string) => pages.page(Number(id))?.path ?? '#'
        )
      : source;

  const pageOf = (raw: string): FormPage | null =>
    /^\d+$/.test(raw) ? pages.page(Number(raw)) : null;

  // Окно отправок: фиксированное — тот, кто продолжает, ждёт конца окна, а не вечность.
  const limited = (key: string): boolean =>
    ((entry, now) =>
      entry !== undefined &&
      now - entry.start < _RATE_WINDOW_MS &&
      entry.count >= _RATE_LIMIT)(rates.get(key), clock().getTime());

  const count = (key: string): void => {
    const now = clock().getTime();
    const entry = rates.get(key);
    rates = new Map(
      [...rates]
        .filter(({ 1: _ }) => now - _.start < _RATE_WINDOW_MS)
        .slice(-5000)
    );
    rates.set(
      key,
      entry && now - entry.start < _RATE_WINDOW_MS
        ? { start: entry.start, count: entry.count + 1 }
        : { start: now, count: 1 }
    );
  };

  // Та же заявка за три минуты (двойной щелчок, F5 после ответа) — тот же успех без второй записи.
  const duplicate = (key: string): boolean => {
    const now = clock().getTime();
    const seen = (recent.get(key) ?? 0) > now;
    recent = new Map(
      [...recent, [key, now + _DUPLICATE_MS] as const]
        .filter(({ 1: until }) => until > now)
        .slice(-2000)
    );
    return seen;
  };

  const sent = (form: Form, back: string): SubmitResult => ({
    kind: 'sent',
    back,
    message: form.successText,
    redirect:
      form.successPage === null
        ? null
        : (pages.page(form.successPage)?.path ?? null),
    goal: form.goal,
  });

  // Скрытые поля, которые знает сервер (страница, сайт, время), — с сервера, а не из присланного; подписи
  // `data-labels` — и к ним.
  const withServerValues = (
    fields: readonly FieldSpec[],
    values: readonly Value[],
    context: SourceContext
  ): Value[] =>
    values.map((value) =>
      ((field) =>
        field?.kind === 'hidden' && field.source && !fromVisitor(field.source)
          ? fieldValue(field, [resolveSource(field.source, context)])
          : value)(fields.find((_) => _.name === value.name))
    );

  // Письмо отправителю — одно на адрес с формы за окно; журнал решает, слать ли.
  const confirm = (
    form: Form,
    fields: readonly FieldSpec[],
    values: readonly Value[],
    id: number
  ): void =>
    ((letter) =>
      void (
        letter &&
        ((decided) => (
          (confirmations = decided.log),
          decided.allowed && mail(letter, `confirmation:${id}`)
        ))(
          admitConfirmation(
            confirmations,
            form.name,
            letter.to,
            clock().getTime()
          )
        )
      ))(letterOf(form, fields, values));

  const queueWebhook = (form: Form, id: number): void =>
    void (
      form.webhook.url &&
      (webhooks.add(
        { submissionId: id, form: form.name, url: form.webhook.url },
        iso()
      ),
      kick())
    );

  const accept = (
    form: Form,
    input: SubmitInput,
    page: FormPage | null,
    values: Value[]
  ): SubmitResult => {
    const back = page?.path ?? '/';
    const fields = fieldsOf(form);
    const context = contextOf(
      page,
      {},
      _first(input.fields, '_ref'),
      input.cookie
    );
    const final = withServerValues(fields, values, context);
    // Имя файла вроде «site.com.pdf» — не ссылка: файлы фильтр спама не смотрит.
    const spam = looksLikeSpam(
      final.filter((_) => _.kind !== 'file'),
      form.allowLinks
    );
    const submission = {
      form: form.name,
      formTitle: form.title,
      values: final,
      context: {
        pageId: page?.id ?? null,
        pageTitle: page?.title ?? '',
        url: page ? `${site().url}${page.path}` : '',
        referrer: _first(input.fields, '_ref').slice(0, 500),
        utm: parseUtm(_first(input.fields, '_utm')),
      },
      // IPv4 за двойным стеком приходит как ::ffff:1.2.3.4 — храним привычный вид.
      ip: input.ip.replace(/^::ffff:/i, ''),
      userAgent: input.userAgent.slice(0, 500),
      status: (spam ? 'spam' : 'new') as SubmissionStatus,
      createdAt: iso(),
    };
    const id = submissions.add(submission);
    // Файлы — только у показанных полей и не у спама: спам с вложениями не должен раздувать базу.
    void (
      spam ||
      fields
        .filter(
          (_) =>
            _.kind === 'file' &&
            isShown(
              fields,
              shownValues(fields, input.fields, input.files ?? {}),
              _
            )
        )
        .forEach(
          (field) =>
            void uploadsOf(field, input.files?.[field.name] ?? []).forEach(
              (file) => void files.add(id, field.name, file)
            )
        )
    );
    publish([
      {
        type: 'forms.submission_received',
        submissionId: id,
        form: form.name,
        values: sentValues(final),
        labels: valueLabels(final),
        spam,
      },
    ]);
    // Спаму — ни уведомления, ни письма отправителю, ни вебхука: только запись, чтобы ошибку фильтра было видно.
    void (
      spam ||
      (notify(
        noticeOf(form, { ...submission, id }, site().url, noticeLanguage()),
        form.channels,
        `submission:${id}`
      ),
      confirm(form, fields, final, id),
      queueWebhook(form, id))
    );
    count(`${input.ip}|${form.name}`);
    return sent(form, back);
  };

  // Скрытые поля с источником на сервере — его значения ещё до проверки: присланное не решает условий.
  const trusted = (
    form: Form,
    input: SubmitInput,
    page: FormPage | null
  ): SubmitInput =>
    ((context) => ({
      ...input,
      fields: {
        ...input.fields,
        ...Object.fromEntries(
          fieldsOf(form)
            .filter(
              (_) => _.kind === 'hidden' && _.source && !fromVisitor(_.source)
            )
            .map((_) => [_.name, [resolveSource(_.source!, context)]])
        ),
      },
    }))(contextOf(page, {}, _first(input.fields, '_ref'), input.cookie));

  const submit = (name: string, posted: SubmitInput): SubmitResult => {
    const form = find(name);
    const page = pageOf(_first(posted.fields, '_page'));
    const input = form ? trusted(form, posted, page) : posted;
    const back = page?.path ?? '/';
    const language = page?.language || site().language;
    const messages = messagesFor(language);
    const token = _first(input.fields, '_stamp');
    const iat = Number(_first(input.fields, '_iat'));
    const checked = form
      ? checkValues(fieldsOf(form), input.fields, language, input.files)
      : null;
    return form === null || checked === null
      ? { kind: 'missing', back }
      : // Ловушку заполняют только боты: им — успех, в базу — ничего.
        _first(input.fields, HONEYPOT) !== ''
        ? sent(form, back)
        : !stamps.valid(form.name, token, iat)
          ? {
              kind: 'stale',
              back,
              message: messages.stale,
              stamp: stamps.issue(form.name),
            }
          : clock().getTime() - iat < form.minSeconds * 1000
            ? { kind: 'wait', back, message: messages.fast }
            : limited(`${input.ip}|${form.name}`)
              ? { kind: 'wait', back, message: messages.many }
              : Object.keys(checked.errors).length > 0
                ? {
                    kind: 'invalid',
                    back,
                    message: messages.invalid,
                    errors: checked.errors,
                  }
                : !stamps.spend(token) ||
                    duplicate(
                      `${form.name}|${input.ip}|${JSON.stringify(checked.values)}`
                    )
                  ? sent(form, back)
                  : accept(form, input, page, checked.values);
  };

  /** Форма для одного посетителя: свежая печать, скрытые поля по источникам, флеш после отправки без JS. */
  const render = (
    name: string,
    request: FormRequest,
    at: { readonly id: number } | null
  ): { readonly head: string; readonly body: string } => {
    const form = find(name);
    const flash = ((_) => (_?.form === name ? _ : null))(
      _decodeFlash(request.cookie(FLASH_COOKIE))
    );
    const page = at ? pages.page(at.id) : null;
    const referrer = request.header('referer') ?? '';
    const context = contextOf(page, request.query, referrer, request.cookie);
    return form === null
      ? { head: '', body: '' }
      : request.query.sent === name
        ? { head: markup.head, body: markup.sent(name, form.successText) }
        : {
            head: markup.head,
            body: markup.render({
              name: form.name,
              source: linked(form.source),
              submitLabel: form.submitLabel,
              goal: form.goal,
              action: `/_cms/forms/${form.name}`,
              pageId: page?.id ?? null,
              stamp: stamps.issue(form.name),
              utm: utmText(utmOf(request.query)),
              referrer: referrer.slice(0, 500),
              message: flash?.message ?? null,
              values: flash?.values ?? {},
              errors: flash?.errors ?? {},
              hidden: Object.fromEntries(
                fieldsOf(form)
                  .filter((_) => _.kind === 'hidden' && _.source)
                  .map((_) => [_.source!, resolveSource(_.source!, context)])
              ),
              texts: formTextsFor(page?.language || site().language),
            }),
          };
  };

  const load = (id: number): Submission =>
    submissions.get(id) ??
    fail('forms.submission_not_found', `No submission ${id}`);

  const saveSubmission = (change: SubmissionChange): Submission => (
    void (change.events.length > 0 && submissions.save(change.state)),
    publish(change.events),
    change.state
  );

  // Тело — из заявки на каждую попытку, адрес и секрет — нынешние у формы: поправили адрес — повтор уйдёт туда.
  const webhookRequest = (delivery: WebhookDelivery) =>
    ((submission, form) =>
      submission === null
        ? Promise.reject(_gone('The submission was removed'))
        : !form?.webhook.url
          ? Promise.reject(_gone('The form has no webhook any more'))
          : Promise.resolve({
              url: form.webhook.url,
              secret: form.webhook.secret,
              body: JSON.stringify(
                payloadOf(
                  submission,
                  files.list(submission.id).map((_) => _.name)
                )
              ),
            }))(submissions.get(delivery.submissionId), find(delivery.form));

  const webhookDelivered = (delivery: WebhookDelivery, url: string): void =>
    webhooks.mark(delivery.submissionId, {
      url,
      status: 'delivered',
      attempts: delivery.attempts + 1,
      nextAt: delivery.nextAt,
      lastError: '',
      deliveredAt: iso(),
    });

  // Попытки кончились — владелец сайта узнаёт об этом сбоем: заявка до CRM не дошла. Вебхук убрали из
  // формы — это его решение, а не сбой.
  const webhookFailed = (
    delivery: WebhookDelivery,
    url: string,
    failure: WebhookFailure,
    reported = true
  ): void => {
    const attempts = delivery.attempts + 1;
    const next = nextWebhookAttempt(attempts, failure, clock().getTime());
    webhooks.mark(delivery.submissionId, {
      url,
      status: next === null ? 'failed' : 'pending',
      attempts,
      nextAt: next === null ? delivery.nextAt : new Date(next).toISOString(),
      lastError: failure.message,
      deliveredAt: null,
    });
    void (
      next === null &&
      reported &&
      report({
        kind: 'forms.webhook_failed',
        severity: 'error',
        title: {
          en: `A submission of form ${delivery.form} did not reach its webhook`,
          de: `Eine Anfrage des Formulars ${delivery.form} hat den Webhook nicht erreicht`,
          ru: `Заявка формы ${delivery.form} не дошла до вебхука`,
        },
        detail: `#${delivery.submissionId}: ${failure.message}`,
        key: `forms.webhook_failed:${delivery.form}`,
      })
    );
  };

  const messageOf = (error: unknown): string =>
    (
      (error instanceof Error ? error.message : String(error)) || 'unknown'
    ).slice(0, 500);

  const sendWebhook = (delivery: WebhookDelivery): Promise<void> =>
    Promise.resolve(delivery)
      .then(webhookRequest)
      .then(
        (request) =>
          post(request.url, request.body, request.secret).then(
            (answer) =>
              ((failure) =>
                failure
                  ? webhookFailed(delivery, request.url, failure)
                  : webhookDelivered(delivery, request.url))(
                answerFailure(answer.status, answer.text)
              ),
            (error: unknown) =>
              webhookFailed(delivery, request.url, {
                permanent: false,
                message: messageOf(error),
              })
          ),
        (error: unknown) =>
          webhookFailed(
            delivery,
            delivery.url,
            { permanent: true, message: messageOf(error) },
            false
          )
      );

  // По одной: приёмник — обычно один CRM, ему не нужна пачка одновременных запросов.
  const drainWebhooks = (): Promise<number> =>
    Promise.resolve(webhooks.due(iso(), _WEBHOOK_BATCH)).then((due) =>
      due
        .reduce<Promise<void>>(
          (chain, delivery) => chain.then(() => sendWebhook(delivery)),
          Promise.resolve()
        )
        .then(() => due.length)
    );

  return {
    forms: {
      list: (): FormSummary[] =>
        forms.list().map((_) => ({
          name: _.name,
          title: _.title,
          revision: _.revision,
          updatedAt: _.updatedAt,
          fields: fieldsOf(_).length,
        })),
      get: (name: string): (Form & { fields: FieldSpec[] }) | null =>
        ((form) => form && { ...form, fields: fieldsOf(form) })(find(name)),
      /** Поля несохранённого HTML — редактор показывает, что увидит сервер. */
      fieldsOf: (source: string): FieldSpec[] => markup.fields(source),
      /** Несохранённая форма как у посетителя — для предпросмотра в редакторе. */
      preview: (input: {
        readonly source?: unknown;
        readonly submitLabel?: unknown;
      }): { readonly head: string; readonly body: string } => ({
        head: markup.head,
        body: markup.render({
          name: 'preview',
          source: linked(String(input.source ?? '')),
          submitLabel:
            (typeof input.submitLabel === 'string' &&
              input.submitLabel.trim()) ||
            defaultsFor(site().language).submitLabel,
          goal: '',
          action: '#',
          pageId: null,
          stamp: { token: '', iat: 0 },
          utm: '',
          referrer: '',
          message: null,
          values: {},
          errors: {},
          hidden: {},
          texts: formTextsFor(site().language),
        }),
      }),
      sources: SOURCES,
      exists: (name: string): boolean => find(name) !== null,
      save: (name: string, input: FormInput): Form =>
        pipe(
          parseFormName,
          (formName) =>
            ((existing, setup) =>
              existing
                ? editForm(input, iso(), setup)(existing)
                : createForm(formName, input, iso(), setup))(
              forms.get(formName),
              { language: site().language, secret: secret() }
            ),
          assertFields,
          store
        )(name),
      remove: (name: string): void =>
        ((form) =>
          form
            ? (forms.remove(form.name), publish(removeForm(form).events))
            : fail('forms.form_not_found', `No form "${name}"`))(find(name)),
    },
    render,
    submit,
    /**
     * Что принять до чтения тела: формы нет, с адреса уже слишком много отправок, форма с файлами (большое
     * тело) или без. Так тело в 50 МБ не читается ради несуществующей формы или формы без файлов.
     */
    intake: (name: string, ip: string): Intake =>
      ((form) =>
        form === null
          ? 'missing'
          : limited(`${ip}|${form.name}`)
            ? 'limited'
            : fieldsOf(form).some((_) => _.kind === 'file')
              ? 'files'
              : 'plain')(find(name)),
    inbox: {
      stats: (): InboxStats =>
        ((now) =>
          submissions.stats(
            now.toISOString(),
            `${now.toISOString().slice(0, 10)}T00:00:00.000Z`
          ))(clock()),
      list: (query: SubmissionQuery): Submission[] => submissions.list(query),
      /** Заявка для менеджера: первое открытие делает её прочитанной. */
      open: (id: number, userId: number): Submission =>
        saveSubmission(markRead(userId, iso())(load(id))),
      change: (
        id: number,
        changes: { readonly status?: unknown; readonly note?: unknown }
      ): Submission =>
        saveSubmission(changeSubmission(changes, iso())(load(id))),
      /** Файлы заявки — без содержимого. */
      files: (id: number): SubmissionFile[] => files.list(load(id).id),
      /** Файл заявки для скачивания; чужой заявки — нет. */
      file: (
        id: number,
        fileId: number
      ): SubmissionFile & { readonly bytes: Uint8Array } =>
        ((file) =>
          file && file.submissionId === id
            ? file
            : fail('forms.file_not_found', `No file ${fileId} in ${id}`))(
          files.get(fileId)
        ),
      remove: (id: number): void =>
        ((submission) => (
          submissions.remove(id),
          files.removeOrphans(),
          webhooks.removeOrphans(),
          publish([
            {
              type: 'forms.submission_removed',
              submissionId: id,
              form: submission.form,
            },
          ])
        ))(load(id)),
    },
    webhooks: {
      /** Проход очереди вебхуков; одновременно идёт только один. */
      run: (): Promise<number> =>
        running ??
        (running = drainWebhooks().finally(() => {
          running = null;
        })),
      /** Как заявка ушла на вебхук; null — не уходила. */
      of: (id: number): WebhookDelivery | null => webhooks.get(id),
      /** Ещё раз — сейчас и с полным расписанием повторов. */
      retry: (id: number): void =>
        ((delivery) =>
          delivery
            ? (webhooks.mark(id, {
                url: delivery.url,
                status: 'pending',
                attempts: 0,
                nextAt: iso(),
                lastError: delivery.lastError,
                deliveredAt: null,
              }),
              kick())
            : fail(
                'forms.no_webhook',
                `Submission ${id} was not sent to a webhook`
              ))(webhooks.get(id)),
    },
    /** Заявки старше срока своей формы; у удалённых форм — старше 30 дней. */
    purge: (): number => {
      const now = clock().getTime();
      const before = (days: number): string =>
        new Date(now - days * 86_400_000).toISOString();
      const all = forms.list();
      // Файлы и доставки вебхука уходят вместе со своими заявками.
      return ((removed) => (
        files.removeOrphans(), webhooks.removeOrphans(), removed
      ))(
        all.reduce(
          (sum, form) =>
            sum + submissions.purge(form.name, before(form.retentionDays), []),
          0
        ) +
          submissions.purge(
            null,
            before(_ORPHAN_DAYS),
            all.map((_) => _.name)
          )
      );
    },
  };
};

export type FormsService = ReturnType<typeof defineFormsService>;
