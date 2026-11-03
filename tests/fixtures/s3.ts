// Учебное хранилище S3 для тестов: то подмножество API, которым пользуется Bun.S3Client, — объект целиком,
// многочастная загрузка, Range, HEAD, удаление и ListObjectsV2 со страницами. Адреса — path-style
// (`/bucket/key`). Подпись SigV4 не проверяется: ключ доступа — по Credential в Authorization, «неверный
// секрет» включается флагом. Сбои — по запросу теста.

type Stored = { readonly data: Uint8Array; readonly at: Date };

type Upload = { readonly key: string; readonly parts: Map<number, Uint8Array> };

/** Какой запрос сломать: загрузку куска, объект целиком, удаление, список. */
export type FakeFault = 'part' | 'put' | 'delete' | 'list' | null;

const _xml = (status: number, body: string): Response =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    status,
    headers: { 'content-type': 'application/xml' },
  });

const _error = (status: number, code: string, message: string): Response =>
  _xml(
    status,
    `<Error><Code>${code}</Code><Message>${message}</Message></Error>`
  );

const _escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export var startFakeS3 = ({
  bucket = 'copies',
  accessKey = 'AKFAKE',
  pageSize = 1000,
}: {
  bucket?: string;
  accessKey?: string;
  pageSize?: number;
} = {}) => {
  const objects = new Map<string, Stored>();
  const uploads = new Map<string, Upload>();
  const log: string[] = [];
  let fault: FakeFault = null;
  let wrongSecret = false;
  let uploadIds = 0;

  const list = (url: URL): Response => {
    const prefix = url.searchParams.get('prefix') ?? '';
    const after = url.searchParams.get('continuation-token') ?? '';
    const max = Math.min(
      Number(url.searchParams.get('max-keys') ?? pageSize),
      pageSize
    );
    const keys = [...objects.keys()]
      .filter((_) => _.startsWith(prefix) && _ > after)
      .toSorted();
    const page = keys.slice(0, max);
    const truncated = keys.length > page.length;
    return _xml(
      200,
      `<ListBucketResult><Name>${bucket}</Name><Prefix>${_escape(prefix)}</Prefix><KeyCount>${page.length}</KeyCount><MaxKeys>${max}</MaxKeys><IsTruncated>${truncated}</IsTruncated>${
        truncated
          ? `<NextContinuationToken>${_escape(page.at(-1)!)}</NextContinuationToken>`
          : ''
      }${page
        .map(
          (key) =>
            `<Contents><Key>${_escape(key)}</Key><LastModified>${objects.get(key)!.at.toISOString()}</LastModified><ETag>"e"</ETag><Size>${objects.get(key)!.data.byteLength}</Size><StorageClass>STANDARD</StorageClass></Contents>`
        )
        .join('')}</ListBucketResult>`
    );
  };

  const get = (key: string, request: Request): Response =>
    ((stored) =>
      !stored
        ? _error(404, 'NoSuchKey', 'The specified key does not exist.')
        : ((range) =>
            range
              ? new Response(
                  stored.data.slice(
                    Number(range[1]),
                    Math.min(stored.data.byteLength, Number(range[2]) + 1)
                  ),
                  {
                    status: 206,
                    headers: {
                      'content-range': `bytes ${range[1]}-${range[2]}/${stored.data.byteLength}`,
                    },
                  }
                )
              : request.method === 'HEAD'
                ? new Response(null, {
                    headers: {
                      'content-length': String(stored.data.byteLength),
                      etag: '"e"',
                      'last-modified': stored.at.toUTCString(),
                    },
                  })
                : new Response(stored.data))(
            /^bytes=(\d+)-(\d+)$/.exec(request.headers.get('range') ?? '')
          ))(objects.get(key));

  const handle = (request: Request): Promise<Response> | Response => {
    const url = new URL(request.url);
    const { 0: name, ...rest } = url.pathname.slice(1).split('/');
    const key = decodeURIComponent(Object.values(rest).join('/'));
    const auth = request.headers.get('authorization') ?? '';
    log.push(`${request.method} ${key}${url.search}`);
    return name !== bucket
      ? _error(404, 'NoSuchBucket', 'The specified bucket does not exist')
      : !auth.includes(`Credential=${accessKey}/`)
        ? _error(
            403,
            'InvalidAccessKeyId',
            'The access key ID you provided does not exist in our records.'
          )
        : wrongSecret
          ? _error(
              403,
              'SignatureDoesNotMatch',
              'The request signature we calculated does not match the signature you provided.'
            )
          : url.searchParams.get('list-type') === '2'
            ? fault === 'list'
              ? _error(500, 'InternalError', 'list failed')
              : list(url)
            : request.method === 'GET' || request.method === 'HEAD'
              ? get(key, request)
              : request.method === 'DELETE'
                ? fault === 'delete'
                  ? _error(500, 'InternalError', 'delete failed')
                  : (uploads.delete(url.searchParams.get('uploadId') ?? ''),
                    url.searchParams.has('uploadId') || objects.delete(key),
                    new Response(null, { status: 204 }))
                : request.bytes().then((body) =>
                    url.searchParams.has('uploads')
                      ? ((id) => (
                          uploads.set(id, { key, parts: new Map() }),
                          _xml(
                            200,
                            `<InitiateMultipartUploadResult><Bucket>${bucket}</Bucket><Key>${_escape(key)}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`
                          )
                        ))(`u${++uploadIds}`)
                      : url.searchParams.has('partNumber')
                        ? fault === 'part'
                          ? _error(500, 'InternalError', 'part failed')
                          : (uploads
                              .get(url.searchParams.get('uploadId')!)
                              ?.parts.set(
                                Number(url.searchParams.get('partNumber')),
                                body
                              ),
                            new Response('', {
                              headers: {
                                etag: `"p${url.searchParams.get('partNumber')}"`,
                              },
                            }))
                        : url.searchParams.has('uploadId')
                          ? ((upload) => (
                              upload &&
                                objects.set(upload.key, {
                                  data: new Uint8Array(
                                    Bun.concatArrayBuffers(
                                      [...upload.parts.entries()]
                                        .toSorted((a, b) => a[0] - b[0])
                                        .map(({ 1: part }) => part)
                                    )
                                  ),
                                  at: new Date(),
                                }),
                              uploads.delete(url.searchParams.get('uploadId')!),
                              _xml(
                                200,
                                `<CompleteMultipartUploadResult><ETag>"x"</ETag></CompleteMultipartUploadResult>`
                              )
                            ))(uploads.get(url.searchParams.get('uploadId')!))
                          : fault === 'put'
                            ? _error(500, 'InternalError', 'put failed')
                            : (objects.set(key, { data: body, at: new Date() }),
                              new Response('', { headers: { etag: '"e"' } }))
                  );
  };

  const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: handle });
  return {
    endpoint: `http://127.0.0.1:${server.port}`,
    bucket,
    accessKey,
    objects,
    /** Начатые и не завершённые многочастные загрузки. */
    uploads,
    log,
    fail: (next: FakeFault) => void (fault = next),
    rejectSecret: (on: boolean) => void (wrongSecret = on),
    stop: () => void server.stop(true),
  };
};

export type FakeS3 = ReturnType<typeof startFakeS3>;
