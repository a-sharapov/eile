import { fail } from '../../../shared/kernel/errors.ts';
import { CODE_LIMITS, isCode } from './codes.ts';
import {
  buildLabel,
  fillTarget,
  GO_PREFIX,
  LABEL_TOKEN,
  type LabelNote,
  parseLabel,
  partsOfVisit,
  UTM_PARAMETERS,
  type ValueState,
  valueState,
} from './labels.ts';
import type { VisitSource } from './ports.ts';
import type { GoLink, LabelSchema, Parts, Setup } from './setup.ts';

export var REGISTRY_LIMITS = {
  labels: 10_000,
  name: 100,
  /** Текст проверки: метка или адрес. */
  check: 2000,
  page: 500,
} as const;

/** Что выдать: отправитель, части, название, переход и страница для ссылки на сайт. */
export type LabelInput = {
  readonly sender?: unknown;
  readonly parts?: unknown;
  readonly name?: unknown;
  readonly link?: unknown;
  readonly page?: unknown;
};

/** Проверенная выдача: метка из частей по схеме отправителя. */
export type LabelPlan = {
  readonly sender: string;
  readonly label: string;
  readonly name: string;
  /** Все части метки: присланные и заданные заранее частями перехода. */
  readonly parts: Parts;
  readonly link: GoLink | null;
  readonly page: string;
};

/** Откуда проверка взяла метку: UTM адреса, переход `/_cms/go/<код>`, адрес назначения перехода, сама метка. */
export type LabelFrom = 'utm' | 'go' | 'link' | 'label';

export type PartState = ValueState | 'empty';

/** Прочитанный текст проверки: метка и чья она; разбор и запись реестра добавляет сервис. */
export type LabelReading = {
  readonly from: LabelFrom;
  readonly sender: string | null;
  readonly label: string;
  readonly link: string | null;
};

/** Части метки по порядку схемы с состоянием значения: знакомое, в архиве, незнакомое, пустое. */
export type CheckedPart = {
  readonly part: string;
  readonly value: string | null;
  readonly state: PartState;
};

const _PAGE = /^\/[^\s?#]*$/;

const _invalid = (message: string): never =>
  fail('analytics.invalid_label', message);

const _isRecord = (raw: unknown): raw is Readonly<Record<string, unknown>> =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw);

const _length = (text: string): number => [...text].length;

/** Название метки в реестре: 1–100 знаков. */
export var labelName = (raw: unknown): string =>
  ((text) =>
    text !== null && _length(text) >= 1 && _length(text) <= REGISTRY_LIMITS.name
      ? text
      : _invalid(`The name is 1 to ${REGISTRY_LIMITS.name} characters`))(
    typeof raw === 'string' ? raw.trim() : null
  );

const _schemas = (setup: Setup): readonly LabelSchema[] =>
  setup.schemas.filter((_) => _.archivedAt === null);

// Отправитель выдачи — названный или единственный со схемой; схема и отправитель — не в архиве.
const _schemaOf = (setup: Setup, raw: unknown): LabelSchema =>
  raw === undefined || raw === null || raw === ''
    ? ((schemas) =>
        schemas.length === 1
          ? (schemas[0] as LabelSchema)
          : schemas.length === 0
            ? _invalid('The site has no label schema: create one first')
            : fail(
                'analytics.sender_required',
                `Several senders have a label schema: name one of ${schemas.map((_) => _.sender).join(', ')}`
              ))(_schemas(setup))
    : !isCode(raw, CODE_LIMITS.sender)
      ? _invalid('sender is a sender code')
      : ((schema, sender) =>
          sender === undefined || sender.archivedAt !== null
            ? _invalid(`There is no active sender ${raw}`)
            : (schema ??
              _invalid(`Sender ${raw} has no label schema: create one first`)))(
          _schemas(setup).find((_) => _.sender === raw),
          setup.senders.find((_) => _.code === raw)
        );

const _linkOf = (setup: Setup, raw: unknown, sender: string): GoLink | null =>
  raw === undefined || raw === null || raw === ''
    ? null
    : ((link) =>
        link === undefined || link.sender !== sender
          ? _invalid(`There is no link ${String(raw)} of sender ${sender}`)
          : link.archivedAt !== null
            ? _invalid(`Link ${link.code} is archived`)
            : link)(
        isCode(raw, CODE_LIMITS.link)
          ? setup.links.find((_) => _.code === raw)
          : undefined
      );

