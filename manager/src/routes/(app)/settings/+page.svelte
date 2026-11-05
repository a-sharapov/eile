<script lang="ts">
import { tick } from 'svelte';
import { aiScope } from '#lib/ai.svelte.ts';
import { api } from '#lib/api.ts';
import { ask, modalOpen } from '#lib/dialog.svelte.ts';
import { guardUnsaved } from '#lib/guard.svelte.ts';
import { quoted, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { describe, failed, notify } from '#lib/notices.svelte.ts';
import { session } from '#lib/session.svelte.ts';
import { branchOrder, loadTree } from '#lib/tree.svelte.ts';
import type { CustomSetting, Settings, Translation } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import MediaField from '#lib/ui/MediaField.svelte';
import PageHeader from '#lib/ui/PageHeader.svelte';
import PasswordInput from '#lib/ui/PasswordInput.svelte';
import Tabs from '#lib/ui/Tabs.svelte';
import { firstInvalid, freshForm } from '#lib/validity.ts';
import { page } from '$app/state';
import HttpsSettings from './HttpsSettings.svelte';
import NotifySettings from './NotifySettings.svelte';
import PageCacheSettings from './PageCacheSettings.svelte';
import RedirectsSettings from './RedirectsSettings.svelte';
import StatsSettings from './StatsSettings.svelte';
import UpkeepSettings from './UpkeepSettings.svelte';

let settings = $state<Settings | null>(null);
let saved = $state('');
let translations = $state<Translation[]>([]);
let custom = $state<CustomSetting[]>([]);
// Вкладку можно открыть ссылкой: ?tab=notify — из уведомления о сбое.
let tab = $state(page.url.searchParams.get('tab') ?? 'site');
let filter = $state('');
let busy = $state(false);

const loading = defineLoad(() =>
  Promise.all([
    api.get<Settings>('/settings').then(accept),
    api.get<Translation[]>('/translations').then((_) => (translations = _)),
    api.get<CustomSetting[]>('/custom-settings').then((_) => (custom = _)),
    api.get<AiStatus>('/assistant').then(acceptAi),
    loadTree(),
  ])
);

$effect(() => void loading.retry());

$effect(() => aiScope({ area: t('aiFacts.settings'), facts: [] }));

// Подключение ИИ: ключ в форму не возвращается — поле ключа пустое, пока его не меняют.
type AiStatus = {
  connected: boolean;
  url: string;
  model: string;
  instructions: string;
  vision: boolean;
};

let aiStatus = $state<AiStatus>({
  connected: false,
  url: '',
  model: '',
  instructions: '',
  vision: false,
});
let aiForm = $state({
  url: '',
  model: '',
  key: '',
  instructions: '',
  vision: false,
});
let aiBusy = $state(false);
let aiCheck = $state<{ ok: boolean; text: string } | null>(null);

function acceptAi(next: AiStatus) {
  aiStatus = next;
  aiForm = { ...next, key: '' };
  session.ai = next.connected;
  session.aiVision = next.connected && next.vision;
}

const saveAi = (event: SubmitEvent) => {
  event.preventDefault();
  const invalid = firstInvalid(event.currentTarget as HTMLFormElement);
  return invalid
    ? invalid.report()
    : ((aiBusy = true),
      (aiCheck = null),
      api
        .send<AiStatus>('PUT', '/assistant', aiForm)
        .then((_) => (acceptAi(_), notify(t('aiSettings.saved'))))
        .then(undefined, failed)
        .finally(() => (aiBusy = false)));
};

// Проверка — настоящий короткий запрос к модели: адрес, ключ и модель верны, если она ответила.
const testAi = () => (
  (aiBusy = true),
  (aiCheck = null),
  api
    .send<{ reply: string }>('POST', '/assistant/test')
    .then(
      (_) =>
        (aiCheck = {
          ok: true,
          text: _.reply.trim()
            ? `${t('aiSettings.works')} ${quoted(_.reply.trim())}`
            : t('aiSettings.worksSilent'),
        }),
      (error) => (aiCheck = { ok: false, text: describe(error) })
    )
    .finally(() => (aiBusy = false))
);

const disconnectAi = () =>
  ask({
    title: t('aiSettings.disconnectTitle'),
    body: t('aiSettings.disconnectBody'),
    confirm: t('aiSettings.disconnect'),
    tone: 'danger',
  })
    .then((confirmed) =>
      confirmed
        ? api
            .send('DELETE', '/assistant')
            .then(() =>
              acceptAi({
                connected: false,
                url: '',
                model: '',
                instructions: '',
                vision: false,
              })
            )
            .then(
              () => ((aiCheck = null), notify(t('aiSettings.disconnected')))
            )
        : undefined
    )
    .then(undefined, failed);

function accept(next: Settings) {
  settings = next;
  saved = JSON.stringify(next);
  languagesText = next.languages.join(', ');
}

const dirty = $derived(settings !== null && JSON.stringify(settings) !== saved);
// Сохранённый объём кэша: после сохранения сводка кэша перечитывается с новым бюджетом.
const savedCacheMb = $derived(
  saved ? (JSON.parse(saved) as Settings).pageCacheMb : 0
);

// Какие вкладки с правками: отметка на вкладке напоминает о них, пока смотришь другую.
const _SITE = [
  'name',
  'homePageId',
  'notFoundPageId',
  'language',
  'languages',
  'pageCacheMb',
] as const;
const _SEARCH = [
  'siteUrl',
  'description',
  'socialImage',
  'aiSearch',
  'aiTraining',
  'robots',
  'searchSynonyms',
  'pagingSegment',
  'pagingCanonical',
] as const;

const changedIn = (keys: readonly (keyof Settings)[]): boolean =>
  settings !== null &&
  ((before) =>
    keys.some(
      (_) => JSON.stringify(settings![_]) !== JSON.stringify(before[_])
    ))(JSON.parse(saved) as Settings);

guardUnsaved(() => dirty);

const pages = $derived(branchOrder(null));
const languages = $derived(
  settings ? [settings.language, ...settings.languages] : []
);

// Списки языков — строкой «en, de»: так их проще вписать, чем собирать по одному.
// Текст поля — свой: список разбирается на каждом вводе (Ctrl+S сохраняет набранное сразу),
// а поле не переписывается под пальцами, пока набираешь «en, ».
let languagesText = $state('');
const setLanguages = (text: string) =>
  void (
    settings &&
    (settings.languages = text
      .split(/[\s,]+/)
      .map((_) => _.trim())
      .filter(Boolean))
  );

let form = $state<HTMLFormElement>();

const valid = (): Promise<boolean> =>
  ((found) =>
    found
      ? ((tab = found.tab ?? tab), tick().then(() => (found.report(), false)))
      : Promise.resolve(true))(firstInvalid(form));

const save = (event?: Event) => (
  event?.preventDefault(),
  dirty && !busy && settings
    ? valid().then(
        (ok): unknown =>
          ok &&
          ((busy = true),
          api
            .send<Settings>('PATCH', '/settings', settings)
            .then(
              (_) => (
                accept(_),
                (session.site = { name: _.name, url: _.siteUrl }),
                notify(t('settings.saved'))
              )
            )
            .then(undefined, failed)
            .finally(() => (busy = false)))
      )
    : undefined
);

const onKey = (event: KeyboardEvent) =>
  void (
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === 's' &&
    // Под открытым диалогом страница не сохраняется, но и браузер не открывает своё «Сохранить как».
    (event.preventDefault(), modalOpen() || save())
  );

const focusOn = (selector: string) =>
  tick().then(() => document.querySelector<HTMLElement>(selector)?.focus());

// Ключ уже есть: заменить его значение можно, но только спросив.
const replaces = (exists: boolean, item: string): Promise<boolean> =>
  exists
    ? ask({
        title: t('settings.replaceTitle'),
        body: t('settings.replaceBody'),
        items: [item],
        confirm: t('settings.replace'),
      })
    : Promise.resolve(true);

// Переводы и свои настройки сохраняются по строке, сразу после правки: формы «Сохранить» у таблицы нет.
// Сервер не хранит пустые переводы: если ключ пропал из ответа, перевод удалён, а не сохранён.
const saveTranslation = (
  key: string,
  values: Record<string, string>
): Promise<boolean> =>
  api
    .send<Translation[]>('PUT', `/translations/${key}`, { values })
    .then((_) => ((translations = _), _.some((row) => row.key === key)))
    .then(
      (kept) => (
        notify(t(kept ? 'translations.saved' : 'translations.cleared')), kept
      )
    )
    .then(undefined, (error) => (failed(error), false));

const removeTranslation = (key: string) =>
  ask({
    title: t('translations.removeTitle'),
    body: t('translations.removeBody'),
    items: [`{i18n.${key}}`],
    confirm: t('translations.remove'),
    tone: 'danger',
  })
    .then((confirmed) =>
      confirmed
        ? api
            .send<Translation[]>('DELETE', `/translations/${key}`)
            .then(
              (_) => (
                (translations = _),
                notify(t('translations.removed')),
                focusOn('#new-translation-key')
              )
            )
        : undefined
    )
    .then(undefined, failed);

// Пустой перевод сервер не хранит: стереть последний текст ключа — значит удалить ключ, и об этом спрашиваем.
const editTranslation = (
  row: Translation,
  language: string,
  input: HTMLInputElement | HTMLTextAreaElement
) =>
  ((values) =>
    Object.values(values).some((_) => _.trim() !== '')
      ? saveTranslation(row.key, values)
      : ask({
          title: t('translations.removeTitle'),
          body: t('translations.clearBody'),
          items: [`{i18n.${row.key}}`],
          confirm: t('translations.remove'),
          tone: 'danger',
        }).then((confirmed) =>
          confirmed
            ? saveTranslation(row.key, values)
            : void (input.value = row.values[language] ?? '')
        ))({ ...row.values, [language]: input.value });

let added = $state({ key: '', text: '' });

// Новый ключ сразу получает текст на языке по умолчанию: пустой перевод сервер не хранит.
// В ячейке перевода и своей настройки Enter сохраняет, как в обычном поле; перенос строки — Shift+Enter:
// так пишут список по пункту на строку. В <input> перевод строки браузер вырезал бы при правке.
const commitOnEnter = (event: KeyboardEvent) =>
  void (
    event.key === 'Enter' &&
    !event.shiftKey &&
    (event.preventDefault(), (event.currentTarget as HTMLElement).blur())
  );

const addTranslation = (event: SubmitEvent): unknown => {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const invalid = firstInvalid(form);
  return invalid ? invalid.report() : _addTranslation(form);
};

const _addTranslation = (form: HTMLFormElement) => {
  const key = added.key.trim();
  const existing = translations.find((_) => _.key === key);
  return replaces(existing !== undefined, `{i18n.${key}}`).then(
    (ok): unknown =>
      ok &&
      saveTranslation(key, {
        ...existing?.values,
        [settings!.language]: added.text.trim(),
      }).then(
        (kept): unknown =>
          kept &&
          freshForm(form, () => {
            added = { key: '', text: '' };
          }).then(() => focusOn('#new-translation-key'))
      )
  );
};

const shown = $derived(
  translations.filter(
    (_) =>
      filter.trim() === '' ||
      _.key.toLowerCase().includes(filter.trim().toLowerCase()) ||
      Object.values(_.values).some((value) =>
        value.toLowerCase().includes(filter.trim().toLowerCase())
      )
  )
);

// Пояснение уходит только из формы добавления: правка значения в таблице его не трогает.
const saveSetting = (
  key: string,
  value: string,
  note?: string
): Promise<boolean> =>
  api
    .send<CustomSetting[]>(
      'PUT',
      `/custom-settings/${key}`,
      note === undefined ? { value } : { value, note }
    )
    .then((_) => ((custom = _), notify(t('custom.saved')), true))
    .then(undefined, (error) => (failed(error), false));

const removeSetting = (key: string) =>
  ask({
    title: t('custom.removeTitle'),
    body: t('custom.removeBody'),
    items: [`[@${key}]`],
    confirm: t('custom.remove'),
    tone: 'danger',
  })
    .then((confirmed) =>
      confirmed
        ? api
            .send<CustomSetting[]>('DELETE', `/custom-settings/${key}`)
            .then(
              (_) => (
                (custom = _),
                notify(t('custom.removed')),
                focusOn('#new-setting-key')
              )
            )
        : undefined
    )
    .then(undefined, failed);

let newSetting = $state({ key: '', value: '', note: '' });

const addSetting = (event: SubmitEvent): unknown => {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const invalid = firstInvalid(form);
  return invalid ? invalid.report() : _addSetting(form);
};

const _addSetting = (form: HTMLFormElement) => {
  const key = newSetting.key.trim();
  return replaces(
    custom.some((_) => _.key === key),
    `[@${key}]`
  ).then(
    (ok): unknown =>
      ok &&
      saveSetting(key, newSetting.value, newSetting.note).then(
        (kept): unknown =>
          kept &&
          freshForm(form, () => {
            newSetting = { key: '', value: '', note: '' };
          }).then(() => focusOn('#new-setting-key'))
      )
  );
};

const copy = (text: string) =>
  navigator.clipboard
    .writeText(text)
    .then(() => notify(`${t('common.copied')} ${text}`), failed);

const files = ['/sitemap.xml', '/robots.txt', '/llms.txt', '/llms-full.txt'];

// Картинка для соцсетей: 1200×630 — размер, который они показывают без обрезки.
const _SOCIAL_SIZE = { width: 1200, height: 630 } as const;
</script>

<svelte:head><title>{t('settings.title')} — {t('app.name')}</title></svelte:head>

<svelte:window onkeydown={onKey} />

<!-- Две модели сохранения на одном экране, и обе видны: таблицы — сразу, поля сайта — кнопкой. -->
{#snippet actions()}
  {#if (tab === 'translations' && translations.length > 0) || (tab === 'custom' && custom.length > 0)}
    <span class="autosave">{@html icons.check}{t('settings.autosave')}</span>
  {/if}
  {#if tab === 'site' || tab === 'search' || dirty}
    <button type="submit" form="settings-form" class="primary" aria-disabled={busy || !dirty} aria-keyshortcuts="Control+S" title={dirty ? `${t('common.unsaved')} · ${t('common.ctrl')}+S` : `${t('common.ctrl')}+S`}>
      {#if dirty}<span class="dirty" aria-hidden="true"></span>{/if}{t('settings.save')}{#if dirty}<span class="sr-only">: {t('common.unsaved')}</span>{/if}
    </button>
  {/if}
{/snippet}

{#snippet redirectsTab()}
  <RedirectsSettings />
{/snippet}

{#snippet notifyTab()}
  <NotifySettings />
{/snippet}

{#snippet upkeepTab()}
  <UpkeepSettings />
{/snippet}

{#snippet statsTab()}
  <StatsSettings />
{/snippet}

{#snippet aiTab()}
  <section class="form-section">
    <header>
      <h2>{t('aiSettings.title')}</h2>
      <p>{t('aiSettings.intro')}</p>
    </header>
    <form class="fields" novalidate onsubmit={saveAi}>
      <label>
        <span>{t('aiSettings.url')}<span class="required" aria-hidden="true"> *</span></span>
        <input type="url" required bind:value={aiForm.url} placeholder="https://api.deepseek.com" data-ai="off" />
        <small>{t('aiSettings.urlHint')}</small>
      </label>
      <label>
        <span>{t('aiSettings.model')}<span class="required" aria-hidden="true"> *</span></span>
        <input class="code" required bind:value={aiForm.model} list="ai-models" placeholder="deepseek-flash" data-ai="off" />
        <datalist id="ai-models">
          <option value="deepseek-flash"></option>
          <option value="deepseek-v4-pro"></option>
          <option value="gpt-4o-mini"></option>
        </datalist>
        <small>{t('aiSettings.modelHint')}</small>
      </label>
      <label>
        <span id="ai-key-label">{t('aiSettings.key')}{#if !aiStatus.connected}<span class="required" aria-hidden="true"> *</span>{/if}</span>
        <PasswordInput id="ai-key" labelledby="ai-key-label" required={!aiStatus.connected} autocomplete="off" bind:value={aiForm.key} placeholder={aiStatus.connected ? t('aiSettings.keyKept') : 'sk-…'} data-ai="off" />
        <small>{t(aiStatus.connected ? 'aiSettings.keySavedHint' : 'aiSettings.keyHint')}</small>
      </label>
      <label>
        {t('aiSettings.instructions')}
        <textarea rows="4" maxlength="2000" bind:value={aiForm.instructions} placeholder={t('aiSettings.instructionsPlaceholder')} data-ai="off"></textarea>
        <small>{t('aiSettings.instructionsHint')}</small>
      </label>
      <label class="option">
        <input type="checkbox" bind:checked={aiForm.vision} />
        <span><strong>{t('aiSettings.vision')}</strong><small class="help">{t('aiSettings.visionHint')}</small></span>
      </label>
      <div class="ai-actions">
        <button class="primary" aria-disabled={aiBusy}>{t(aiStatus.connected ? 'aiSettings.update' : 'aiSettings.connect')}</button>
        {#if aiStatus.connected}
          <button type="button" aria-disabled={aiBusy} onclick={testAi}>{t('aiSettings.test')}</button>
          <button type="button" class="danger" onclick={disconnectAi}>{t('aiSettings.disconnect')}</button>
        {/if}
      </div>
      {#if aiBusy}<p class="help" role="status">{t('ai.thinking')}</p>{/if}
      {#if aiCheck}<p class={aiCheck.ok ? 'ai-ok' : 'field-error'} role="status">{aiCheck.text}</p>{/if}
    </form>
  </section>
  <section class="form-section">
    <header>
      <h2>{t('aiSettings.howTitle')}</h2>
      <p>{t('aiSettings.howIntro')}</p>
    </header>
    <div class="fields">
      <ul class="ai-how">
        <li>{t('aiSettings.how1')}</li>
        <li>{t('aiSettings.how2')}</li>
        <li>{t('aiSettings.how3')}</li>
        <li>{t('aiSettings.how4')}</li>
      </ul>
    </div>
  </section>
{/snippet}

{#snippet siteTab()}
  {#if settings}
    <section class="form-section">
      <header>
        <h2>{t('settings.sectionSite')}</h2>
        <p>{t('settings.sectionSiteHint')}</p>
      </header>
      <div class="fields">
        <label><span>{t('settings.name')}<span class="required" aria-hidden="true"> *</span></span><input form="settings-form" required maxlength="200" bind:value={settings.name} /></label>
        <div class="fields-2">
          <label>
            {t('settings.home')}
            <select bind:value={settings.homePageId}>
              <option value={null}>{t('settings.none')}</option>
              {#each pages as { node, depth } (node.id)}<option value={node.id}>{' '.repeat(depth)}{node.title}</option>{/each}
            </select>
          </label>
          <label>
            {t('settings.notFound')}
            <select bind:value={settings.notFoundPageId}>
              <option value={null}>{t('settings.none')}</option>
              {#each pages as { node, depth } (node.id)}<option value={node.id}>{' '.repeat(depth)}{node.title}</option>{/each}
            </select>
            <small>{t('settings.notFoundHint')}</small>
          </label>
        </div>
      </div>
    </section>
    <section class="form-section">
      <header>
        <h2>{t('settings.sectionLanguages')}</h2>
        <p>{t('settings.sectionLanguagesHint')}</p>
      </header>
      <div class="fields fields-2">
        <label>
          <span>{t('settings.language')}<span class="required" aria-hidden="true"> *</span></span>
          <input form="settings-form" required pattern="[a-z]{'{'}2,3{'}'}(-[A-Za-z0-9]{'{'}2,8{'}'})*" title={t('settings.languageHint')} bind:value={settings.language} />
          <small>{t('settings.languageHint')}</small>
        </label>
        <label>
          {t('settings.languages')}
          <input form="settings-form" pattern={'\\s*[a-z]{2,3}(-[A-Za-z0-9]{2,8})*(\\s*[,\\s]\\s*[a-z]{2,3}(-[A-Za-z0-9]{2,8})*)*\\s*'} bind:value={languagesText} oninput={() => setLanguages(languagesText)} />
          <small>{t('settings.languagesHint')}</small>
        </label>
      </div>
    </section>
    <PageCacheSettings bind:size={settings.pageCacheMb} applied={savedCacheMb} />
    <HttpsSettings />
  {/if}
{/snippet}

{#snippet searchTab()}
  {#if settings}
    <section class="form-section">
      <header>
        <h2>{t('settings.sectionSnippet')}</h2>
        <p>{t('settings.sectionSnippetHint')}</p>
      </header>
      <div class="fields">
        <label>
          {t('settings.siteUrl')}
          <input form="settings-form" type="url" bind:value={settings.siteUrl} placeholder="https://example.com" />
          <small>{t('settings.siteUrlHint')}</small>
        </label>
        <label>
          {t('settings.description')}
          <textarea form="settings-form" rows="3" maxlength="500" bind:value={settings.description}></textarea>
          <small class:over={settings.description.length > 160}>{t('settings.descriptionHint')} {settings.description.length}/160</small>
        </label>
        <MediaField label={t('settings.socialImage')} hint={t('settings.socialImageHint')} size={_SOCIAL_SIZE} bind:value={() => settings!.socialImage || null, (_) => (settings!.socialImage = _ ?? '')} />
      </div>
    </section>
    <section class="form-section">
      <header>
        <h2>{t('settings.ai')}</h2>
        <p>{t('settings.aiHint')}</p>
      </header>
      <div class="fields">
        <label class="option">
          <input type="checkbox" bind:checked={settings.aiSearch} />
          <span><strong>{t('settings.aiSearch')}</strong><small class="help">{t('settings.aiSearchHint')}</small></span>
        </label>
        <label class="option">
          <input type="checkbox" bind:checked={settings.aiTraining} />
          <span><strong>{t('settings.aiTraining')}</strong><small class="help">{t('settings.aiTrainingHint')}</small></span>
        </label>
      </div>
    </section>
    <section class="form-section">
      <header>
        <h2>{t('settings.sectionPaging')}</h2>
        <p>{t('settings.sectionPagingHint')}</p>
      </header>
      <div class="fields">
        <label>
          {t('settings.pagingSegment')}
          <input form="settings-form" class="code" bind:value={settings.pagingSegment} required maxlength="32" pattern="[a-z][a-z0-9]*(-[a-z0-9]+)*" spellcheck="false" autocomplete="off" />
          <small>{t('settings.pagingSegmentHint')} <span class="code">/blog/{settings.pagingSegment || 'page'}-2</span></small>
        </label>
        <label>
          {t('settings.pagingCanonical')}
          <select form="settings-form" bind:value={settings.pagingCanonical}>
            <option value="self">{t('settings.pagingCanonicalSelf')}</option>
            <option value="first">{t('settings.pagingCanonicalFirst')}</option>
          </select>
          <small>{t('settings.pagingCanonicalHint')}</small>
        </label>
      </div>
    </section>
    <section class="form-section">
      <header>
        <h2>{t('settings.sectionRobots')}</h2>
        <p>{t('settings.sectionRobotsHint')}</p>
      </header>
      <div class="fields">
        <label>
          {t('settings.robots')}
          <textarea form="settings-form" class="code" rows="4" maxlength="5000" bind:value={settings.robots}></textarea>
          <small>{t('settings.robotsHint')}</small>
        </label>
        <p class="files">
          <span class="muted">{t('settings.files')}</span>
          {#each files as file (file)}<a href={file} target="_blank" rel="noopener">{file}{@html icons.external}</a>{/each}
        </p>
      </div>
    </section>
    <section class="form-section">
      <header>
        <h2>{t('settings.sectionSiteSearch')}</h2>
        <p>{t('settings.sectionSiteSearchHint')}</p>
      </header>
      <div class="fields">
        <label>
          {t('settings.synonyms')}
          <textarea form="settings-form" rows="5" maxlength="20000" bind:value={settings.searchSynonyms} placeholder={t('settings.synonymsExample')}></textarea>
          <small>{t('settings.synonymsHint')}</small>
        </label>
      </div>
    </section>
  {/if}
{/snippet}

{#snippet translationsTab()}
  <p class="help intro">{t('translations.intro')}</p>
  <div class="table-tools">
    <form class="add" novalidate onsubmit={addTranslation}>
      <label>
        {t('translations.newKey')}
        <input id="new-translation-key" class="code" required pattern="[A-Za-z_][A-Za-z0-9_]*" title={t('settings.keyHint')} bind:value={added.key} placeholder="footerText" />
      </label>
      <label>
        {t('translations.newText')} ({settings?.language})
        <input required bind:value={added.text} />
      </label>
      <button>{@html icons.plus}{t('translations.add')}</button>
    </form>
    {#if translations.length > 0}
      <label class="search">
        <span class="sr-only">{t('translations.search')}</span>
        <input type="search" bind:value={filter} placeholder={t('translations.search')} />
      </label>
    {/if}
  </div>
  {#if translations.length === 0}
    <p class="muted">{t('translations.empty')}</p>
  {:else}
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>{t('translations.key')}</th>
            {#each languages as language (language)}<th>{language}{#if language === settings?.language}{' '}<span class="muted">· {t('translations.default')}</span>{/if}</th>{/each}
            <th><span class="sr-only">{t('users.actions')}</span></th>
          </tr>
        </thead>
        <tbody>
          {#each shown as row (row.key)}
            <tr>
              <td><code>{row.key}</code></td>
              {#each languages as language (language)}
                <td>
                  <textarea
                    rows="1"
                    class:fallback={language !== settings?.language}
                    aria-label={`${row.key} · ${language}`}
                    title={language !== settings?.language && !row.values[language] ? t('translations.missing') : undefined}
                    value={row.values[language] ?? ''}
                    placeholder={language === settings?.language ? '' : (row.values[settings?.language ?? ''] ?? '')}
                    onkeydown={commitOnEnter}
                    onchange={(e) => editTranslation(row, language, e.currentTarget)}
                  ></textarea>
                </td>
              {/each}
              <td class="row-actions">
                <button type="button" class="icon" aria-label={`${t('common.copy')}: {i18n.${row.key}}`} title={`{i18n.${row.key}}`} onclick={() => copy(`{i18n.${row.key}}`)}>{@html icons.copy}</button>
                <button type="button" class="icon danger" aria-label={`${t('translations.remove')}: ${row.key}`} title={t('translations.remove')} onclick={() => removeTranslation(row.key)}>{@html icons.trash}</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/snippet}

{#snippet customTab()}
  <p class="help intro">{t('custom.intro')}</p>
  <form class="add wide" novalidate onsubmit={addSetting}>
    <label>
      {t('custom.newKey')}
      <input id="new-setting-key" class="code" required pattern="[A-Za-z_][A-Za-z0-9_]*" title={t('settings.keyHint')} bind:value={newSetting.key} placeholder="phone" />
    </label>
    <label>
      {t('custom.value')}
      <input bind:value={newSetting.value} />
    </label>
    <label>
      {t('custom.note')}
      <input bind:value={newSetting.note} maxlength="500" placeholder={t('custom.notePlaceholder')} />
    </label>
    <button>{@html icons.plus}{t('custom.add')}</button>
  </form>
  {#if custom.length === 0}
    <p class="muted">{t('custom.empty')}</p>
  {:else}
    <div class="scroll">
      <table>
        <thead>
          <tr><th>{t('custom.key')}</th><th>{t('custom.value')}</th><th><span class="sr-only">{t('users.actions')}</span></th></tr>
        </thead>
        <tbody>
          {#each custom as row (row.key)}
            <tr>
              <td>
                <code>[@{row.key}]</code>
                {#if row.note}<small class="note" id="note-{row.key}">{row.note}</small>{/if}
              </td>
              <td><textarea rows="1" aria-label={row.key} aria-describedby={row.note ? `note-${row.key}` : undefined} value={row.value} onkeydown={commitOnEnter} onchange={(e) => saveSetting(row.key, e.currentTarget.value)}></textarea></td>
              <td class="row-actions">
                <button type="button" class="icon" aria-label={`${t('common.copy')}: [@${row.key}]`} title={`[@${row.key}]`} onclick={() => copy(`[@${row.key}]`)}>{@html icons.copy}</button>
                <button type="button" class="icon danger" aria-label={`${t('custom.remove')}: ${row.key}`} title={t('custom.remove')} onclick={() => removeSetting(row.key)}>{@html icons.trash}</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/snippet}

<PageHeader title={t('settings.title')} crumbs={[{ label: t('nav.settings') }]} {actions} />
<!-- Поля сайта на вкладках связаны с формой атрибутом form: у таблиц на других вкладках свои формы. -->
<form id="settings-form" novalidate onsubmit={save} bind:this={form}></form>
<LoadState load={loading}>
<Tabs
  label={t('settings.title')}
  bind:current={tab}
  tabs={[
    { id: 'site', label: t('settings.tabSite'), flag: changedIn(_SITE), content: siteTab },
    { id: 'search', label: t('settings.tabSearch'), flag: changedIn(_SEARCH), content: searchTab },
    { id: 'translations', label: t('settings.tabTranslations'), content: translationsTab },
    { id: 'custom', label: t('settings.tabCustom'), content: customTab },
    { id: 'ai', label: t('settings.tabAi'), content: aiTab },
    { id: 'notify', label: t('settings.tabNotify'), content: notifyTab },
    { id: 'upkeep', label: t('settings.tabUpkeep'), content: upkeepTab },
    { id: 'redirects', label: t('settings.tabRedirects'), content: redirectsTab },
    { id: 'stats', label: t('settings.tabStats'), content: statsTab },
  ]}
/>
</LoadState>

<style>
  .ai-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .ai-ok {
    margin: 0;
    color: var(--ok);
    font-size: 0.875rem;
  }

  .ai-how {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding-left: 1.25rem;
    color: var(--muted);
    font-size: 0.875rem;
  }

  .dirty {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--mark);
  }

  .intro {
    margin: 0;
    max-width: 68ch;
  }

  /* Длиннее рекомендуемого — предупреждение: сохранить можно, поисковик просто обрежет. */
  .over {
    color: var(--warn);
  }

  /* Статус вместо кнопки: та же высота, шапка не прыгает при смене вкладки. */
  .autosave {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
    min-height: var(--control);
    color: var(--muted);
    font-size: 0.8125rem;
  }

  .autosave :global(svg) {
    width: 1rem;
    height: 1rem;
    color: var(--ok);
  }

  .files {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    align-items: center;
    margin: 0;
    font-size: 0.8125rem;
  }

  .files a {
    display: inline-flex;
    gap: 0.25rem;
    align-items: center;
    font-family: var(--mono);
  }

  .files :global(svg) {
    width: 0.85rem;
    height: 0.85rem;
  }

  .table-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
    align-items: flex-end;
    justify-content: space-between;
  }

  .search {
    flex: 1 1 14rem;
    max-width: 22rem;
  }

  /* Форма добавления: на телефоне поля — во всю ширину, кнопка под ними. */
  .add {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: flex-end;
  }

  .add label {
    position: relative;
    flex: 1 1 11rem;
  }

  /* Ошибка поля — под ним, не сдвигая поля и кнопку в строке; форма уступает ей место снизу. */
  .add :global(.field-error) {
    position: absolute;
    top: calc(100% + 0.25rem);
    left: 0;
    white-space: nowrap;
  }

  /* Место под сообщение — у всей строки, а не у формы: поиск рядом остаётся на одной линии с полями. */
  :is(.table-tools, .add.wide):has(:global(.field-error)) {
    margin-bottom: 1.25rem;
  }

  .add.wide label {
    flex-basis: 14rem;
  }

  /* Опорный блок для скрытых подписей столбцов: без него они уводят страницу вбок. */
  .scroll {
    position: relative;
    overflow-x: auto;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
  }

  /* Пояснение своей настройки — под ключом, мелко: что это и где взять значение. */
  .note {
    display: block;
    max-width: 28rem;
    margin-top: 0.25rem;
    color: var(--muted);
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  /* Текст перевода и значение настройки видны целиком: ячейка растёт по содержимому, Enter сохраняет,
     Shift+Enter — перенос. */
  td textarea {
    display: block;
    width: 100%;
    min-width: 12rem;
    min-height: var(--control);
    max-height: 12rem;
    resize: none;
    field-sizing: content;
  }

  /* Нет перевода: подставится основной язык — подсказка курсивом на тёплом фоне, не похожа на текст. */
  td textarea.fallback:placeholder-shown {
    border-style: dashed;
    background: color-mix(in oklch, var(--warn) 7%, var(--surface));
  }

  td textarea.fallback::placeholder {
    color: var(--muted);
    font-style: italic;
  }

  .row-actions {
    width: 1%;
    white-space: nowrap;
  }

  .row-actions .icon {
    width: 2rem;
    min-height: 2rem;
  }
</style>
