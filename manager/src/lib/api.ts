import { currentLanguage } from './i18n.ts';

/** Место ошибки в исходнике шаблона, компонента или плагина: строка и столбец с единицы. */
export type SourcePoint = { readonly line: number; readonly column: number };

export type ApiError = Error & {
  readonly code: string;
  readonly status: number;
  readonly at?: SourcePoint;
};

// paths.base в vite.config.ts — /manager.
const _base = (): string => '/manager/api';

// Ответ без кода: 502–504 даёт прокси, когда сервер сайта не запущен; остальное — сбой самого сервера.
const _UNREACHABLE: Readonly<Record<number, true>> = {
  502: true,
  503: true,
  504: true,
};

const _reject = (status: number, body: any): Promise<never> =>
  Promise.reject(
    Object.assign(new Error(body?.error?.message ?? `HTTP ${status}`), {
      code: body?.error?.code ?? (_UNREACHABLE[status] ? 'http' : 'server'),
      status,
      at: body?.error?.at,
    })
  );

const _parse = (response: Response): Promise<any> =>
  response
    .json()
    .catch(() => null)
    .then((body) => (response.ok ? body : _reject(response.status, body)));

const _JSON = { 'content-type': 'application/json' };

// Свой язык — первым: на нём сервер собирает тексты для менеджера (диагностику, письмо сброса пароля).
const _language = () => ({ 'accept-language': currentLanguage() });

/** «Только создать»: сервер откажет кодом *_exists, если имя уже занято. */
export var CREATE_ONLY = { 'if-none-match': '*' };

export var isApiError = (error: unknown): error is ApiError =>
  error instanceof Error && 'status' in error;

export var api = {
  get: <T>(path: string): Promise<T> =>
    fetch(`${_base()}${path}`, { headers: _language() }).then(_parse),
  send: <T>(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {}
  ): Promise<T> =>
    fetch(`${_base()}${path}`, {
      method,
      headers: { ..._JSON, ..._language(), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(_parse),
  /** Тело как есть — файл копии сайта при восстановлении. */
  upload: <T>(path: string, body: Blob): Promise<T> =>
    fetch(`${_base()}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        ..._language(),
      },
      body,
    }).then(_parse),
  previewUrl: (id: number): string => `${_base()}/pages/${id}/preview`,
  /** Адрес API для ссылок: скачать копию сайта. */
  url: (path: string): string => `${_base()}${path}`,
};
