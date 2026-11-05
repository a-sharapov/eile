<script lang="ts">
import { tick } from 'svelte';
import { agent } from '#lib/agent.svelte.ts';
import { aiWands } from '#lib/ai-wands.ts';
import { api } from '#lib/api.ts';
import { chooseLanguage } from '#lib/appearance.svelte.ts';
import { embedded } from '#lib/embed.ts';
import { type MessageKey, t } from '#lib/i18n.ts';
import { icons, logo } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { failed } from '#lib/notices.svelte.ts';
import { openPalette, palette, rememberPage } from '#lib/palette.svelte.ts';
import { loadSession, session, signOut } from '#lib/session.svelte.ts';
import type { Role } from '#lib/types.ts';
import AgentPanel from '#lib/ui/AgentPanel.svelte';
import AiPrompt from '#lib/ui/AiPrompt.svelte';
import AppearanceDialog from '#lib/ui/AppearanceDialog.svelte';
import CommandPalette from '#lib/ui/CommandPalette.svelte';
import EdgeState from '#lib/ui/EdgeState.svelte';
import InboxBell from '#lib/ui/InboxBell.svelte';
import LanguageSelect from '#lib/ui/LanguageSelect.svelte';
import LoadState from '#lib/ui/LoadState.svelte';
import PasswordDialog from '#lib/ui/PasswordDialog.svelte';
import TokensDialog from '#lib/ui/TokensDialog.svelte';
import { afterNavigate, goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import ElementsPanel from './ElementsPanel.svelte';
import PagesPanel from './PagesPanel.svelte';

let { children } = $props();

type Section = {
  href:
    | '/(app)/pages'
    | '/(app)/media'
    | '/(app)/stats'
    | '/(app)/elements'
    | '/(app)/forms'
    | '/(app)/users'
    | '/(app)/settings'
    | '/(app)/backups'
    | '/(app)/proposals'
    | '/(app)/help';
  label: MessageKey;
  icon: keyof typeof icons;
  roles: readonly Role[];
  /** Пути, которые тоже относятся к разделу: плагины и поля — часть «Элементов», как в MODX. */
  also?: readonly ('/(app)/plugins' | '/(app)/fields')[];
  /** Где раздел в шапке: основная навигация слева (по умолчанию), значком справа или значком со
      счётчиком. Текущий раздел определяется по всему списку, где бы он ни стоял. */
  slot?: 'right' | 'badge';
};

// Разделы — в шапке, как в Evo: страницы, элементы, медиа; дальше — администрирование, помощь последней.
const _NAV: readonly Section[] = [
  {
    href: '/(app)/pages',
    label: 'nav.pages',
    icon: 'tree',
    roles: ['admin', 'editor'],
  },
  {
    href: '/(app)/elements',
    label: 'nav.elements',
    icon: 'code',
    roles: ['admin'],
    also: ['/(app)/plugins', '/(app)/fields'],
  },
  // Формы и заявки — сразу за элементами: заявки разбирают все менеджеры, формы правит администратор.
  {
    href: '/(app)/forms',
    label: 'nav.forms',
    icon: 'forms',
    roles: ['admin', 'editor'],
  },
  {
    href: '/(app)/media',
    label: 'nav.media',
    icon: 'images',
    roles: ['admin', 'editor'],
  },
  // Предложения агентов (ADR 0054) — рядом со страницами: их разбирают те, кто правит сайт.
  {
    href: '/(app)/proposals',
    label: 'nav.proposals',
    icon: 'proposals',
    roles: ['admin', 'editor'],
    slot: 'badge',
  },
  // Статистику смотрят все менеджеры; включает и настраивает её администратор во вкладке настроек.
  {
    href: '/(app)/stats',
    label: 'nav.stats',
    icon: 'chart',
    roles: ['admin', 'editor'],
  },
  { href: '/(app)/users', label: 'nav.users', icon: 'users', roles: ['admin'] },
  {
    href: '/(app)/settings',
    label: 'nav.settings',
    icon: 'settings',
    roles: ['admin'],
    slot: 'right',
  },
  // Копии — на виду, а не во вкладке настроек: о них вспоминают, когда уже поздно.
  {
    href: '/(app)/backups',
    label: 'nav.backups',
    icon: 'database',
    roles: ['admin'],
  },
  // Помощь — всем и последней: к ней приходят, когда остальное уже не помогло.
  {
    href: '/(app)/help',
    label: 'nav.help',
    icon: 'help',
    roles: ['admin', 'editor'],
    slot: 'right',
  },
];

const role = $derived(session.user?.role);
const canSee = (_: Section): boolean =>
  role !== undefined && _.roles.includes(role);
// Основная навигация — подписями слева; настройки и помощь — значками справа; предложения — значком со
// счётчиком. Текущий раздел ищется по всему списку, где бы он ни стоял (см. `current`).
const nav = $derived(_NAV.filter((_) => canSee(_) && _.slot === undefined));
const navRight = $derived(_NAV.filter((_) => canSee(_) && _.slot === 'right'));
const proposals = $derived(_NAV.find((_) => _.slot === 'badge' && canSee(_)));

// Счётчик на значке «Предложения» — число открытых наборов правок, ждущих проверки. Обновляется при
// входе и после каждого перехода (разобрал набор — число падает). Тихо: ошибка оставляет прежнее число.
let proposalsCount = $state(0);
const refreshProposals = (): void =>
  void (
    proposals &&
    api
      .get<{ id: number }[]>('/review/sets')
      .then((sets) => (proposalsCount = sets.length))
      .catch(() => {})
  );
$effect(() => {
  void proposals;
  refreshProposals();
});

// Подписи разделов — пока помещаются с запасом в 1rem. Их ширина меряется, когда они видны, и хранится в rem:
// шрифт растёт с окном, а сами разделы — нет. Другой набор разделов — ширина меряется заново.
let navElement = $state<HTMLElement>();
let navList = $state<HTMLUListElement>();
// Ширины пунктов (в rem) снимаются один раз, пока видны все подписи; переснимаются при смене набора
// разделов или языка. Столько подписей, сколько влезает, — слева; лишние уходят в «Ещё».
let widths: number[] = [];
let moreWidth = 0;
let overflowCount = $state(0);
let moreOpen = $state(false);
let moreButton = $state<HTMLButtonElement>();
let moreMenu = $state<HTMLDivElement>();
const NAV_GAP = 0.5; // .main-nav ul { gap: 0.5rem }

// Меню «Ещё» закрывается по Esc и клику мимо — как меню учётной записи.
const closeMore = (event: Event): void =>
  void (
    moreOpen &&
    (event.type === 'keydown'
      ? (event as KeyboardEvent).key === 'Escape' &&
        ((moreOpen = false), moreButton?.focus())
      : !moreButton?.contains(event.target as Node) &&
        !moreMenu?.contains(event.target as Node) &&
        (moreOpen = false))
  );

const _rem = (): number =>
  Number.parseFloat(getComputedStyle(document.documentElement).fontSize);

// Мерить можно, только когда в списке видны все пункты (перелив ещё не сработал).
const measureNav = (): void => {
  const items = navList
    ? [...navList.querySelectorAll<HTMLElement>('li.nav-item')]
    : [];
  if (items.length !== nav.length) return;
  const rem = _rem();
  widths = items.map((_) => _.getBoundingClientRect().width / rem);
  const more = navList?.querySelector<HTMLElement>('li.nav-more');
  if (more) moreWidth = more.getBoundingClientRect().width / rem;
};

const fitNav = (): void => {
  if (!navElement) return;
  // Узкий экран (< 64rem) — разделы значками и прокруткой (CSS прячет подписи); перелив там не нужен.
  if (matchMedia('(width < 64rem)').matches) {
    overflowCount = 0;
    return;
  }
  if (!widths.length) {
    measureNav();
    if (!widths.length) return;
  }
  const avail = navElement.clientWidth / _rem();
  const whole = widths.reduce((sum, w) => sum + w + NAV_GAP, -NAV_GAP);
  if (whole <= avail) {
    overflowCount = 0;
    return;
  }
  // Резерв под «Ещё»; хотя бы один раздел (Страницы) всегда остаётся подписью.
  let used = (moreWidth || 5) + NAV_GAP;
  let fit = 0;
  for (const w of widths) {
    if (used + w > avail) break;
    used += w + NAV_GAP;
    fit += 1;
  }
  overflowCount = nav.length - Math.max(1, fit);
};

const visibleNav = $derived(nav.slice(0, nav.length - overflowCount));
const overflowNav = $derived(nav.slice(nav.length - overflowCount));

$effect(() => {
  const observer = new ResizeObserver(fitNav);
  void (navElement && observer.observe(navElement));
  return () => observer.disconnect();
});

// Смена набора разделов или языка меняет ширины подписей — мерим заново: показываем все, потом считаем.
$effect(() => {
  void nav.length;
  void t('nav.pages');
  widths = [];
  overflowCount = 0;
  moreOpen = false;
  tick().then(fitNav);
});
const within = (section: Section): boolean =>
  [section.href, ...(section.also ?? [])].some((_) =>
    page.url.pathname.startsWith(resolve(_))
  );
const current = $derived(_NAV.find(within));
const allowed = $derived(
  !current || (role !== undefined && current.roles.includes(role))
);

// Вкладка дерева следует за разделом; в остальных разделах остаётся последняя открытая.
type Panel = 'pages' | 'elements';
let panel = $state<Panel>('pages');
const panels = $derived<Panel[]>(
  role === 'admin' ? ['pages', 'elements'] : ['pages']
);

$effect(() => {
  const section = current?.href;
  void (section === '/(app)/pages'
    ? (panel = 'pages')
    : section === '/(app)/elements' &&
      panels.includes('elements') &&
      (panel = 'elements'));
});

const _PANEL_LABELS: Readonly<Record<Panel, MessageKey>> = {
  pages: 'nav.pages',
  elements: 'nav.elements',
};

// Вкладки дерева — по WAI-ARIA, как Tabs: стрелки переключают и переводят фокус.
const panelKey = (event: KeyboardEvent) =>
  ((step) =>
    void (
      step &&
      (event.preventDefault(),
      (panel =
        panels[
          (panels.indexOf(panel) + step + panels.length) % panels.length
        ]!),
      tick().then(() =>
        document.querySelector<HTMLElement>(`#tree-tab-${panel}`)?.focus()
      ))
    ))(
    (
      {
        ArrowRight: 1,
        ArrowLeft: -1,
        Home: -panels.indexOf(panel),
        End: panels.length - 1 - panels.indexOf(panel),
      } as Record<string, number>
    )[event.key]
  );

// Ширина и свёрнутость дерева — настройка рабочего места, живёт в браузере.
const _WIDTH_KEY = 'cms.treeWidth';
const _OPEN_KEY = 'cms.treeOpen';
const _MIN = 224;
const _MAX = 520;

const _stored = (key: string, fallback: string): string => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

const _store = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};