// Части выдачи: только части схемы, значения — из справочников и не в архиве; все отказы — одним списком.
const _partsOf = (setup: Setup, schema: LabelSchema, raw: unknown): Parts =>
  !_isRecord(raw) && raw !== undefined && raw !== null
    ? _invalid('parts is an object { part: value }')
    : ((entries) =>
        ((problems) =>
          problems.length > 0
            ? _invalid(problems.join('; '))
            : Object.fromEntries(entries as [string, string][]))(
          entries.flatMap(({ 0: part, 1: value }) =>
            !schema.parts.includes(part)
              ? [
                  `${part} is not a part of the label schema of ${schema.sender}`,
                ]
              : typeof value !== 'string' ||
                  valueState(setup, part, value) !== 'known'
                ? [
                    `${part}: "${String(value)}" is not an active value of the part — create the value first`,
                  ]
                : []
          )
        ))(
        Object.entries(_isRecord(raw) ? raw : {}).filter(
          ({ 1: value }) => value !== '' && value !== null
        )
      );

const _merged = (parts: Parts, link: GoLink | null): Parts =>
  link === null
    ? parts
    : ((clash) =>
        clash === undefined
          ? { ...parts, ...link.parts }
          : _invalid(
              `${clash}: link ${link.code} sets "${link.parts[clash]}", not "${parts[clash]}"`
            ))(
        Object.keys(parts).find(
          (_) => Object.hasOwn(link.parts, _) && link.parts[_] !== parts[_]
        )
      );

const _page = (raw: unknown): string =>
  raw === undefined || raw === null || raw === ''
    ? '/'
    : typeof raw === 'string' &&
        raw.length <= REGISTRY_LIMITS.page &&
        _PAGE.test(raw)
      ? raw
      : _invalid('page is a path of the site /… without ? and #');

/**
 * Выдача метки: отправитель со схемой, части из справочников (не в архиве), переход того же отправителя — его
 * заданные части дополняют присланные, расхождение — отказ; хоть одна часть обязательна. Отказ —
 * `analytics.invalid_label` с перечнем.
 */
export var planLabel = (setup: Setup, input: LabelInput): LabelPlan =>
  ((schema) =>
    ((link) =>
      ((parts) =>
        ((label) =>
          label === ''
            ? _invalid('A label needs at least one part with a value')
            : {
                sender: schema.sender,
                label,
                name: labelName(input.name),
                parts: Object.fromEntries(
                  schema.parts.flatMap((_) =>
                    Object.hasOwn(parts, _) ? [[_, parts[_] as string]] : []
                  )
                ),
                link,
                page: _page(input.page),
              })(buildLabel(schema, parts)))(
        _merged(_partsOf(setup, schema, input.parts), link)
      ))(_linkOf(setup, input.link, schema.sender)))(
    _schemaOf(setup, input.sender)
  );

/**
 * Прямая ссылка: адрес назначения перехода с меткой — названного или единственного у отправителя не в архиве;
 * иначе null.
 */
export var directLink = (setup: Setup, plan: LabelPlan): string | null =>
  ((link) => (link === null ? null : fillTarget(link.target, plan.label)))(
    plan.link ??
      ((links) => (links.length === 1 ? (links[0] as GoLink) : null))(
        setup.links.filter(
          (_) => _.sender === plan.sender && _.archivedAt === null
        )
      )
  );

/** Ссылка на сайт: адрес сайта, страница и UTM частей, у которых есть параметр; адреса сайта нет — null. */
export var siteLink = (
  setup: Setup,
  plan: LabelPlan,
  siteUrl: string
): string | null =>
  ((query) =>
    siteUrl === ''
      ? null
      : (URL.parse(`${plan.page}${query === '' ? '' : `?${query}`}`, siteUrl)
          ?.href ?? null))(
    new URLSearchParams(
      UTM_PARAMETERS.flatMap((utm): [string, string][] =>
        ((part) =>
          part !== undefined && Object.hasOwn(plan.parts, part.code)
            ? [[utm, plan.parts[part.code] as string]]
            : [])(
          setup.dictionaries.find((_) => _.purpose === 'parts' && _.utm === utm)
        )
      )
    ).toString()
  );

const _sourceOf = (params: URLSearchParams): VisitSource => ({
  utmSource: params.get('utm_source') ?? '',
  utmMedium: params.get('utm_medium') ?? '',
  utmCampaign: params.get('utm_campaign') ?? '',
  utmContent: params.get('utm_content') ?? '',
  utmTerm: params.get('utm_term') ?? '',
  referrer: '',
});

const _hasUtm = (params: URLSearchParams): boolean =>
  UTM_PARAMETERS.some((_) => (params.get(_) ?? '').trim() !== '');

