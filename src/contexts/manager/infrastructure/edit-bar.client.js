// Полоса правки на сайте для вошедшего в менеджер, как QuickManager в Evo. Сервер вставляет её только
// ему; посетители этот скрипт не получают. Разметка — в теневом DOM: стили сайта её не задевают.
(() => {
  // Настройки — в атрибуте этого скрипта: его вставил сервер, текст страницы до него не дотянется.
  const raw = document.currentScript?.dataset.eileBar;
  // Внутри фрейма — ни полосы, ни окна: страницу показывают где-то ещё, например в предпросмотре.
  if (!raw || window.self !== window.top) return;
  const config = JSON.parse(raw);
  // Цвет и адреса проверяются ещё раз: в стиль и ссылки попадает только то, что похоже на своё.
  config.accent = /^#[0-9a-f]{6}$/i.test(config.accent)
    ? config.accent
    : '#2f6fde';
  for (const key of ['manager', 'open', 'edit', 'create']) {
    if (!/^\/manager\/[^\s"'<>]*$/.test(config[key] ?? ''))
      config[key] = '/manager/';
  }
  const texts = config.texts;
  const HIDDEN = 'eile:bar:hidden';
  // Размеры — в px: rem у сайта может быть любым, а полоса должна выглядеть одинаково везде.
  const HEIGHT = 44;

  const icon = (body) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const ICONS = {
    edit: icon(
      '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>'
    ),
    create: icon(
      '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M9 15h6"/><path d="M12 18v-6"/>'
    ),
    open: icon(
      '<path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/><path d="m21 3-9 9"/><path d="M15 3h6v6"/>'
    ),
    hide: icon('<path d="m18 15-6-6-6 6"/>'),
    close: icon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  };
  // Буква E знака Eile — та же, что в значке менеджера.
  const MARK =
    '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--accent)"/><path fill="#fff" transform="translate(8.09 7.5) scale(0.009725) translate(0 -1)" d="M319.282 1L1627.47 1L1555.19 394L801.218 394L748.983 678L1380.47 678L1334.62 927.277L1175 1071L676.701 1071L624.282 1356L1380.47 1356L1308.19 1749L0 1749Z"/></svg>';

  const esc = (text) =>
    String(text).replace(
      /[&<>"']/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[char]
    );

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .bar, .tab, dialog {
      --accent: ${config.accent};
      --bg: #16181d;
      --text: #e8eaed;
      --muted: #9aa1ab;
      --hover: rgba(255, 255, 255, 0.09);
      font: 500 13px/1.2 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      color: var(--text);
      -webkit-font-smoothing: antialiased;
    }
    .bar {
      position: fixed; inset: 0 0 auto 0; z-index: 2147483000;
      display: flex; align-items: center; gap: 4px;
      height: ${HEIGHT}px; padding: 0 8px 0 10px;
      background: var(--bg);
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06), 0 2px 10px rgba(0, 0, 0, 0.25);
    }
    .bar[hidden], .tab[hidden] { display: none; }
    a, button {
      display: inline-flex; align-items: center; gap: 7px; flex: none;
      height: 30px; margin: 0; padding: 0 10px;
      border: 0; border-radius: 7px; background: transparent;
      color: inherit; font: inherit; text-decoration: none; white-space: nowrap; cursor: pointer;
    }
    a:hover, button:hover { background: var(--hover); }
    a:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    svg { width: 16px; height: 16px; flex: none; }
    .brand { gap: 8px; padding-left: 4px; font-weight: 650; }
    .brand svg { width: 22px; height: 22px; }
    .id { color: var(--muted); font-variant-numeric: tabular-nums; padding: 0 6px; }
    .sep { width: 1px; height: 20px; margin: 0 6px; background: rgba(255, 255, 255, 0.12); }
    .primary { background: var(--accent); color: #fff; }
    .primary:hover { background: color-mix(in oklch, var(--accent), #fff 12%); }
    .grow { flex: 1; }
    .user { overflow: hidden; max-width: 220px; padding: 0 8px; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; }
    .icon { width: 30px; padding: 0; justify-content: center; }
    .tab {
      position: fixed; top: 8px; right: 8px; z-index: 2147483000;
      width: 36px; height: 36px; padding: 6px; border-radius: 10px;
      background: var(--bg); box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    }
    .tab svg { width: 24px; height: 24px; }
    /* Значок висит прямо на сайте: полупрозрачная подсветка на светлой странице стала бы белой. */
    .tab:hover { background: #262a31; }
    dialog {
      width: min(100vw - 32px, 1320px); height: calc(100dvh - 32px);
      max-width: none; max-height: none; margin: auto; padding: 0;
      border: 0; border-radius: 12px; overflow: hidden; background: var(--bg);
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
    }
    dialog[open] { display: flex; flex-direction: column; }
    dialog::backdrop { background: rgba(10, 12, 16, 0.55); }
    dialog header { display: flex; align-items: center; gap: 10px; flex: none; height: ${HEIGHT}px; padding: 0 8px 0 12px; }
    dialog header > svg { width: 22px; height: 22px; }
    dialog strong { overflow: hidden; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
    iframe { flex: 1; width: 100%; border: 0; background: #fff; }
    @media (max-width: 720px) {
      .label, .user, .id, .sep { display: none; }
      a, button { padding: 0 8px; }
      dialog { width: 100vw; height: 100dvh; border-radius: 0; }
    }
  `;

  const host = document.createElement('eile-bar');
  const root = host.attachShadow({ mode: 'open' });
  const canEdit = config.canEdit;
  root.innerHTML = `
    <style>${STYLE}</style>
    <nav class="bar" aria-label="${esc(texts.label)}">
      <a class="brand" href="${esc(config.manager)}" title="${esc(texts.manager)}">${MARK}<span class="label">Eile</span></a>
      <span class="id">id ${esc(config.page)}</span>
      <span class="sep"></span>
      ${canEdit ? `<button type="button" class="primary" data-open="edit" title="${esc(texts.edit)}">${ICONS.edit}<span class="label">${esc(texts.edit)}</span></button>` : ''}
      ${canEdit ? `<button type="button" data-open="create" title="${esc(texts.create)}">${ICONS.create}<span class="label">${esc(texts.create)}</span></button>` : ''}
      <a href="${esc(config.open)}" title="${esc(texts.open)}">${ICONS.open}<span class="label">${esc(texts.open)}</span></a>
      <span class="grow"></span>
      <span class="user">${esc(config.user)}</span>
      <button type="button" class="icon" data-hide aria-label="${esc(texts.hide)}" title="${esc(texts.hide)}">${ICONS.hide}</button>
    </nav>
    <button type="button" class="tab" hidden aria-label="${esc(texts.show)}" title="${esc(texts.show)}">${MARK}</button>
    <dialog aria-labelledby="eile-dialog-title">
      <header>
        ${MARK}<strong id="eile-dialog-title"></strong>
        <span class="grow"></span>
        <button type="button" class="icon" data-close aria-label="${esc(texts.close)}" title="${esc(texts.close)}">${ICONS.close}</button>
      </header>
    </dialog>
  `;
  document.body.append(host);

  const bar = root.querySelector('.bar');
  const tab = root.querySelector('.tab');
  const dialog = root.querySelector('dialog');
  const title = root.querySelector('#eile-dialog-title');

  // Место под полосой: страница сдвигается вниз, а не прячет шапку сайта под ней.
  const space = document.createElement('style');
  space.textContent = `html { margin-top: ${HEIGHT}px !important; scroll-padding-top: ${HEIGHT}px; }`;

  const show = (visible) => {
    bar.hidden = !visible;
    tab.hidden = visible;
    if (visible) document.head.append(space);
    else space.remove();
    try {
      if (visible) localStorage.removeItem(HIDDEN);
      else localStorage.setItem(HIDDEN, '1');
    } catch {}
  };

  let hidden = false;
  try {
    hidden = localStorage.getItem(HIDDEN) === '1';
  } catch {}
  show(!hidden);

  root.querySelector('[data-hide]').addEventListener('click', () => {
    show(false);
    tab.focus();
  });
  tab.addEventListener('click', () => {
    show(true);
    root.querySelector('[data-hide]').focus();
  });

  // Окно с редактором менеджера. Фрейм создаётся на открытие и убирается на закрытие: так он не
  // переспрашивает про несохранённое, когда мы уже спросили сами.
  let frame = null;
  let dirty = false;
  let opener = null;
  let overflow = '';

  const open = (kind, button) => {
    opener = button;
    dirty = false;
    title.textContent = kind === 'create' ? texts.creating : texts.editing;
    frame = document.createElement('iframe');
    frame.title = title.textContent;
    frame.src = kind === 'create' ? config.create : config.edit;
    dialog.append(frame);
    overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.showModal();
    frame.focus();
  };

  const close = (force) => {
    if (!dialog.open || (dirty && !force && !window.confirm(texts.unsaved))) {
      return;
    }
    dialog.close();
    frame?.remove();
    frame = null;
    document.documentElement.style.overflow = overflow;
    opener?.focus();
  };

  for (const button of root.querySelectorAll('[data-open]')) {
    button.addEventListener('click', () => open(button.dataset.open, button));
  }
  root.querySelector('[data-close]').addEventListener('click', () => close());
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });

  // Редактор в окне сообщает о правках и о сохранении; после сохранения страница показывает новое,
  // а новая опубликованная страница открывается сама.
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (
      !frame ||
      event.source !== frame.contentWindow ||
      event.origin !== location.origin ||
      data?.source !== 'eile'
    ) {
      return;
    }
    if (data.type === 'dirty') dirty = Boolean(data.dirty);
    if (data.type === 'saved') {
      close(true);
      if (typeof data.url === 'string' && data.url !== location.pathname) {
        location.assign(data.url);
      } else {
        location.reload();
      }
    }
  });
})();
