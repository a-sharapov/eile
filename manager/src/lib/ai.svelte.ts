import { t } from './i18n.ts';
import { session } from './session.svelte.ts';

/** Что генерируем — так же, как на сервере (`assistant/domain/prompt.ts`). */
export type AiKind =
  | 'text'
  | 'longtext'
  | 'richtext'
  | 'template'
  | 'component'
  | 'plugin';

/** Поле для ИИ: подпись, подсказка, текущее значение и ограничения. */
export type AiTarget = {
  readonly kind: AiKind;
  readonly label: string;
  readonly hint?: string;
  readonly value: string;
  readonly maxLength?: number | null;
  readonly pattern?: string;
  /** Путь картинки медиатеки, которую описывают: модель, которая видит, получит её саму. */
  readonly image?: string;
};

/** Где человек работает: страница, шаблон, настройки — и факты о месте для системного промпта. */
export type AiScope = {
  readonly area: string;
  readonly facts: readonly string[];
};

const _NOWHERE: AiScope = { area: '', facts: [] };

let _scope = $state<AiScope>(_NOWHERE);

/** Экран сообщает, где человек; уходя — сбрасывает. Для `$effect(() => aiScope(…))`. */
export var aiScope = (scope: AiScope): (() => void) => (
  (_scope = scope), () => void (_scope = _NOWHERE)
);

export var currentScope = (): AiScope => _scope;

/** ИИ подключён в настройках — у полей есть «Сгенерировать с ИИ». */
export var aiReady = (): boolean => session.ai;

type Pending = {
  readonly target: AiTarget;
  /** Куда прикрепить окошко: поле или кнопка-палочка. */
  readonly anchor: HTMLElement;
  /** Вставить результат в поле. */
  readonly apply: (text: string) => void;
};

/** Открытое окошко запроса к ИИ; одно на весь менеджер. */
export var aiPrompt = $state<{ current: Pending | null }>({ current: null });

export var askAi = (pending: Pending): void =>
  void (aiPrompt.current = pending);

export var closeAi = (): void => void (aiPrompt.current = null);

/** Компоненты сайта для промпта: «Callout(title, text, tone) — Врезка». */
export var componentFacts = (
  items: readonly {
    readonly name: string;
    readonly description: string;
    readonly props: readonly { readonly name: string }[];
  }[]
): string =>
  t('aiFacts.components', {
    list:
      items
        .map(
          (_) =>
            `${_.name}(${_.props.map((prop) => prop.name).join(', ')})${_.description ? ` — ${_.description}` : ''}`
        )
        .join('; ') || t('aiFacts.none'),
  });

/** Факты места без пустых строк: `[cond && 'текст', …]`. */
export var facts = (
  lines: readonly (string | false | null | undefined | 0)[]
): string[] =>
  lines.filter((_): _ is string => typeof _ === 'string' && _ !== '');