// Отправитель проверки: названный, иначе единственный со схемой; схем нет — без отправителя.
const _senderOf = (setup: Setup, raw: unknown): string | null =>
  raw === undefined || raw === null || raw === ''
    ? ((schemas) =>
        schemas.length === 0
          ? null
          : schemas.length === 1
            ? (schemas[0] as LabelSchema).sender
            : fail(
                'analytics.sender_required',
                `Several senders have a label schema: name one of ${schemas.map((_) => _.sender).join(', ')}`
              ))(setup.schemas)
    : isCode(raw, CODE_LIMITS.sender) &&
        setup.senders.some((_) => _.code === raw)
      ? raw
      : fail('analytics.invalid_query', `There is no sender ${String(raw)}`);

const _schemaFor = (setup: Setup, sender: string | null): LabelSchema | null =>
  sender === null
    ? null
    : (setup.schemas.find((_) => _.sender === sender) ?? null);

const _built = (setup: Setup, sender: string | null, parts: Parts): string =>
  ((schema) =>
    schema === null
      ? ''
      : buildLabel(
          schema,
          Object.fromEntries(
            Object.entries(parts).filter(({ 0: part }) =>
              schema.parts.includes(part)
            )
          )
        ))(_schemaFor(setup, sender));

// Адрес назначения перехода вокруг `{label}`: совпали начало и конец — метка в середине; длиннейшее совпадение.
const _targetMatch = (
  setup: Setup,
  text: string
): { readonly link: GoLink; readonly label: string } | null =>
  setup.links
    .flatMap((link) =>
      ((head, tail) =>
        text.length > head.length + tail.length &&
        text.startsWith(head) &&
        text.endsWith(tail)
          ? [
              {
                link,
                label: text.slice(head.length, text.length - tail.length),
                size: head.length + tail.length,
              },
            ]
          : [])(
        link.target.slice(0, link.target.indexOf(LABEL_TOKEN)),
        link.target.slice(link.target.indexOf(LABEL_TOKEN) + LABEL_TOKEN.length)
      )
    )
    .toSorted((a, b) => b.size - a.size)
    .map((_) => ({ link: _.link, label: _.label }))[0] ?? null;

const _goLink = (setup: Setup, url: URL | null): GoLink | null =>
  url?.pathname.startsWith(GO_PREFIX)
    ? (setup.links.find(
        (_) => _.code === url.pathname.slice(GO_PREFIX.length)
      ) ?? null)
    : null;

/**
 * Текст проверки: адрес с `utm_*` — части из UTM, как у перехода (у адреса перехода — с его заданными частями);
 * адрес `…/_cms/go/<код>` — заданные части перехода; адрес назначения перехода — метка из середины; иначе —
 * сама метка.
 */
export var readLabelText = (
  setup: Setup,
  raw: unknown,
  sender: unknown
): LabelReading =>
  ((text) =>
    ((url, ask) =>
      ((go) =>
        url !== null && _hasUtm(url.searchParams)
          ? ((owner) => ({
              from: 'utm' as const,
              sender: owner,
              label: _built(setup, owner, {
                ...partsOfVisit(_sourceOf(url.searchParams), setup),
                ...(go?.parts ?? {}),
              }),
              link: go?.code ?? null,
            }))(go?.sender ?? ask())
          : go !== null
            ? {
                from: 'go' as const,
                sender: go.sender,
                label: _built(setup, go.sender, go.parts),
                link: go.code,
              }
            : ((found) =>
                found !== null
                  ? {
                      from: 'link' as const,
                      sender: found.link.sender,
                      label: found.label.toLowerCase(),
                      link: found.link.code,
                    }
                  : {
                      from: 'label' as const,
                      sender: ask(),
                      label: text.toLowerCase(),
                      link: null,
                    })(_targetMatch(setup, text)))(_goLink(setup, url)))(
      /^https?:\/\//i.test(text) ? URL.parse(text) : null,
      () => _senderOf(setup, sender)
    ))(
    typeof raw === 'string' && raw.length <= REGISTRY_LIMITS.check
      ? raw.trim()
      : fail(
          'analytics.invalid_query',
          `text is a label or an address up to ${REGISTRY_LIMITS.check} characters`
        )
  );

/** Разбор прочитанной метки по схеме: части по порядку схемы с состоянием и замечания. */
export var checkParts = (
  setup: Setup,
  reading: LabelReading
): {
  readonly parts: readonly CheckedPart[];
  readonly notes: readonly LabelNote[];
} =>
  ((schema) =>
    ((parsed) => ({
      parts:
        schema === null
          ? []
          : schema.parts.map((part) =>
              ((value) => ({
                part,
                value,
                state:
                  value === null
                    ? ('empty' as const)
                    : valueState(setup, part, value),
              }))(
                Object.hasOwn(parsed.parts, part)
                  ? (parsed.parts[part] as string)
                  : null
              )
            ),
      notes: parsed.notes,
    }))(parseLabel(schema, reading.label)))(_schemaFor(setup, reading.sender));
