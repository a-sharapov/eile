// Менеджер в окне полосы правки на сайте: без шапки и дерева, о правках и сохранении сообщает странице.
// Встроить его во фрейм может только свой же сайт (CSP `frame-ancestors 'self'`).

type PageMessage =
  | { readonly type: 'dirty'; readonly dirty: boolean }
  /** url — адрес страницы на сайте, если она опубликована: туда и перейдёт полоса. */
  | { readonly type: 'saved'; readonly url: string | null };

export var embedded =
  typeof window !== 'undefined' && window.self !== window.top;

export var tellPage = (message: PageMessage): void =>
  void (
    embedded &&
    window.parent.postMessage({ source: 'eile', ...message }, location.origin)
  );
