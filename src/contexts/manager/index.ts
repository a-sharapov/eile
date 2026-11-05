import { compressBody, negotiate } from '../../platform/compression.ts';
import type { Database } from '../../platform/database.ts';
import { attempt } from '../../shared/kernel/errors.ts';
import { managerAssets } from './infrastructure/assets.ts';
import { defineActivityLog } from './infrastructure/sqlite-activity.ts';
import { defineAppearanceRepository } from './infrastructure/sqlite-appearance.ts';
import {
  bearerToken,
  defineManagerApi,
  type ManagerServices,
} from './interface/api.ts';
import { defineEditBar, EDIT_BAR_URL } from './interface/edit-bar.ts';
import { defineMcp } from './interface/mcp.ts';
import {
  type AgentKey,
  type AgentSession,
  defineAgentSession,
} from './interface/toolbox.ts';

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

/** MCP по HTTP: агенты не на этом сервере (Claude, Cursor, n8n) входят ключом API. */
export var MCP_PATH = `${MANAGER_PATH}/mcp`;

// Файл в base64 на треть длиннее: 32 МБ медиатеки — около 43 МБ сообщения.
const _MCP_LIMIT = 48 * 1024 * 1024;

const _rpcError = (status: number, code: number, message: string) =>
  Response.json(
    { jsonrpc: '2.0', id: null, error: { code, message } },
    { status, headers: { 'cache-control': 'no-store' } }
  );

const _sameOrigin = (request: Request, siteUrl: string): boolean =>
  ((origin) =>
    origin === null ||
    origin === new URL(request.url).origin ||
    (siteUrl !== '' && origin === new URL(siteUrl).origin))(
    request.headers.get('origin')
  );

// Сессии MCP по HTTP: метка «читал заявки» живёт между запросами одной сессии. Клиент без своего
// Mcp-Session-Id получает сессию ключа: метку не сбросить, просто не прислав заголовок.
const _SESSIONS = 1000;
const _SESSION_MS = 60 * 60_000;

const _hashOf = (token: string): string =>
  new Bun.CryptoHasher('sha256').update(token).digest('hex');

const _defineSessions = () => {
  const sessions = new Map<
    string,
    { session: AgentSession; at: number; token: string }
  >();
  const fresh = (key: string, token: string, agent: AgentKey): AgentSession =>
    ((session) => (
      sessions.size >= _SESSIONS &&
        sessions.delete(sessions.keys().next().value!),
      sessions.set(key, { session, at: Date.now(), token }),
      session
    ))(defineAgentSession({ key: agent }));
  // Сессия — только того ключа, что её открыл: чужой Mcp-Session-Id с другим ключом не подойдёт.
  const live = (key: string, token: string): AgentSession | null =>
    ((found) =>
      found && found.token === token && Date.now() - found.at < _SESSION_MS
        ? found.session
        : null)(sessions.get(key));
  return {
    /** Новая сессия при initialize: её id уходит клиенту заголовком. */
    open: (
      token: string,
      agent: AgentKey
    ): { id: string; session: AgentSession } =>
      ((id) => ({ id, session: fresh(`id:${id}`, _hashOf(token), agent) }))(
        crypto.randomUUID()
      ),
    of: (id: string | null, token: string, agent: AgentKey): AgentSession =>
      ((hash) =>
        (id === null ? null : live(`id:${id}`, hash)) ??
        live(`key:${hash}`, hash) ??
        fresh(`key:${hash}`, hash, agent))(_hashOf(token)),
  };
};

