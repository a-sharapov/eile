<script lang="ts">
import { moment } from '#lib/format.ts';
import { type MessageKey, quoted, t } from '#lib/i18n.ts';
import type { LabelCheck, SetupView } from '#lib/types.ts';
import Mark from '../Mark.svelte';
import { linkName, partName, partValueName, senderName } from '../names.ts';

// Разбор метки словами: откуда она взята, части по порядку схемы с состоянием значения, замечания разбора и
// запись реестра. Состояние — словом, цвет только помогает. `compact` — только замечания (под генератором).
let {
  setup,
  result,
  compact = false,
}: { setup: SetupView; result: LabelCheck; compact?: boolean } = $props();

const _FROM: Readonly<Record<LabelCheck['from'], MessageKey>> = {
  label: 'labels.fromLabel',
  utm: 'labels.fromUtm',
  go: 'labels.fromGo',
  link: 'labels.fromLink',
};

const _STATES: Readonly<
  Record<
    LabelCheck['parts'][number]['state'],
    { key: MessageKey; tone: 'ok' | 'warn' | 'plain' | 'danger' }
  >
> = {
  known: { key: 'labels.stateKnown', tone: 'ok' },
  archived: { key: 'labels.stateArchived', tone: 'warn' },
  unknown: { key: 'labels.stateUnknown', tone: 'danger' },
  empty: { key: 'labels.stateEmpty', tone: 'plain' },
};

const _NOTES: Readonly<Record<LabelCheck['notes'][number], MessageKey>> = {
  invalid: 'labels.noteInvalid',
  extra: 'labels.noteExtra',
  length: 'labels.noteLength',
  schema: 'labels.noteSchema',
};
</script>

{#if compact}
  <ul class="notes">
    {#each result.notes as note (note)}<li>{t(_NOTES[note])}</li>{/each}
  </ul>
{:else}
  <div class="result">
    <dl class="facts">
      <div><dt>{t('labels.readAs')}</dt><dd>{t(_FROM[result.from], { link: quoted(result.link ? linkName(setup, result.link) : '') })}</dd></div>
      <div><dt>{t('people.sender')}</dt><dd>{result.sender === null ? t('labels.noSender') : senderName(setup, result.sender)}</dd></div>
      <div><dt>{t('labels.label')}</dt><dd>{#if result.label === ''}<span class="muted">{t('labels.labelEmpty')}</span>{:else}<code class="label">{result.label}</code>{/if}</dd></div>
      <div>
        <dt>{t('labels.registry')}</dt>
        <dd>{result.registered ? t('labels.registeredAs', { name: quoted(result.registered.name), when: moment(result.registered.createdAt) }) : t('labels.notRegistered')}</dd>
      </div>
    </dl>

    {#if result.parts.length > 0}
      <div class="scroll frame">
        <table>
          <thead><tr><th scope="col">{t('labels.part')}</th><th scope="col">{t('labels.value')}</th><th scope="col">{t('labels.state')}</th></tr></thead>
          <tbody>
            {#each result.parts as part (part.part)}
              <tr>
                <td>{partName(setup, part.part)}</td>
                <td>
                  {#if part.value === null}<span class="muted">—</span>{:else}
                    {#if part.state === 'known' || part.state === 'archived'}<span>{partValueName(setup, part.part, part.value)}</span>{' '}{/if}<code class="muted">{part.value}</code>
                  {/if}
                </td>
                <td><Mark tone={_STATES[part.state].tone}>{t(_STATES[part.state].key)}</Mark></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    {#if result.notes.length > 0}
      <section aria-label={t('labels.notes')}>
        <h4>{t('labels.notes')}</h4>
        <ul class="notes">
          {#each result.notes as note (note)}<li>{t(_NOTES[note])}</li>{/each}
        </ul>
      </section>
    {:else}
      <p class="help">{t('labels.noNotes')}</p>
    {/if}
  </div>
{/if}

<style>
  .result {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .facts {
    display: grid;
    gap: 0.45rem;
    margin: 0;
  }

  .facts div {
    display: grid;
    grid-template-columns: minmax(8rem, 12rem) minmax(0, 1fr);
    gap: 0.75rem;
    font-size: 0.875rem;
  }

  dt {
    color: var(--muted);
  }

  dd {
    min-width: 0;
    margin: 0;
  }

  .label {
    overflow-wrap: anywhere;
  }

  .scroll {
    position: relative;
    overflow-x: auto;
  }

  table {
    min-width: 28rem;
  }

  th,
  td {
    padding: 0.5rem 0.8rem;
    font-size: 0.875rem;
    vertical-align: middle;
  }

  td code {
    overflow-wrap: break-word;
  }

  h4 {
    margin: 0 0 0.3rem;
    font-size: 0.875rem;
  }

  .notes {
    display: grid;
    gap: 0.25rem;
    margin: 0;
    padding-left: 1.1rem;
    font-size: 0.875rem;
  }

  .help {
    margin: 0;
  }

  @media (max-width: 34rem) {
    .facts div {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.1rem;
    }
  }
</style>
