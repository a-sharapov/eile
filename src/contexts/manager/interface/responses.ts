import type { SourcePoint } from '../../../shared/kernel/errors.ts';

// Ответы API — личные данные: ни прокси, ни браузер их не хранят.
export var API_HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export var json = (status: number, body: unknown, headers = {}): Response =>
  Response.json(body, { status, headers: { ...API_HEADERS, ...headers } });

export var apiError = (
  status: number,
  code: string,
  message: string,
  at?: SourcePoint
) => json(status, { error: { code, message, at } });
