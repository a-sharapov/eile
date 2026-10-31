import { api } from './api.ts';
import { currentLanguage, errorMessage } from './i18n.ts';
import { loadTree, markChanged } from './tree.svelte.ts';

/** Шаг агента: инструмент, его аргументы и чем кончилось — как присылает сервер. */
export type AgentStep = {
  readonly tool: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly ok: boolean;
  readonly result: string;
};

/** Реплика разговора: слова человека или ответ агента с его шагами. */
export type AgentTurn = {
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly steps: readonly AgentStep[];
  /** Агент остановился по пределу шагов. */
  readonly stopped?: boolean;
  /** Сбой: текст ошибки вместо ответа. */
  readonly error?: string;
};

/** Разговор живёт, пока открыт менеджер: переходы между разделами его не сбрасывают. */
export var agent = $state<{
  open: boolean;
  turns: AgentTurn[];
  running: boolean;
  /** Шаги идущего ответа — видны сразу, до слов агента. */
  live: AgentStep[];
}>({ open: false, turns: [], running: false, live: [] });

// Инструменты, которые меняют страницу по id: после них открытый редактор перечитает её.
const _PAGE_WRITES = new Set([
  'edit_page',
  'set_page_fields',
  'move_page',
  'publish_page',
  'unpublish_page',
  'trash_page',
  'restore_page',
  'restore_revision',
]);

const _READS = /^(get|list|view|page_history|read|run)_?/;

const _refresh = (steps: readonly AgentStep[]): void =>
  void (
    steps.some((_) => _.ok && !_READS.test(_.tool)) &&
    (loadTree().then(undefined, () => undefined),
    steps
      .filter((_) => _.ok && _PAGE_WRITES.has(_.tool))
      .forEach((_) => void markChanged(Number(_.arguments.id))))
  );

type _Line =
  | { readonly step: AgentStep }
  | {
      readonly reply: {
        readonly reply: string;
        readonly steps: number;
        readonly stopped: boolean;
      };
    }
  | { readonly error: { readonly code: string; readonly message: string } };

// Ответ — строки NDJSON: шаги по мере работы, в конце ответ или ошибка.
const _read = (
  body: ReadableStream<Uint8Array>,
  onLine: (line: _Line) => void
): Promise<void> => {
  const reader = body
    .pipeThrough(new TextDecoderStream() as TransformStream<Uint8Array, string>)
    .getReader();
  let rest = '';
  const next = (): Promise<void> =>
    reader
      .read()
      .then(({ done, value }) =>
        done
          ? void (rest.trim() && onLine(JSON.parse(rest)))
          : ((parts) => (
              (rest = parts.pop() ?? ''),
              parts
                .filter((_) => _.trim() !== '')
                .forEach((_) => void onLine(JSON.parse(_))),
              next()
            ))(`${rest}${value}`.split('\n'))
      );
  return next();
};

const _finish = (turn: Omit<AgentTurn, 'role' | 'steps'>): void =>
  void ((steps) => (
    agent.turns.push({ role: 'assistant', steps, ...turn }),
    (agent.live = []),
    (agent.running = false),
    _refresh(steps)
  ))(agent.live);

/** Отправить реплику: агент отвечает потоком шагов и словами в конце. */
export var askAgent = (text: string, place: string): Promise<void> =>
  agent.running || text.trim() === ''
    ? Promise.resolve()
    : (agent.turns.push({ role: 'user', content: text.trim(), steps: [] }),
      (agent.running = true),
      (agent.live = []),
      fetch(api.url('/assistant/agent'), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-language': currentLanguage(),
        },
        body: JSON.stringify({
          messages: agent.turns
            .filter((_) => !_.error)
            .map((_) => ({ role: _.role, content: _.content })),
          place,
        }),
      })
        .then((response) =>
          response.ok && response.body
            ? _read(response.body, (line) =>
                'step' in line
                  ? void agent.live.push(line.step)
                  : 'reply' in line
                    ? _finish({
                        content: line.reply.reply,
                        stopped: line.reply.stopped,
                      })
                    : _finish({
                        content: '',
                        error:
                          errorMessage(line.error.code, line.error.message) ??
                          line.error.message,
                      })
              )
            : response.json().then(
                (body: { error?: { code: string; message: string } }) =>
                  _finish({
                    content: '',
                    error:
                      (body.error &&
                        errorMessage(body.error.code, body.error.message)) ??
                      body.error?.message ??
                      `HTTP ${response.status}`,
                  }),
                () => _finish({ content: '', error: `HTTP ${response.status}` })
              )
        )
        .then(undefined, (error: unknown) =>
          _finish({ content: '', error: String(error) })
        )
        .then(() => void (agent.running && _finish({ content: '' }))));

export var newConversation = (): void =>
  void (agent.running || ((agent.turns = []), (agent.live = [])));
