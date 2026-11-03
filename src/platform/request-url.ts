// Запрос без Host — HTTP/1.0 от сканеров портов вроде nmap (`GET /nice%20ports%2C/Tri%6Eity.txt%2ebak`):
// Bun отдаёт в `request.url` голый путь `/…`, и любой `new URL(request.url)` дальше бросает «Invalid URL».
// Сайту такой запрос не адресован: он получает 400 сразу, без разбора и без записи в журнал.

const _badRequest = (): Response =>
  new Response('Bad Request', {
    status: 400,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      connection: 'close',
    },
  });

/** Обёртка обработчика: запрос с адресом, который не разбирается как полный URL, — 400. */
export var withAbsoluteUrl =
  <Server>(
    fetch: (request: Request, server?: Server) => Promise<Response>
  ): ((request: Request, server?: Server) => Promise<Response>) =>
  (request, server) =>
    URL.canParse(request.url)
      ? fetch(request, server)
      : Promise.resolve(_badRequest());

/**
 * Ошибка обработчика для журнала: имя, сообщение и стек. Сам объект ошибки Bun печатает с куском исходника
 * вокруг места — в собранном бинарнике это строка минифицированного кода на килобайты.
 */
export var errorLine = (error: unknown): string =>
  error instanceof Error
    ? (error.stack ?? `${error.name}: ${error.message}`)
    : String(error);