let width = $state(Number(_stored(_WIDTH_KEY, '300')));
let open = $state(_stored(_OPEN_KEY, 'true') === 'true');
// На узком экране дерево — выдвижная панель поверх содержимого.
let drawer = $state(false);
let appearanceOpen = $state(false);
let passwordOpen = $state(false);
let tokensOpen = $state(false);
const brand = $derived(session.site.name || t('app.name'));
// Название сайта не меняли — в шапке знак программы.
const branded = $derived(brand === t('app.name'));
let accountOpen = $state(false);

const clamp = (value: number) =>
  Math.round(Math.max(_MIN, Math.min(_MAX, value)));

const resize = (event: PointerEvent) => {
  const handle = event.currentTarget as HTMLElement;
  const start = event.clientX - width;
  handle.setPointerCapture(event.pointerId);
  const move = (next: PointerEvent) =>
    void (width = clamp(next.clientX - start));
  const stop = () => (
    handle.removeEventListener('pointermove', move),
    _store(_WIDTH_KEY, String(width))
  );
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', stop, { once: true });
};

const _STEP: Readonly<Record<string, number>> = {
  ArrowLeft: -16,
  ArrowRight: 16,
};

const resizeKey = (event: KeyboardEvent) =>
  void (
    _STEP[event.key] &&
    (event.preventDefault(),
    (width = clamp(width + _STEP[event.key]!)),
    _store(_WIDTH_KEY, String(width)))
  );

