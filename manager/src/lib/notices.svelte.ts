import { isApiError, type SourcePoint } from './api.ts';
import { errorMessage, t } from './i18n.ts';

export type NoticeAction = {
  readonly label: string;
  readonly run: () => unknown;
};

export type Notice = {
  id: number;
  text: string;
  tone: 'ok' | 'error';
  action?: NoticeAction;
};

// Ошибку человек должен успеть прочитать: она висит, пока её не закроют или пока не случится успех.
// Уведомление с действием («Вернуть») живёт дольше: до кнопки ещё надо добраться.
const _TTL = { ok: 4000, action: 10_000, error: null } as const;

const _timers = new Map<number, ReturnType<typeof setTimeout>>();

const _schedule = (notice: Notice): void => {
  const ttl =
    notice.tone === 'error' ? null : notice.action ? _TTL.action : _TTL.ok;
  void (
    ttl &&
    _timers.set(
      notice.id,
      setTimeout(() => dismiss(notice.id), ttl)
    )
  );
};

/** Пока уведомление под мышью или в фокусе, оно не исчезает. */
export var hold = (id: number): void => {
  clearTimeout(_timers.get(id));
  _timers.delete(id);
};

export var release = (id: number): void =>
  void ((notice) => notice && _schedule(notice))(
    notices.items.find((_) => _.id === id)
  );

let _next = 0;

export var notices = $state<{ items: Notice[] }>({ items: [] });

export var dismiss = (id: number): void => (
  hold(id), void (notices.items = notices.items.filter((_) => _.id !== id))
);

export var notify = (
  text: string,
  tone: Notice['tone'] = 'ok',
  action?: NoticeAction
): void => {
  const id = ++_next;
  // Успех делает прежние ошибки и прежние успехи неактуальными: уведомления — не журнал. То же
  // сообщение подряд (правки в таблице, удалённые блоки) не копится стопкой: «Вернуть» — у последнего.
  const kept = notices.items.filter(
    (_) =>
      (!(tone === 'ok' && _.tone === 'error') &&
        !(tone === 'ok' && _.tone === 'ok' && !_.action) &&
        !(_.text === text && _.tone === tone)) ||
      (hold(_.id), false)
  );
  const notice = { id, text, tone, action };
  const shown = [...kept, notice];
  // Больше трёх — стопка закрывает работу: старые уходят первыми.
  shown.slice(0, -3).forEach((_) => void hold(_.id));
  notices.items = shown.slice(-3);
  _schedule(notice);
};

/** Текст ошибки для человека: перевод кода сервера, обрыв связи, иначе сообщение как есть. */
export var describe = (error: unknown): string =>
  (isApiError(error) && errorMessage(error.code, error.message)) ||
  // fetch без ответа сервера отклоняется TypeError: «Failed to fetch» человеку ничего не говорит.
  (error instanceof TypeError ? t('common.network') : null) ||
  (error instanceof Error ? error.message : String(error));

/** Не загрузилось: обрыв связи говорит про загрузку, а не про «правки на странице». */
export var describeLoad = (error: unknown): string =>
  error instanceof TypeError ||
  (isApiError(error) && (error.code === 'http' || error.status >= 500))
    ? t('common.loadNetwork')
    : describe(error);

/** Ошибка в коде элемента или плагина: текст и, если сервер знает, место в исходнике. */
export var describeSource = (
  error: unknown
): { text: string; at?: SourcePoint } => ({
  text: describe(error),
  ...(isApiError(error) && error.at ? { at: error.at } : {}),
});

/** Для `.then(undefined, failed)`. Сессия кончилась — в уведомлении кнопка «Войти». */
export var failed = (error: unknown): void =>
  notify(
    describe(error),
    'error',
    isApiError(error) && error.code === 'identity.unauthorized'
      ? {
          label: t('login.submit'),
          run: () => location.assign('/manager/login'),
        }
      : undefined
  );
