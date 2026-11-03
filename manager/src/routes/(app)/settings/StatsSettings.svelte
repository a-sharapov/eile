<script lang="ts">
import { api } from '#lib/api.ts';
import { t, tn } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import { failed, notify } from '#lib/notices.svelte.ts';
import type { StatsSettings } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import { resolve } from '$app/paths';

let settings = $state<StatsSettings | null>(null);
// Ссылки-цели правятся текстом, по одной в строке: список собирается при сохранении.
let links = $state('');
let busy = $state(false);

const accept = (next: StatsSettings): void => (
  (settings = next), void (links = next.goalLinks.join('\n'))
);

const loading = defineLoad(() =>
  api.get<StatsSettings>('/stats/settings').then(accept)
);
$effect(() => void loading.retry());

// Пояса — из браузера: тот же список IANA, что у сервера.
const _ZONES = Intl.supportedValuesOf('timeZone');

const _RETENTION = [0, 90, 180, 365, 730, 1825];

const save = (event: SubmitEvent) => (
  event.preventDefault(),
  busy ||
    !settings ||
    ((busy = true),
    api
      .send<StatsSettings>('PUT', '/stats/settings', {
        ...settings,
        retentionDays: Number(settings.retentionDays),
        goalLinks: links
          .split('\n')
          .map((_) => _.trim())
          .filter(Boolean),
      })
      .then((_) => (accept(_), notify(t('statsSettings.saved'))))
      .then(undefined, failed)
      .finally(() => (busy = false)))
);

// Образец для политики конфиденциальности сайта: о самом счёте Eile, на языках сайтов, а не менеджера.
const _PRIVACY = [
  {
    language: 'Deutsch',
    text: 'Um zu sehen, wie unsere Website genutzt wird, zählt unser Server die Seitenaufrufe selbst, ohne Cookies und ohne Dienste Dritter. Dafür wird auf Ihrem Endgerät nichts gespeichert und nichts ausgelesen. Aus Ihrer IP-Adresse und der Browserkennung (User-Agent), die Ihr Browser bei jedem Seitenaufruf ohnehin übermittelt, bildet der Server zusammen mit einem täglich neu erzeugten Zufallswert einen gekürzten Hashwert; die IP-Adresse selbst wird dafür nicht gespeichert. Der Zufallswert liegt nur im Arbeitsspeicher und wird um Mitternacht verworfen, die Hashwerte des Tages werden gelöscht. Dauerhaft bleiben nur zusammengefasste Zahlen pro Tag: aufgerufene Seiten, die Domain der Website, von der Sie gekommen sind, Kampagnenparameter (utm_*), die Einstiegsseite, die Geräteklasse (Smartphone, Tablet, Desktop) und die Sprache. Ebenfalls nur als Zahl erfassen wir, ob ein Formular abgeschickt wurde. Wir können diese Daten nicht Ihrer Person zuordnen und Sie an späteren Tagen nicht wiedererkennen. Rechtsgrundlage ist unser berechtigtes Interesse an einer datensparsamen Reichweitenmessung (Art. 6 Abs. 1 lit. f DSGVO).',
    beacon:
      'Klicks auf ausgewählte Links meldet ein kleines Skript ohne Cookies an unseren Server; übermittelt wird nur, welcher dieser Links angeklickt wurde.',
  },
  {
    language: 'English',
    text: 'To see how our website is used, our server counts page views itself, without cookies and without third-party services. Nothing is stored on or read from your device for this. From your IP address and the browser identifier (user agent) that your browser sends with every page request anyway, the server forms a shortened hash together with a random value created anew every day; the IP address itself is not stored. The random value is kept only in memory and is discarded at midnight, and that day’s hashes are deleted. What remains are summed-up numbers per day: pages viewed, the domain of the website you came from, campaign parameters (utm_*), the entry page, the device class (phone, tablet, desktop) and the language. Whether a form was sent is also recorded only as a number. We cannot link this data to you or recognise you on later days. The legal basis is our legitimate interest in privacy-friendly audience measurement (Art. 6(1)(f) GDPR).',
    beacon:
      'Clicks on selected links are reported to our server by a small script without cookies; it sends only which of these links was clicked.',
  },
];

