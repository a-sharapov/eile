import { compressBody, negotiate } from '../../platform/compression.ts';
import type { Database } from '../../platform/database.ts';
import { type ManagerAssets, managerAssets } from './infrastructure/assets.ts';
import { defineActivityLog } from './infrastructure/sqlite-activity.ts';
import { defineAppearanceRepository } from './infrastructure/sqlite-appearance.ts';
import { defineManagerApi, type ManagerServices } from './interface/api.ts';

export var MANAGER_PATH = '/manager';

const _API = `${MANAGER_PATH}/api`;

// Дерево большого сайта — сотни килобайт JSON; мелкие ответы сжимать дороже, чем отправить.
const _MIN_COMPRESSED = 1024;

const _compressed =
  (request: Request) =>
  (response: Response): Promise<Response> => {
    const encoding = negotiate(request.headers.get('accept-encoding'));
    return encoding &&
      response.headers.get('content-type')?.startsWith('application/json')
      ? response.text().then((body) => {
          const headers = new Headers(response.headers);
          headers.append('vary', 'accept-encoding');
          return body.length < _MIN_COMPRESSED
            ? new Response(body, { status: response.status, headers })
            : (headers.set('content-encoding', encoding),
              new Response(compressBody(encoding, body), {
                status: response.status,
                headers,
              }));
        })
      : Promise.resolve(response);
  };

/** Контекст manager: JSON API и SPA менеджера. */
export var defineManager = (
  services: ManagerServices & { readonly db: Database },
  assets: ManagerAssets = managerAssets()
) => {
  const api = defineManagerApi({
    ...services,
    appearance: defineAppearanceRepository(services.db),
    activity: defineActivityLog(services.db),
  });
  return {
    /** `client` — адрес посетителя из сервера: для счёта неудачных входов. */
    handle: (request: Request, client = ''): Promise<Response> => {
      const path = new URL(request.url).pathname;
      return path === _API || path.startsWith(`${_API}/`)
        ? api(request, path.slice(_API.length) || '/', client).then(
            _compressed(request)
          )
        : Promise.resolve(
            assets.serve(
              path.slice(MANAGER_PATH.length) || '/',
              request.headers.get('accept-encoding')
            )
          );
    },
  };
};

export { managerMigrations } from './infrastructure/migrations.ts';
export type { ManagerServices };
