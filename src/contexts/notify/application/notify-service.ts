import { attempt, fail } from '../../../shared/kernel/errors.ts';
import {
  type Localized,
  localized,
  type ManagerLanguage,
  managerLanguageOf,
  textIn,
} from '../../../shared/kernel/manager-language.ts';
import {
  type Delivery,
  failureOf,
  nextAttempt,
  type SendFailure,
} from '../domain/delivery.ts';
import {
  admit,
  EMPTY_THROTTLE,
  fingerprintOf,
  type Incident,
  type Verdict,
} from '../domain/incident.ts';
import {
  atLeast,
  type ChannelKind,
  type Message,
  message,
} from '../domain/message.ts';
import type {
  IncidentRecord,
  IncidentRepository,
  OutboxRepository,
  SettingsRepository,
  Transports,
} from '../domain/ports.ts';
import {
  type Chat,
  type NotifySettings,
  type NotifyStatus,
  parseSettings,
  statusOf,
} from '../domain/settings.ts';

/** Сайт глазами уведомлений: имя — подпись, адрес — ссылки в менеджер, язык — язык уведомлений по умолчанию. */
export type SiteFacts = {
  readonly name: string;
  readonly url: string;
  readonly language: string;
};

export type NotifyPorts = {
  readonly settings: SettingsRepository;
  readonly outbox: OutboxRepository;
  readonly incidents: IncidentRepository;
  readonly transports: Transports;
  readonly clock: () => Date;
  readonly site: () => SiteFacts;
  /** Очередь пополнилась: отправить сейчас, не дожидаясь расписания. */
  readonly kick: () => void;
};

/** Сколько строк очереди отправляется за один проход; остальные — в следующий. */
const _BATCH = 50;

/** Отправленное и журнал сбоев хранятся месяц. */
const _KEEP_MS = 30 * 24 * 60 * 60 * 1000;

const _HOLD: Verdict = { kind: 'hold' };

const _permanent = (text: string): SendFailure & Error =>
  Object.assign(new Error(text), { permanent: true, retryAfter: null });

type _Texts = {
  readonly repeated: string;
  readonly times: (repeats: number, since: string) => string;
  readonly log: string;
  readonly floodTitle: string;
  readonly floodText: string;
  readonly notDelivered: (title: string) => string;
  readonly testTitle: string;
  readonly testText: (site: string) => string;
};

const _times = (
  language: ManagerLanguage,
  n: number,
  forms: Readonly<Record<string, string>>
) => forms[new Intl.PluralRules(language).select(n)] ?? forms.other!;

// Тексты уведомлений, которые собирает сам notify; язык — из настроек уведомлений.
const _TEXTS: Readonly<Record<ManagerLanguage, _Texts>> = {
  en: {
    repeated: 'Repeated',
    times: (n, since) =>
      `${n} ${_times('en', n, { one: 'time', other: 'times' })} since ${since}`,
    log: 'Incident log',
    floodTitle: 'Too many incidents',
    floodText:
      'No more incident notifications until the end of the hour: see the incident log in the manager.',
    notDelivered: (title) => `Not delivered: ${title}`,
    testTitle: 'Notification test',
    testText: (site) =>
      `The channel works: submissions and incidents of “${site}” will arrive here.`,
  },
  de: {
    repeated: 'Wiederholt',
    times: (n, since) => `${n}-mal seit ${since}`,
    log: 'Fehlerprotokoll',
    floodTitle: 'Zu viele Fehler',
    floodText:
      'Bis zum Ende der Stunde gehen keine Fehlermeldungen mehr raus: Sehen Sie im Fehlerprotokoll des Managers nach.',
    notDelivered: (title) => `Nicht zugestellt: ${title}`,
    testTitle: 'Test der Benachrichtigungen',
    testText: (site) =>
      `Der Kanal funktioniert: Hier kommen Anfragen und Fehler der Website „${site}“ an.`,
  },
  ru: {
    repeated: 'Повторялось',
    times: (n, since) =>
      `${n} ${_times('ru', n, { one: 'раз', few: 'раза', many: 'раз', other: 'раза' })} с ${since}`,
    log: 'Журнал сбоев',
    floodTitle: 'Сбоев слишком много',
    floodText:
      'До конца часа уведомления о сбоях не отправляются — смотрите журнал сбоев в менеджере.',
    notDelivered: (title) => `Не доставлено: ${title}`,
    testTitle: 'Проверка уведомлений',
    testText: (site) =>
      `Канал настроен: сюда придут заявки и сбои сайта «${site}».`,
  },
};

// В журнал — не длиннее предела на каждом языке.
const _clip = (text: Localized | string, max: number): Localized | string =>
  typeof text === 'string'
    ? text.slice(0, max)
    : localized((_) => text[_].slice(0, max));

