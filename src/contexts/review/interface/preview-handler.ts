import { isDomainError } from '../../../shared/kernel/errors.ts';
import type { LinkTarget } from '../domain/share-link.ts';

/** Адрес ссылки предпросмотра: `/_cms/preview/<токен>`. */
export var PREVIEW_PREFIX = '/_cms/preview/';

/** Нарисованная страница предпросмотра; null — показывать нечего. */
export type PreviewPage = {
  readonly body: string;
  readonly contentType: string;
  /** Язык страницы: на нём плашка «не опубликовано». */
  readonly language: string;
  /** В странице правки набора — код, который ещё никто не принял. */
  readonly proposed: boolean;
};

type Texts = {
  readonly draft: string;
  readonly proposed: string;
  readonly forms: string;
  readonly gone: string;
  readonly busy: string;
  readonly failed: string;
};

// Плашка — на языке сайта: её видит клиент агентства, а не менеджер.
const _TEXTS: Readonly<Record<string, Texts>> = {
  de: {
    draft: 'Vorschau — nicht veröffentlicht',
    proposed: 'Vorschau vorgeschlagener Änderungen — nicht veröffentlicht',
    forms: 'Formulare sind in der Vorschau deaktiviert.',
    gone: 'Dieser Vorschaulink ist abgelaufen oder ungültig.',
    busy: 'Zu viele Anfragen. Bitte versuchen Sie es gleich noch einmal.',
    failed: 'Die Vorschau konnte nicht erstellt werden.',
  },
  en: {
    draft: 'Preview — not published',
    proposed: 'Preview of proposed changes — not published',
    forms: 'Forms are disabled in the preview.',
    gone: 'This preview link has expired or is not valid.',
    busy: 'Too many requests. Please try again in a moment.',
    failed: 'The preview could not be rendered.',
  },
  ru: {
    draft: 'Предпросмотр — не опубликовано',
    proposed: 'Предпросмотр предложенных правок — не опубликовано',
    forms: 'Формы в предпросмотре не отправляются.',
    gone: 'Ссылка предпросмотра устарела или неверна.',
    busy: 'Слишком много запросов. Попробуйте чуть позже.',
    failed: 'Предпросмотр не удалось построить.',
  },
};

const _textsOf = (language: string): Texts =>
  _TEXTS[language.toLowerCase().split('-')[0] ?? ''] ?? _TEXTS.en!;

const _escape = (text: string): string => Bun.escapeHTML(text);

// Размеры в px и свой шрифт: стили сайта плашку не задевают, у неё нет классов.
const _banner = (text: string): string =>
  `<div role="status" data-cms-preview style="position:fixed;z-index:2147483647;left:50%;bottom:12px;transform:translateX(-50%);max-width:calc(100% - 24px);box-sizing:border-box;padding:8px 14px;border-radius:999px;background:#1f2430;color:#fff;font:600 13px/1.3 system-ui,sans-serif;letter-spacing:0;box-shadow:0 4px 16px rgba(0,0,0,.25);pointer-events:none;text-align:center">${_escape(text)}</div>`;

const _formNote = (text: string): string =>
  `<p data-cms-preview style="margin:8px 0 0;font:13px/1.4 system-ui,sans-serif;color:#8a4b00">${_escape(text)}</p>`;

/**
 * Документ предпросмотра: `noindex`, плашка перед `</body>`, формы не отправляются — поля выключены
 * `fieldset disabled`, `method="dialog"` вне диалога ничего не шлёт, адреса приёма заявок нет.
 */
export var decoratePreview = (html: string, texts: Texts, proposed: boolean) =>
  new HTMLRewriter()
    .on('head', {
      element: (head) =>
        void head.prepend('<meta name="robots" content="noindex, nofollow">', {
          html: true,
        }),
    })
    .on('form', {
      element: (form) => {
        form.removeAttribute('action');
        form.setAttribute('method', 'dialog');
        form.setAttribute('data-cms-preview', '');
        form.prepend(
          '<fieldset disabled style="display:contents;margin:0;padding:0;border:0">',
          { html: true }
        );
        form.append('</fieldset>', { html: true });
        form.after(_formNote(texts.forms), { html: true });
      },
    })
    .on('body', {
      element: (body) =>
        void body.append(_banner(proposed ? texts.proposed : texts.draft), {
          html: true,
        }),
    })
    .transform(html);

// Ничего из предпросмотра не кэшируется и не индексируется; токен не уходит чужим сайтам в Referer.
const _COMMON = {
  'cache-control': 'private, no-store, max-age=0',
  'x-robots-tag': 'noindex, nofollow, noarchive',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};

// Код, предложенный агентом, ещё никто не принял: он живёт в песочнице без своего origin — без cookie
// менеджера и без доступа к его API. Черновик человека — как настоящая страница сайта.
const _policy = (page: PreviewPage): Record<string, string> =>
  page.proposed
    ? {
        'content-security-policy':
          "sandbox allow-scripts allow-popups; frame-ancestors 'none'",
      }
    : page.contentType.startsWith('text/html')
      ? { 'content-security-policy': "frame-ancestors 'none'" }
      : {
          'content-security-policy':
            "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        };

const _notice = (status: number, language: string, text: string): Response =>
  new Response(
    `<!doctype html>\n<html lang="${_escape(language)}"><meta charset="utf-8"><meta name="robots" content="noindex"><title>${_escape(text)}</title><p style="font:16px/1.5 system-ui,sans-serif;margin:3rem auto;max-width:32rem;padding:0 1rem">${_escape(text)}</p></html>\n`,
    {
      status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        ..._COMMON,
        ...(status === 429 ? { 'retry-after': '60' } : {}),
      },
    }
  );

/** `/_cms/preview/<токен>`: только страница ссылки — ни дерева, ни других страниц, ни менеджера. */
export var definePreviewHandler = ({
  resolve,
  render,
  language,
}: {
  /** Цель по токену; null — нет такой живой ссылки; частые поиски — отказ. */
  resolve: (token: string, client: string) => LinkTarget | null;
  render: (target: LinkTarget) => Promise<PreviewPage | null>;
  /** Язык сайта: на нём ответ, когда страницы нет. */
  language: () => string;
}) => {
  const respond = (request: Request, page: PreviewPage): Response =>
    ((body) =>
      new Response(request.method === 'HEAD' ? null : body, {
        headers: {
          'content-type': page.contentType,
          ..._COMMON,
          ..._policy(page),
        },
      }))(
      page.contentType.startsWith('text/html')
        ? decoratePreview(page.body, _textsOf(page.language), page.proposed)
        : page.body
    );

  return (request: Request, client = ''): Promise<Response> =>
    ['GET', 'HEAD'].includes(request.method)
      ? Promise.resolve(
          new URL(request.url).pathname.slice(PREVIEW_PREFIX.length)
        )
          .then((token) => resolve(token, client))
          .then((target) =>
            target === null
              ? null
              : render(target).then((page) =>
                  page === null ? null : respond(request, page)
                )
          )
          .then(
            (response) =>
              response ?? _notice(404, language(), _textsOf(language()).gone),
            (error) =>
              isDomainError(error) && error.code === 'review.too_many_requests'
                ? _notice(429, language(), _textsOf(language()).busy)
                : (console.error(error),
                  _notice(500, language(), _textsOf(language()).failed))
          )
      : Promise.resolve(
          new Response('Method Not Allowed', {
            status: 405,
            headers: { allow: 'GET, HEAD' },
          })
        );
};