// Кнопка, на которой был фокус, исчезает вместе с панелью: фокус — на парную кнопку.
const toggleTree = () => (
  (open = !open),
  _store(_OPEN_KEY, String(open)),
  tick().then(() =>
    document
      .querySelector<HTMLElement>(
        open ? '.tree-panel .hide' : '.workspace .show'
      )
      ?.focus()
  )
);

let drawerToggle = $state<HTMLButtonElement>();

// Выезжающее дерево на узком экране — как диалог: фокус внутрь, Escape закрывает и возвращает фокус,
// холстина под ним недоступна, пока оно открыто.
const openDrawer = (next: boolean) => (
  (drawer = next),
  // Фокус — после того, как панель стала видимой: скрытый элемент фокус не принимает.
  tick().then(() =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        next
          ? document
              .querySelector<HTMLElement>(
                '.tree-panel [role=tab][aria-selected=true], .tree-panel input[type=search]'
              )
              ?.focus()
          : drawerToggle?.focus()
      )
    )
  )
);

const drawerKey = (event: KeyboardEvent) =>
  void (
    drawer &&
    event.key === 'Escape' &&
    (event.preventDefault(), openDrawer(false))
  );

// Переход на узком экране закрывает выдвижное дерево: человек хотел попасть на страницу.
// Открытая страница запоминается — она первой в пустом окне быстрого перехода.
afterNavigate(
  () => (
    refreshProposals(),
    void (drawer && openDrawer(false),
    Number(page.params.id) > 0 &&
      page.route.id === '/(app)/pages/[id]' &&
      rememberPage(Number(page.params.id)))
  )
);

// Палочки ИИ у полей холстины — пока ИИ подключён; отключили — палочки убираются.
$effect(() =>
  session.ai && session.user
    ? ((root) => (root ? aiWands(root) : undefined))(
        document.querySelector<HTMLElement>('#main')
      )
    : undefined
);

const shortcut = /Mac|iPhone|iPad/.test(navigator.platform)
  ? '⌘K'
  : `${t('common.ctrl')} K`;

// Ctrl+K (⌘K) — быстрый переход; в тексте страницы то же сочетание вставляет ссылку, и редактор
// отменяет событие раньше — тогда окно не открывается.
const paletteKey = (event: KeyboardEvent) =>
  void (
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === 'k' &&
    !event.defaultPrevented &&
    !palette.open &&
    document.querySelector('dialog[open]') === null &&
    (event.preventDefault(), openPalette())
  );

// Без сессии — на вход, а пока пользователей нет — на первичную настройку. Сервер не ответил —
// «не загрузилось» с «Повторить», а не вечная «Загрузка…».
const sessionLoad = defineLoad(() =>
  loadSession().then(
    (_) =>
      void (
        _.user ||
        goto(resolve(_.setup ? '/setup' : '/login'), { replace: true })
      )
  )
);

$effect(() => void sessionLoad.retry());

const leave = () =>
  signOut()
    .then(() => goto(resolve('/login')))
    .then(undefined, failed);