export var defineNotifyService = ({
  settings,
  outbox,
  incidents,
  transports,
  clock,
  site,
  kick,
}: NotifyPorts) => {
  let throttle = EMPTY_THROTTLE;
  let running: Promise<number> | null = null;

  const iso = (): string => clock().toISOString();

  /** Язык уведомлений: из настроек, иначе язык сайта, если менеджер его знает. */
  const language = (): ManagerLanguage =>
    settings.get().language ?? managerLanguageOf(site().language);

  const recipientsOf: Readonly<
    Record<ChannelKind, (current: NotifySettings) => string[]>
  > = {
    telegram: (current) => current.telegram?.chats.map((_) => _.id) ?? [],
    email: (current) => (current.email ? [current.email.to.join(',')] : []),
  };

  /** В очередь каждому адресату каждого настроенного канала; строки очереди по id. */
  const enqueue = (
    item: Message,
    channels: readonly ChannelKind[],
    source: string | null
  ): number[] => {
    const current = settings.get();
    const stamped = { ...item, language: item.language ?? language() };
    const ids = channels.flatMap((channel) =>
      recipientsOf[channel](current).map((recipient) =>
        outbox.add({ channel, recipient, message: stamped, source }, iso())
      )
    );
    void (ids.length > 0 && kick());
    return ids;
  };

  const _SEND: Readonly<
    Record<
      ChannelKind,
      (current: NotifySettings, delivery: Delivery) => Promise<void>
    >
  > = {
    telegram: (current, delivery) =>
      current.telegram
        ? transports.telegram.send(
            current.telegram,
            delivery.recipient,
            delivery.message,
            site().name
          )
        : Promise.reject(_permanent('Telegram is not configured')),
    email: (current, delivery) =>
      current.email
        ? transports.email.send(
            current.email,
            delivery.recipient.split(','),
            delivery.message,
            site().name
          )
        : Promise.reject(_permanent('Email is not configured')),
  };

  const incidentMessage = (
    incident: Incident,
    repeats: number,
    record: IncidentRecord
  ): Message =>
    ((lang) =>
      message({
        topic: 'incidents',
        severity: incident.severity,
        title: textIn(incident.title, lang),
        fields:
          repeats > 0
            ? [
                {
                  label: _TEXTS[lang].repeated,
                  value: _TEXTS[lang].times(repeats, record.firstAt),
                },
              ]
            : [],
        text: textIn(incident.detail, lang),
        mono: true,
        link: site().url
          ? {
              label: _TEXTS[lang].log,
              url: `${site().url}/manager/settings?tab=notify`,
            }
          : null,
        language: lang,
      }))(language());

  const _FLOOD = (): Message =>
    ((lang) =>
      message({
        topic: 'incidents',
        severity: 'critical',
        title: _TEXTS[lang].floodTitle,
        text: _TEXTS[lang].floodText,
        language: lang,
      }))(language());

  // Сбой отправки, сам отчёт о сбое и любая ошибка внутри не роняют того, кто сообщил.
  const report = (incident: Incident): void =>
    attempt(
      () => {
        const current = settings.get();
        const fingerprint = fingerprintOf(incident);
        const record = incidents.record(
          {
            fingerprint,
            kind: incident.kind,
            severity: incident.severity,
            title: _clip(incident.title, 300),
            detail: _clip(incident.detail, 4000),
          },
          iso()
        );
        const decided = atLeast(incident.severity, current.level)
          ? admit(throttle, fingerprint, clock().getTime())
          : { state: throttle, verdict: _HOLD };
        throttle = decided.state;
        const channels = current.incidents.filter(
          (_) => !(incident.avoid ?? []).includes(_)
        );
        void (
          decided.verdict.kind === 'send' &&
          enqueue(
            incidentMessage(incident, decided.verdict.repeats, record),
            channels,
            `incident:${record.id}`
          )
        );
        void (
          decided.verdict.kind === 'flood' && enqueue(_FLOOD(), channels, null)
        );
      },
      () => undefined
    );

  // Попытки кончились: о недоставленной заявке — другим каналом; о недоставленном сбое — только журнал.
  const exhausted = (delivery: Delivery, failure: SendFailure): void =>
    void (
      delivery.message.topic !== 'incidents' &&
      report({
        kind: 'notify.delivery_failed',
        severity: 'critical',
        title: localized((_) => _TEXTS[_].notDelivered(delivery.message.title)),
        detail: `${delivery.channel} → ${delivery.recipient}: ${failure.message}`,
        key: `notify.delivery_failed:${delivery.channel}`,
        avoid: [delivery.channel],
      })
    );

  const sent = (delivery: Delivery) => (): void =>
    outbox.mark(delivery.id, {
      status: 'sent',
      attempts: delivery.attempts + 1,
      nextAt: delivery.nextAt,
      lastError: '',
      sentAt: iso(),
    });

  const failed =
    (delivery: Delivery) =>
    (error: unknown): void => {
      const failure = failureOf(error);
      const attempts = delivery.attempts + 1;
      const next = nextAttempt(attempts, failure, clock().getTime());
      outbox.mark(delivery.id, {
        status: next === null ? 'failed' : 'pending',
        attempts,
        nextAt: next === null ? delivery.nextAt : new Date(next).toISOString(),
        lastError: failure.message,
        sentAt: null,
      });
      void (next === null && exhausted(delivery, failure));
    };

  const send = (delivery: Delivery): Promise<void> =>
    Promise.resolve(settings.get())
      .then((current) => _SEND[delivery.channel](current, delivery))
      .then(sent(delivery), failed(delivery));

  // По одной: лимиты Telegram и почтовых серверов — на частоту, а не на объём.
  const drain = (): Promise<number> =>
    Promise.resolve(outbox.due(iso(), _BATCH)).then((due) =>
      due
        .reduce<Promise<void>>(
          (chain, delivery) => chain.then(() => send(delivery)),
          Promise.resolve()
        )
        .then(() => due.length)
    );

  const savedTelegram = (input: Record<string, unknown>) =>
    ((token, proxy) =>
      token
        ? { token, proxy }
        : fail('notify.no_token', 'The bot token is required'))(
      (typeof input.token === 'string' && input.token.trim()) ||
        settings.get().telegram?.token ||
        '',
      typeof input.proxy === 'string'
        ? input.proxy.trim()
        : (settings.get().telegram?.proxy ?? '')
    );

  const testMessage = (): Message =>
    ((lang) =>
      message({
        topic: 'test',
        title: _TEXTS[lang].testTitle,
        text: _TEXTS[lang].testText(site().name),
        language: lang,
      }))(language());

  const _TEST: Readonly<Record<ChannelKind, () => Promise<void>>> = {
    telegram: () =>
      ((current) =>
        current
          ? current.chats.length > 0
            ? Promise.all(
                current.chats.map((_) =>
                  transports.telegram.send(
                    current,
                    _.id,
                    testMessage(),
                    site().name
                  )
                )
              ).then(() => undefined)
            : Promise.reject(fail('notify.no_chats', 'Add a chat first'))
          : Promise.reject(
              fail('notify.not_configured', 'Telegram is not configured')
            ))(settings.get().telegram),
    email: () =>
      ((current) =>
        current
          ? transports.email.send(
              current,
              current.to,
              testMessage(),
              site().name
            )
          : Promise.reject(
              fail('notify.not_configured', 'Email is not configured')
            ))(settings.get().email),
  };

  return {
    language,
    settings: {
      status: (): NotifyStatus => statusOf(settings.get()),
      save: (input: Record<string, unknown>): NotifyStatus =>
        ((next) => (settings.save(next), statusOf(next)))(
          parseSettings(input, settings.get())
        ),
    },
    /** Уведомление в очередь: заявка — по маршруту форм или своим каналам формы. */
    send: (
      item: Message,
      channels: readonly ChannelKind[] | null,
      source: string | null
    ): number[] => enqueue(item, channels ?? settings.get().forms, source),
    /** Тестовое сообщение сразу, мимо очереди: ошибку канала видно в форме. */
    test: (channel: ChannelKind): Promise<void> =>
      Promise.resolve()
        .then(
          () =>
            _TEST[channel]?.() ??
            fail('notify.invalid_channel', `No channel ${channel}`)
        )
        .then(undefined, (error) =>
          fail('notify.test_failed', failureOf(error).message)
        ),
    /**
     * Письмо одному адресату сразу, мимо очереди: в очереди и журнале не остаётся того, что в письме
     * (ссылка сброса пароля). Не ушло — отказ, повторов нет.
     */
    email: {
      ready: (): boolean => settings.get().email !== null,
      send: (to: string, item: Message): Promise<void> =>
        ((current) =>
          current
            ? transports.email.send(current, [to], item, site().name)
            : Promise.reject(
                fail('notify.not_configured', 'Email is not configured')
              ))(settings.get().email),
    },
    telegram: {
      me: (input: Record<string, unknown> = {}): Promise<string> =>
        Promise.resolve(input).then(savedTelegram).then(transports.telegram.me),
      /** Чаты, которые писали боту или куда его добавили: из них выбирают, куда слать. */
      chats: (input: Record<string, unknown> = {}): Promise<Chat[]> =>
        Promise.resolve(input)
          .then(savedTelegram)
          .then(transports.telegram.chats),
    },
    outbox: {
      /** Проход очереди; одновременно идёт только один. */
      run: (): Promise<number> =>
        running ??
        (running = drain().finally(() => {
          running = null;
        })),
      recent: (limit = 50): Delivery[] => outbox.recent(limit),
      bySource: outbox.bySource,
      /** Ещё раз — сейчас и с полным расписанием повторов. */
      retry: (id: number): void =>
        ((delivery) =>
          delivery
            ? (outbox.mark(id, {
                status: 'pending',
                attempts: 0,
                nextAt: iso(),
                lastError: delivery.lastError,
                sentAt: null,
              }),
              kick())
            : fail('notify.delivery_not_found', `No delivery ${id}`))(
          outbox.get(id)
        ),
    },
    incidents: {
      report,
      list: (limit = 100): IncidentRecord[] => incidents.list(limit),
    },
    /** Отправленное и журнал сбоев старше месяца. */
    purge: (): void =>
      ((before) => void (outbox.purge(before), incidents.purge(before)))(
        new Date(clock().getTime() - _KEEP_MS).toISOString()
      ),
  };
};

export type NotifyService = ReturnType<typeof defineNotifyService>;