/** Контекст manager: JSON API и SPA менеджера. */
export var defineManager = (
  services: ManagerServices & {
    readonly db: Database;
    /** Файлы SPA «путь → файл» вместо встроенных и собранных — у тестов. */
    readonly files?: Readonly<Record<string, string>>;
  }
) => {
  const assets = managerAssets(services.files);
  const appearance = defineAppearanceRepository(services.db);
  const api = defineManagerApi({
    ...services,
    appearance,
    activity: defineActivityLog(services.db),
  });
  const bar = defineEditBar({ identity: services.identity, appearance });
  const sessions = _defineSessions();
  const mcp = defineMcp({
    toolbox: api.toolbox,
    site: services.site.settings.get,
    version: services.version,
    reviewed: api.reviewed,
  });
  // Один запрос — одно сообщение JSON-RPC, ответ — JSON; поток событий (GET) не нужен: сервер не пишет первым.
  const mcpHttp = (request: Request): Promise<Response> =>
    ((login) =>
      request.method !== 'POST'
        ? Promise.resolve(
            new Response(null, { status: 405, headers: { allow: 'POST' } })
          )
        : !_sameOrigin(request, services.site.settings.get().siteUrl)
          ? Promise.resolve(_rpcError(403, -32600, 'Cross-site request'))
          : login === null
            ? Promise.resolve(
                new Response(
                  JSON.stringify({
                    error: 'Send an API token: Authorization: Bearer cms_…',
                  }),
                  {
                    status: 401,
                    headers: {
                      'content-type': 'application/json',
                      'www-authenticate': 'Bearer',
                    },
                  }
                )
              )
            : Number(request.headers.get('content-length') ?? 0) > _MCP_LIMIT
              ? Promise.resolve(_rpcError(413, -32600, 'Message is too large'))
              : request.text().then((text) =>
                  text.length > _MCP_LIMIT
                    ? _rpcError(413, -32600, 'Message is too large')
                    : ((message) =>
                        message === undefined
                          ? _rpcError(400, -32700, 'Parse error')
                          : ((agent, token) =>
                              ((opened) =>
                                mcp(
                                  message,
                                  login.user,
                                  opened?.session ??
                                    sessions.of(
                                      request.headers.get('mcp-session-id'),
                                      token,
                                      agent
                                    )
                                ).then((reply) =>
                                  reply === null
                                    ? new Response(null, { status: 202 })
                                    : Response.json(reply, {
                                        headers: {
                                          'cache-control': 'no-store',
                                          ...(opened && {
                                            'mcp-session-id': opened.id,
                                          }),
                                        },
                                      })
                                ))(
                                (message as { method?: unknown }).method ===
                                  'initialize'
                                  ? sessions.open(token, agent)
                                  : null
                              ))(
                              { id: login.token.id, name: login.token.name },
                              bearerToken(request)!
                            ))(
                        attempt(
                          () => JSON.parse(text) as unknown,
                          () => undefined
                        )
                      )
                ))(services.identity.apiTokens.login(bearerToken(request)));

  return {
    /** `client` — адрес посетителя из сервера: для счёта неудачных входов. */
    handle: (request: Request, client = ''): Promise<Response> => {
      const url = new URL(request.url);
      const path = url.pathname;
      return path === MCP_PATH
        ? mcpHttp(request)
        : path === _API || path.startsWith(`${_API}/`)
          ? api
              .handle(request, path.slice(_API.length) || '/', client)
              .then(_compressed(request))
          : path === EDIT_BAR_URL
            ? Promise.resolve(bar.script())
            : Promise.resolve(
                assets.serve(
                  path.slice(MANAGER_PATH.length) || '/',
                  request.headers.get('accept-encoding'),
                  // Редактор для окна полосы правки: встраивается только в свой же сайт.
                  url.searchParams.has('embed')
                )
              );
    },
    /** Полоса правки на сайте для того, кто вошёл в менеджер. */
    editBar: bar.html,
    /** MCP: сообщение агента от имени пользователя → ответ JSON-RPC или null. */
    mcp,
  };
};

export { managerMigrations } from './infrastructure/migrations.ts';
export {
  type AgentKey,
  type AgentSession,
  defineAgentSession,
} from './interface/toolbox.ts';
export type { ManagerServices };