const initials = $derived(
  (session.user?.name ?? '?')
    .split(/\s+/)
    .map((_) => _[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
);

let accountButton = $state<HTMLButtonElement>();

// Escape закрывает меню и возвращает фокус на кнопку, которая его открыла: иначе фокус падает на body.
const closeAccount = (event: Event) =>
  void (
    accountOpen &&
    (event.type === 'keydown'
      ? (event as KeyboardEvent).key === 'Escape' &&
        ((accountOpen = false), accountButton?.focus())
      : !(event.target as HTMLElement).closest('.account') &&
        (accountOpen = false))
  );
</script>

<svelte:window onpointerdown={(e) => (closeAccount(e), closeMore(e))} onkeydown={(e) => (closeAccount(e), closeMore(e), drawerKey(e), paletteKey(e))} />

{#snippet content()}
  {#if allowed}
    {@render children()}
  {:else}
    <EdgeState kind="forbidden" title={t('edge.forbiddenTitle')} text={t('edge.forbiddenText')}>
      {#snippet actions()}
        <a class="button primary" href={resolve('/(app)/pages')}>{t('overview.title')}</a>
        <a class="button" href={resolve('/(app)/media')}>{t('nav.media')}</a>
      {/snippet}
    </EdgeState>
  {/if}
{/snippet}

{#if session.user && embedded}
  <!-- В окне полосы правки на сайте — только холстина: шапка и дерево там лишние. -->
  <main id="main" class="canvas embedded" tabindex="-1">{@render content()}</main>
  <CommandPalette />
  <AiPrompt />
{:else if session.user}
  <a class="skip" href="#main">{t('common.skip')}</a>
  <div class="shell" style:--tree-width={open ? `${width}px` : '0px'} data-tree={open ? 'open' : 'closed'} data-drawer={drawer || undefined}>
    <!-- Шапка во всю ширину, как в Evo: разделы слева, сайт и учётная запись справа. -->
    <header class="topbar">
      <button type="button" class="ghost icon drawer-toggle" bind:this={drawerToggle} aria-expanded={drawer} aria-controls="tree-panel" aria-label={t('shell.tree')} title={t('shell.tree')} onclick={() => openDrawer(!drawer)}>{@html icons.menu}</button>
      <a class="brand" href={resolve('/(app)/pages')} title={brand} aria-label={branded ? brand : undefined}>{#if branded}{@html logo}{:else}{brand}{/if}</a>
      <nav class="main-nav" aria-label={t('shell.menu')} bind:this={navElement}>
        <ul bind:this={navList}>
          {#each visibleNav as item (item.href)}
            <li class="nav-item">
              <a href={resolve(item.href)} aria-current={current?.href === item.href ? 'page' : undefined} title={t(item.label)}>
                {@html icons[item.icon]}<span class="label">{t(item.label)}</span>
              </a>
            </li>
          {/each}
          {#if overflowCount > 0}
            <li class="nav-more">
              <button type="button" class="more-button" class:current={overflowNav.some((_) => _.href === current?.href)} bind:this={moreButton} aria-haspopup="menu" aria-expanded={moreOpen} title={t('nav.more')} onclick={() => (moreOpen = !moreOpen)}>
                {@html icons.more}<span class="label">{t('nav.more')}</span>
              </button>
              {#if moreOpen}
                <div class="more-menu" role="menu" aria-label={t('nav.more')} bind:this={moreMenu}>
                  {#each overflowNav as item (item.href)}
                    <a role="menuitem" href={resolve(item.href)} aria-current={current?.href === item.href ? 'page' : undefined} onclick={() => (moreOpen = false)}>
                      {@html icons[item.icon]}<span>{t(item.label)}</span>
                    </a>
                  {/each}
                </div>
              {/if}
            </li>
          {/if}
        </ul>
      </nav>
      <!-- Быстрый переход: страница, элемент или раздел по названию, алиасу или id — из любого места. -->
      <button type="button" class="jump" aria-keyshortcuts="Control+K Meta+K" onclick={openPalette}>
        {@html icons.search}<span class="jump-label">{t('palette.open')}</span><kbd>{shortcut}</kbd>
      </button>
      {#if session.ai}
        <button type="button" class="ghost icon" aria-label={t('agent.open')} title={t('agent.open')} aria-pressed={agent.open} onclick={() => (agent.open = !agent.open)}>{@html icons.wand}</button>
      {/if}
      <a class="button ghost icon site" href="/" target="_blank" rel="noopener" aria-label={t('nav.site')} title={t('nav.site')}>{@html icons.external}</a>
      <InboxBell />
      {#if proposals}
        <a class="button ghost icon badge-link" href={resolve(proposals.href)} aria-current={current?.href === proposals.href ? 'page' : undefined} aria-label={proposalsCount > 0 ? `${t(proposals.label)}: ${proposalsCount}` : t(proposals.label)} title={t(proposals.label)}>
          {@html icons[proposals.icon]}
          {#if proposalsCount > 0}<span class="count" aria-hidden="true">{proposalsCount > 99 ? '99+' : proposalsCount}</span>{/if}
        </a>
      {/if}
      {#each navRight as item (item.href)}
        <a class="button ghost icon" href={resolve(item.href)} aria-current={current?.href === item.href ? 'page' : undefined} aria-label={t(item.label)} title={t(item.label)}>{@html icons[item.icon]}</a>
      {/each}
      <div class="account">
        <button type="button" class="user" bind:this={accountButton} aria-label={`${t('shell.account')}: ${session.user.name}${session.update ? ` · ${t('app.updateAvailable', { version: session.update.latest })}` : ''}`} aria-expanded={accountOpen} onclick={() => (accountOpen = !accountOpen)}>
          <span class="avatar" aria-hidden="true">{initials}{#if session.update}<span class="update-dot"></span>{/if}</span>
          <span class="who"><strong>{session.user.name}</strong></span>
          {@html icons.chevronDown}
        </button>
        {#if accountOpen}
          <div class="account-menu">
            <p><strong>{session.user.name}</strong><span>{session.user.email}</span></p>
            <button type="button" onclick={() => ((accountOpen = false), (appearanceOpen = true))}>{@html icons.palette}{t('appearance.title')}</button>
            <button type="button" onclick={() => ((accountOpen = false), (passwordOpen = true))}>{@html icons.key}{t('password.title')}</button>
            <button type="button" onclick={() => ((accountOpen = false), (tokensOpen = true))}>{@html icons.plug}{t('tokens.title')}</button>
            <LanguageSelect labelled onpick={(_) => chooseLanguage(_).then(undefined, failed)} />
            <button type="button" onclick={leave}>{@html icons.logout}{t('nav.signOut')}</button>
            <p class="about">{t('app.name')} {session.version}</p>
            {#if session.update}
              <a class="update" href={session.update.url} target="_blank" rel="noopener noreferrer" title={t('app.updateHint')}>{t('app.updateAvailable', { version: session.update.latest })}</a>
            {/if}
          </div>
        {/if}
      </div>
    </header>

    <!-- Дерево с вкладками «Страницы» и «Элементы», как «Ресурсы» и «Элементы» в MODX. -->
    <aside class="tree-panel" id="tree-panel" aria-label={t('shell.tree')}>
      <div class="panel-tabs">
        {#if panels.length > 1}
          <!-- svelte-ignore a11y_interactive_supports_focus -->
          <div class="segmented" role="tablist" aria-label={t('shell.tree')} onkeydown={panelKey}>
            {#each panels as id (id)}
              <button
                type="button"
                role="tab"
                id={`tree-tab-${id}`}
                aria-selected={panel === id}
                aria-controls="tree-body"
                tabindex={panel === id ? 0 : -1}
                onclick={() => (panel = id)}
              >
                {t(_PANEL_LABELS[id])}
              </button>
            {/each}
          </div>
        {:else}
          <span class="panel-title">{t('pages.siteTree')}</span>
        {/if}
        <button type="button" class="ghost icon hide" aria-label={t('shell.treeHide')} title={t('shell.treeHide')} onclick={toggleTree}>{@html icons.panelClose}</button>
      </div>
      <div class="tree-body" id="tree-body" role={panels.length > 1 ? 'tabpanel' : undefined} aria-labelledby={panels.length > 1 ? `tree-tab-${panel}` : undefined}>
        {#if panel === 'pages'}<PagesPanel />{:else}<ElementsPanel />{/if}
      </div>
    </aside>
    <!-- Разделитель окна по WAI-ARIA (window splitter): фокусируемый, ширина меняется стрелками. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div class="resizer" role="separator" aria-orientation="vertical" aria-label={t('shell.resize')} aria-valuenow={width} aria-valuetext={`${width} px`} aria-valuemin={_MIN} aria-valuemax={_MAX} tabindex="0" onpointerdown={resize} onkeydown={resizeKey}></div>
    <div class="workspace" inert={drawer || undefined}>
      <button type="button" class="ghost icon show" aria-label={t('shell.treeShow')} title={t('shell.treeShow')} onclick={toggleTree}>{@html icons.panelOpen}</button>
      <main id="main" class="canvas" tabindex="-1">{@render content()}</main>
    </div>
    <div class="scrim" aria-hidden="true" onclick={() => openDrawer(false)}></div>
  </div>
  <CommandPalette />
  <AiPrompt />
  <AppearanceDialog bind:open={appearanceOpen} onclose={() => accountButton?.focus()} />
  <PasswordDialog bind:open={passwordOpen} onclose={() => accountButton?.focus()} />
  <TokensDialog bind:open={tokensOpen} onclose={() => accountButton?.focus()} />
  <AgentPanel />
{:else}
  <div class="loading"><LoadState load={sessionLoad} /></div>
{/if}

<style>
  .skip {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    z-index: 40;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius);
    background: var(--accent);
    color: var(--accent-text);
    transform: translateY(-200%);
  }

  .skip:focus-visible {
    transform: none;
  }

  /* Шапка во всю ширину, под ней — дерево и холстина. Всё на мягком фоне, холстина — белая. */
  .shell {
    /* Шапка с воздухом: разделы не жмутся к краю холстины и друг к другу. */
    --topbar: 5rem;
    display: grid;
    grid-template-columns: var(--tree-width) 0.5rem minmax(0, 1fr);
    grid-template-rows: var(--topbar) 1fr;
    min-height: 100dvh;
  }

  .topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    grid-column: 1 / -1;
    gap: 0.75rem;
    align-items: center;
    padding: 0 1.75rem 0 2rem;
    background: var(--bg);
  }

  /* Название сайта; пока это название программы — её знак. Длинное обрезается многоточием. */
  .brand {
    flex: none;
    max-width: 16rem;
    margin-right: 2.75rem;
    overflow: hidden;
    color: var(--text);
    font-size: 1.25rem;
    font-weight: 750;
    letter-spacing: -0.02em;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color 140ms var(--ease);
  }

  .brand:hover {
    color: var(--accent);
  }

  .brand :global(svg) {
    display: block;
    width: auto;
    height: 1.25rem;
  }

  /* Разделы в строку: значок и подпись; текущий — белой «таблеткой» с тенью. */
  /* Подписи разделов — пока хватает места самой навигации, а не окна (её меряет скрипт): шапка не
     ломается ни при каком числе разделов и длине названия сайта. Тесно — значки с подсказками, подписи
     остаются для читалки. */
  .main-nav {
    flex: 1;
    min-width: 0;
  }

  /* «Ещё» — перелив разделов, не влезших подписями: кнопка в ряду + меню под ней. */
  .nav-more {
    position: relative;
  }

  .more-button {
    display: flex;
    gap: 0.55rem;
    align-items: center;
    min-height: 2.5rem;
    padding: 0 1rem;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    box-shadow: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.9375rem;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
  }

  .more-button :global(svg) {
    width: 1.125rem;
    height: 1.125rem;
  }

  .more-button:hover {
    background: var(--hover);
    color: var(--text);
  }

  .more-button.current {
    background: var(--selected);
    box-shadow: var(--shadow-s), 0 0 0 0.0625rem var(--line);
    color: var(--text);
    font-weight: 600;
  }

  .more-button.current :global(svg) {
    color: var(--accent);
  }

  .more-menu {
    position: absolute;
    top: calc(100% + 0.375rem);
    inset-inline-start: 0;
    z-index: 30;
    display: grid;
    gap: 0.125rem;
    min-width: 12rem;
    padding: 0.375rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  .more-menu a {
    display: flex;
    gap: 0.55rem;
    align-items: center;
    min-height: 2.25rem;
    padding: 0 0.6rem;
    border-radius: var(--radius);
    color: var(--text);
    font-size: 0.9375rem;
    text-decoration: none;
  }

  .more-menu a :global(svg) {
    width: 1rem;
    height: 1rem;
    color: var(--muted);
  }

  .more-menu a:hover {
    background: var(--accent-soft);
  }

  .more-menu a[aria-current='page'],
  .more-menu a[aria-current='page'] :global(svg) {
    color: var(--accent);
  }

  .main-nav ul {
    display: flex;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .main-nav a {
    display: flex;
    gap: 0.55rem;
    align-items: center;
    min-height: 2.5rem;
    padding: 0 1rem;
    border-radius: var(--radius);
    color: var(--muted);
    font-size: 0.9375rem;
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
    transition:
      background-color 140ms var(--ease),
      color 140ms var(--ease);
  }

  .main-nav a :global(svg) {
    width: 1.125rem;
    height: 1.125rem;
  }

  .main-nav a:hover {
    background: var(--hover);
    color: var(--text);
  }

  .main-nav a[aria-current='page'] {
    background: var(--selected);
    box-shadow: var(--shadow-s), 0 0 0 0.0625rem var(--line);
    color: var(--text);
    font-weight: 600;
  }

  .main-nav a[aria-current='page'] :global(svg) {
    color: var(--accent);
  }

  /* Значки справа (Предложения со счётчиком, Настройки, Помощь): текущий раздел — мягкий акцент и
     акцентный значок, как «выбранное», но без белой таблетки среди тихих значков. */
  .badge-link {
    position: relative;
  }

  .topbar .icon[aria-current='page'] {
    background: var(--accent-soft);
  }

  .topbar .icon[aria-current='page'] :global(svg) {
    color: var(--accent);
  }

  .count {
    position: absolute;
    top: 0.25rem;
    inset-inline-end: 0.2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1rem;
    height: 1rem;
    padding: 0 0.22rem;
    border-radius: 1rem;
    background: var(--mark);
    color: var(--mark-text);
    font-size: 0.6875rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    box-shadow: 0 0 0 0.125rem var(--bg);
    pointer-events: none;
  }

  /* Кнопка быстрого перехода — как поле поиска: подсказывает Ctrl+K, а не прячет его. */
  .jump {
    flex: none;
    gap: 0.6rem;
    min-width: 13rem;
    min-height: 2.5rem;
    padding: 0 0.5rem 0 0.75rem;
    border-color: var(--line);
    background: var(--surface);
    box-shadow: none;
    color: var(--muted);
    font-weight: 450;
  }

  .jump:hover:not(:disabled) {
    border-color: var(--field-line);
    color: var(--text);
  }

  .jump :global(svg) {
    width: 1.0625rem;
    height: 1.0625rem;
  }

  .jump kbd {
    margin-left: auto;
  }

  .site {
    flex: none;
    width: 2.5rem;
    min-height: 2.5rem;
  }

  /* Учётная запись — справа; меню раскрывается вниз. */
  .account {
    position: relative;
    flex: none;
  }

  .user {
    gap: 0.55rem;
    min-height: 2.5rem;
    padding: 0 0.5rem 0 0.3rem;
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }

  .user:hover:not(:disabled),
  .user[aria-expanded='true'] {
    border-color: transparent;
    background: var(--hover);
  }

  .who strong {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .user > :global(svg) {
    width: 1rem;
    height: 1rem;
    color: var(--muted);
  }

  .avatar {
    position: relative;
    display: grid;
    flex: none;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 700;
  }

  .account-menu {
    position: absolute;
    top: calc(100% + 0.375rem);
    right: 0;
    z-index: 30;
    display: grid;
    gap: 0.125rem;
    min-width: 16rem;
    padding: 0.375rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  .account-menu p {
    display: grid;
    margin: 0 0 0.25rem;
    padding: 0.4rem 0.6rem 0.6rem;
    border-bottom: 0.0625rem solid var(--line);
    font-size: 0.875rem;
    line-height: 1.35;
  }

  .account-menu p span {
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .account-menu button {
    justify-content: flex-start;
    min-height: 2.25rem;
    border-color: transparent;
    background: transparent;
    box-shadow: none;
    font-weight: 500;
  }

  .account-menu button:hover {
    border-color: transparent;
    background: var(--hover);
    color: var(--text);
  }

  .account-menu :global(svg) {
    color: var(--muted);
  }

  /* Новая версия: точка акцентом на аватаре — тихо, но видно с любой страницы. */
  .update-dot {
    position: absolute;
    top: -0.0625rem;
    right: -0.0625rem;
    width: 0.625rem;
    height: 0.625rem;
    border: 0.125rem solid var(--bg);
    border-radius: 50%;
    background: var(--accent);
  }

  /* Что за программа и какая версия — внизу меню, тихо. */
  .account-menu .about {
    margin: 0.25rem 0 0;
    padding: 0.5rem 0.6rem 0.2rem;
    border-top: 0.0625rem solid var(--line);
    border-bottom: 0;
    color: var(--muted);
    font-size: 0.75rem;
  }

  .account-menu .update {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    padding: 0 0.6rem 0.35rem;
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 600;
    text-decoration: none;
  }

  .account-menu .update::before {
    content: '';
    flex: none;
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 50%;
    background: currentColor;
  }

  .account-menu .update:hover {
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  /* Панель дерева: под шапкой, закреплена, со своими вкладками. */
  .tree-panel {
    position: sticky;
    top: var(--topbar);
    z-index: 10;
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: calc(100dvh - var(--topbar));
    /* Сверху — отступ: вкладки дерева не прилипают к шапке и встают на линию со строкой холстины. */
    padding: 1rem 0 0.75rem 0.75rem;
  }

  [data-tree='closed'] .tree-panel,
  [data-tree='closed'] .resizer {
    visibility: hidden;
  }

  .panel-tabs {
    display: flex;
    gap: 0.25rem;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  /* Вкладки «Страницы / Элементы» — переключателем: белая «таблетка» на подложке, как текущий раздел. */
  .segmented {
    display: grid;
    flex: 1;
    grid-auto-columns: 1fr;
    grid-auto-flow: column;
    gap: 0.125rem;
    padding: 0.1875rem;
    border-radius: calc(var(--radius) + 0.1875rem);
    background: var(--hover);
  }

  .segmented [role='tab'] {
    min-height: 2rem;
    padding: 0 0.75rem;
    border: 0;
    background: transparent;
    box-shadow: none;
    color: var(--muted);
    font-size: 0.875rem;
    font-weight: 550;
  }

  .segmented [role='tab']:hover:not([aria-selected='true']) {
    border: 0;
    background: var(--hover);
    color: var(--text);
  }

  .segmented [aria-selected='true'],
  .segmented [aria-selected='true']:hover {
    background: var(--selected);
    box-shadow: var(--shadow-s), 0 0 0 0.0625rem var(--line);
    color: var(--text);
    font-weight: 600;
  }

  .panel-title {
    padding-left: 0.5rem;
    color: var(--muted);
    font-size: 0.8125rem;
    font-weight: 600;
  }

  .hide {
    flex: none;
    width: 2rem;
    min-height: 2rem;
    margin-left: auto;
  }

  .tree-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  .resizer {
    position: sticky;
    top: var(--topbar);
    height: calc(100dvh - var(--topbar));
    cursor: col-resize;
  }

  .resizer::after {
    display: block;
    width: 0.125rem;
    height: 100%;
    margin: 0 auto;
    border-radius: 1rem;
    content: '';
    transition: background-color 140ms var(--ease);
  }

  .resizer:hover::after {
    background: color-mix(in oklch, var(--accent) 45%, transparent);
  }

  /* С клавиатуры — заметно: полная линия акцента шире, чем под мышью. */
  .resizer:focus-visible::after {
    width: 0.1875rem;
    background: var(--accent);
  }

  .resizer:focus-visible {
    outline: none;
  }

  .workspace {
    position: relative;
    min-width: 0;
    padding: 0 0.5rem 0.5rem 0;
  }

  [data-tree='closed'] .workspace {
    padding-left: 0.5rem;
  }

  /* Холстина: белая рабочая область; страница прокручивается вместе с ней. */
  .canvas {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: calc(100dvh - var(--topbar) - 0.5rem);
    padding: 0 2.25rem 3rem;
    /* Край холста чуть темнее линий внутри: в тёмной схеме холст не сливается с фоном. */
    border: 0.0625rem solid color-mix(in oklab, var(--line), var(--field-line) 35%);
    border-radius: var(--radius-xl);
    background: var(--canvas);
    box-shadow: var(--shadow-s);
  }

  .canvas:focus {
    outline: none;
  }

  /* В окне полосы правки холстина — всё окно: рамка и тень там дала бы второй край. */
  .canvas.embedded {
    min-height: 100dvh;
    padding: 0 1.5rem 2rem;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  [data-tree='closed'] .canvas {
    padding-left: 3.5rem;
  }

  .show {
    position: absolute;
    top: 0.65rem;
    left: 1.15rem;
    z-index: 6;
    display: none;
    width: 2rem;
    min-height: 2rem;
  }

  [data-tree='closed'] .show {
    display: inline-flex;
  }

  .drawer-toggle,
  .scrim {
    display: none;
  }

  .loading,
  /* Менеджер не загрузился: сообщение — посередине, а не полосой во весь экран. */
  .loading {
    max-width: 40rem;
    margin: 12vh auto 0;
  }

  /* Ноутбук: в шапке — подписи разделов, имя пользователя уходит в подсказку. */
  /* Шапка тесная: сначала «Перейти» сжимается до значка и клавиш, потом прячется имя, потом клавиши. */
  @media (width < 110rem) {
    .jump {
      min-width: 0;
    }

    .jump-label {
      display: none;
    }
  }

  /* Имя пользователя уступает место разделам первым: инициалы на аватаре остаются, имя — в меню. */
  @media (width < 110rem) {
    .who {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  }

  /* Ноутбук: шапка плотнее, знак ближе к разделам — подписям разделов нужнее место, чем воздуху. */
  @media (width < 120rem) {
    .topbar {
      gap: 0.5rem;
      padding: 0 1.25rem 0 1.5rem;
    }

    .brand {
      margin-right: 1rem;
    }

    .main-nav ul {
      gap: 0.375rem;
    }

    .main-nav a {
      padding: 0 0.75rem;
    }
  }

  @media (width < 90rem) {
    .brand {
      max-width: 12rem;
      font-size: 1.125rem;
    }

    .brand :global(svg) {
      height: 1.125rem;
    }
  }

  @media (width < 80rem) {
    .jump {
      min-width: 0;
    }

    .jump :is(.jump-label, kbd) {
      display: none;
    }

    .who {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  }

  /* Узкий экран: дерево выезжает поверх холстины по кнопке в шапке, разделы — значками. */
  @media (width < 64rem) {
    .shell,
    .shell[data-tree='closed'] {
      grid-template-columns: minmax(0, 1fr);
    }

    .topbar {
      padding: 0 0.75rem;
    }

    .drawer-toggle {
      display: inline-flex;
      flex: none;
      width: 2.5rem;
    }

    .brand {
      margin-right: 0.25rem;
    }

    .main-nav .label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }

    .main-nav a {
      padding: 0 0.65rem;
    }

    .tree-panel {
      position: fixed;
      top: var(--topbar);
      bottom: 0;
      left: 0;
      z-index: 30;
      width: min(20rem, 88vw);
      height: auto;
      padding: 0.5rem 0.75rem 0.75rem;
      visibility: hidden;
      background: var(--bg);
      box-shadow: var(--shadow-big);
      transform: translateX(-105%);
      transition:
        transform 220ms var(--ease),
        visibility 220ms;
    }

    [data-drawer] .tree-panel,
    [data-drawer][data-tree='closed'] .tree-panel {
      visibility: visible;
      transform: none;
    }

    .resizer,
    .show,
    .hide,
    [data-tree='closed'] .show {
      display: none;
    }

    .workspace,
    [data-tree='closed'] .workspace {
      padding: 0 0.375rem 0.375rem;
    }

    [data-drawer] .scrim {
      position: fixed;
      inset: var(--topbar) 0 0;
      z-index: 25;
      display: block;
      background: oklch(15% 0.02 var(--hue) / 0.3);
    }

    .canvas,
    [data-tree='closed'] .canvas {
      min-height: calc(100dvh - var(--topbar) - 0.375rem);
      padding: 0 1.25rem 5rem;
    }
  }

  /* Телефон: знак уходит, сайт открывается по адресу страницы в редакторе. */
  @media (width < 48rem) {
    .shell {
      --topbar: 3.5rem;
    }

    .topbar {
      padding: 0 0.75rem;
    }

    .topbar :is(.brand, .site) {
      display: none;
    }

    /* Значки разделов не помещаются рядом с поиском и учётной записью: строка прокручивается вбок,
       край затухает — видно, что дальше есть ещё. */
    /* Скрытые подписи разделов спозиционированы абсолютно: строка держит их у себя, иначе они раздвинут страницу. */
    .main-nav {
      position: relative;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scrollbar-width: none;
      mask-image: linear-gradient(to right, #000 calc(100% - 1.25rem), transparent);
    }

    .main-nav::-webkit-scrollbar {
      display: none;
    }

    .canvas,
    [data-tree='closed'] .canvas {
      padding: 0 1rem 5rem;
      border-radius: var(--radius-l);
    }
  }
</style>