const copy = (text: string) =>
  navigator.clipboard
    .writeText(text)
    .then(() => notify(t('common.copied')), failed);
</script>

<LoadState load={loading}>
{#if settings}
  <form novalidate onsubmit={save}>
    <section class="form-section">
      <header>
        <h2>{t('statsSettings.title')}</h2>
        <p>{t('statsSettings.intro')}</p>
      </header>
      <div class="fields">
        <label class="option">
          <input type="checkbox" bind:checked={settings.enabled} />
          <span><strong>{t('statsSettings.enabled')}</strong><small class="help">{t('statsSettings.enabledHint')}</small></span>
        </label>
        <div class="fields-2">
          <label>
            {t('statsSettings.timeZone')}
            <input class="code" list="stats-zones" bind:value={settings.timeZone} placeholder={Intl.DateTimeFormat().resolvedOptions().timeZone} spellcheck="false" autocomplete="off" />
            <datalist id="stats-zones">
              {#each _ZONES as zone (zone)}<option value={zone}></option>{/each}
            </datalist>
            <small>{t('statsSettings.timeZoneHint')}</small>
          </label>
          <label>
            {t('statsSettings.retention')}
            <select bind:value={settings.retentionDays}>
              {#each _RETENTION as days (days)}<option value={days}>{days === 0 ? t('statsSettings.retentionForever') : tn('statsSettings.retentionDays', days)}</option>{/each}
            </select>
            <small>{t('statsSettings.retentionHint')}</small>
          </label>
        </div>
      </div>
    </section>
    <section class="form-section">
      <header>
        <h2>{t('statsSettings.goalsTitle')}</h2>
        <p>{t('statsSettings.goalsIntro')}</p>
      </header>
      <div class="fields">
        <label class="option">
          <input type="checkbox" bind:checked={settings.beacon} />
          <span><strong>{t('statsSettings.beacon')}</strong><small class="help">{t('statsSettings.beaconHint')}</small></span>
        </label>
        <label>
          {t('statsSettings.links')}
          <textarea class="code" rows="4" bind:value={links} placeholder="https://app.example.com/signup" spellcheck="false"></textarea>
          <small>{t('statsSettings.linksHint')}</small>
        </label>
        <div class="row">
          <button class="button primary" aria-disabled={busy}>{t('statsSettings.save')}</button>
          <a class="button ghost" href={resolve('/(app)/stats')}>{@html icons.chart}{t('statsSettings.view')}</a>
        </div>
      </div>
    </section>
  </form>
  <section class="form-section">
    <header>
      <h2>{t('statsSettings.privacyTitle')}</h2>
      <p>{t('statsSettings.privacyIntro')}</p>
    </header>
    <div class="fields">
      {#each _PRIVACY as sample (sample.language)}
        <details class="sample">
          <summary>{sample.language}</summary>
          <p>{sample.text}</p>
          {#if settings.beacon}<p>{sample.beacon}</p>{/if}
          <button type="button" class="button ghost" onclick={() => copy(settings?.beacon ? `${sample.text} ${sample.beacon}` : sample.text)}>{@html icons.copy}{t('common.copy')}</button>
        </details>
      {/each}
    </div>
  </section>
{/if}
</LoadState>

<style>
  form {
    display: contents;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .sample {
    padding: 0.75rem 1rem;
    border: 0.0625rem solid var(--line);
    border-radius: var(--radius-l);
    background: var(--surface);
  }

  .sample summary {
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .sample p {
    margin: 0.75rem 0;
    font-size: 0.875rem;
    line-height: 1.55;
    text-wrap: pretty;
  }
</style>
