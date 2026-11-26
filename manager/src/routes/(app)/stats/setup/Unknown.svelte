<script lang="ts">
import { untrack } from 'svelte';
import { isPartValue, LABEL_LIMITS } from '#lib/analytics.ts';
import { api } from '#lib/api.ts';
import { ago, moment } from '#lib/format.ts';
import { type MessageKey, number, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { defineLoad } from '#lib/loading.svelte.ts';
import type { SetupView, UnknownReport } from '#lib/types.ts';
import LoadState from '#lib/ui/LoadState.svelte';
import { generatorHref } from '../labels/links.ts';
import {
  dictionaryOf,
  partName,
  partOf,
  propertyOf,
  senderName,
} from '../names.ts';
import type { EditRequest } from './setup.ts';

let {
  setup,
  editable,
  onedit,
}: {
  setup: SetupView;
  editable: boolean;
  onedit: (request: EditRequest) => void;
} = $props();

// То, чего нет в справочниках, — со счётчиками; «Создать» открывает форму элемента с этим кодом. Новая ревизия
// настройки (создали элемент) — отчёт заново.
let report = $state<UnknownReport | null>(null);
const loading = defineLoad(() =>
  api.get<UnknownReport>('/analytics/unknown').then((_) => void (report = _))
);
$effect(
  () => void ((_: number) => untrack(() => loading.retry()))(setup.revision)
);

// Значение вне справочника можно завести, только если справочник есть и не в архиве.
const target = (dictionary: string | null) =>
  ((found) => (found && found.archivedAt === null ? found.code : null))(
    dictionaryOf(setup, dictionary)
  );

const values = $derived(
  report
    ? [
        ...report.values.map((_) => ({
          key: `event/${_.property}/${_.value}`,
          where: propertyOf(setup, 'event', _.property)?.name ?? _.property,
          code: _.property,
          value: _.value,
          count: _.count,
          dictionary: target(
            propertyOf(setup, 'event', _.property)?.dictionary ?? null
          ),
          trait: false,
        })),
        ...report.traits.map((_) => ({
          key: `person/${_.trait}/${_.value}`,
          where: propertyOf(setup, 'person', _.trait)?.name ?? _.trait,
          code: _.trait,
          value: _.value,
          count: _.count,
          dictionary: target(
            propertyOf(setup, 'person', _.trait)?.dictionary ?? null
          ),
          trait: true,
        })),
      ]
    : []
);

const total = $derived(
  report
    ? report.types.length +
        report.questions.length +
        report.answers.length +
        values.length +
        report.parts.length +
        report.labels.length
    : 0
);

const activeSender = (code: string) =>
  setup.senders.some((_) => _.code === code && _.archivedAt === null);

// Значение части заводится в справочник части, если она есть и не в архиве, а значение — строгого вида и не
// длиннее предела части; иначе — почему нельзя.
const partTarget = (
  part: string,
  value: string
): { dictionary: string } | { reason: MessageKey; n?: number } =>
  ((found) =>
    found === undefined
      ? { reason: 'unknown.partMissing' }
      : found.archivedAt !== null
        ? { reason: 'unknown.dictionaryArchived' }
        : !isPartValue(value, found.length ?? LABEL_LIMITS.part)
          ? { reason: 'unknown.partInvalid', n: found.length ?? 0 }
          : { dictionary: found.code })(partOf(setup, part));
</script>

<LoadState load={loading}>
  {#if report}
    <div class="list">
      <header class="intro">
        <p>{t('unknown.intro')}</p>
        <button type="button" class="ghost" onclick={() => loading.retry()}>{@html icons.refresh}{t('stats.refresh')}</button>
      </header>

      {#if total === 0}
        <div class="frame empty"><p>{t('unknown.empty')}</p></div>
      {/if}

      {#if report.types.length > 0}
        <section aria-labelledby="unknown-types">
          <h3 id="unknown-types">{t('unknown.types')}</h3>
          <p class="help">{t('unknown.typesHint')}</p>
          <div class="scroll frame">
            <table>
              <thead><tr><th scope="col">{t('people.sender')}</th><th scope="col">{t('setupForm.code')}</th><th scope="col" class="num">{t('unknown.events')}</th><th scope="col">{t('unknown.lastAt')}</th>{#if editable}<th scope="col"><span class="sr-only">{t('setupList.actions')}</span></th>{/if}</tr></thead>
              <tbody>
                {#each report.types as item (`${item.sender}/${item.type}`)}
                  <tr>
                    <td>{senderName(setup, item.sender)}</td>
                    <td><code>{item.type}</code></td>
                    <td class="num">{number(item.count)}</td>
                    <td><span title={moment(item.lastAt)}>{ago(item.lastAt)}</span></td>
                    {#if editable}
                      <td class="row-actions">
                        {#if activeSender(item.sender)}
                          <button type="button" onclick={() => onedit({ group: 'type', item: null, preset: { sender: item.sender, code: item.type, name: item.type } })}>{@html icons.plus}{t('unknown.createType')}<span class="sr-only">: {item.type}</span></button>
                        {:else}
                          <small class="muted">{t('unknown.senderArchived')}</small>
                        {/if}
                      </td>
                    {/if}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      {/if}

      {#if report.questions.length > 0}
        <section aria-labelledby="unknown-questions">
          <h3 id="unknown-questions">{t('unknown.questions')}</h3>
          <p class="help">{t('unknown.questionsHint')}</p>
          <div class="scroll frame">
            <table>
              <thead><tr><th scope="col">{t('unknown.question')}</th><th scope="col" class="num">{t('unknown.answersCount')}</th>{#if editable}<th scope="col"><span class="sr-only">{t('setupList.actions')}</span></th>{/if}</tr></thead>
              <tbody>
                {#each report.questions as item (item.question)}
                  <tr>
                    <td><code>{item.question}</code></td>
                    <td class="num">{number(item.count)}</td>
                    {#if editable}
                      <td class="row-actions"><button type="button" onclick={() => onedit({ group: 'dictionary', item: null, preset: { code: item.question, name: item.question, purpose: 'answers' } })}>{@html icons.plus}{t('unknown.createQuestion')}<span class="sr-only">: {item.question}</span></button></td>
                    {/if}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      {/if}

      {#if report.answers.length > 0}
        <section aria-labelledby="unknown-answers">
          <h3 id="unknown-answers">{t('unknown.answers')}</h3>
          <p class="help">{t('unknown.answersHint')}</p>
          <div class="scroll frame">
            <table>
              <thead><tr><th scope="col">{t('unknown.question')}</th><th scope="col">{t('unknown.answer')}</th><th scope="col" class="num">{t('unknown.events')}</th>{#if editable}<th scope="col"><span class="sr-only">{t('setupList.actions')}</span></th>{/if}</tr></thead>
              <tbody>
                {#each report.answers as item (`${item.question}/${item.answer}`)}
                  <tr>
                    <td>{dictionaryOf(setup, item.question)?.name ?? item.question}</td>
                    <td><code>{item.answer}</code></td>
                    <td class="num">{number(item.count)}</td>
                    {#if editable}
                      <td class="row-actions">
                        {#if target(item.question)}
                          <button type="button" onclick={() => onedit({ group: 'value', item: null, preset: { dictionary: item.question, code: item.answer, name: item.answer } })}>{@html icons.plus}{t('unknown.createValue')}<span class="sr-only">: {item.answer}</span></button>
                        {:else}
                          <small class="muted">{t('unknown.questionFirst')}</small>
                        {/if}
                      </td>
                    {/if}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      {/if}

      {#if values.length > 0}
        <section aria-labelledby="unknown-values">
          <h3 id="unknown-values">{t('unknown.values')}</h3>
          <p class="help">{t('unknown.valuesHint')}</p>
          <div class="scroll frame">
            <table>
              <thead><tr><th scope="col">{t('unknown.where')}</th><th scope="col">{t('unknown.value')}</th><th scope="col" class="num">{t('unknown.count')}</th>{#if editable}<th scope="col"><span class="sr-only">{t('setupList.actions')}</span></th>{/if}</tr></thead>
              <tbody>
                {#each values as item (item.key)}
                  <tr>
                    <td>{item.where} <small class="muted">{t(item.trait ? 'unknown.inTraits' : 'unknown.inEvents')}</small></td>
                    <td><code>{item.value}</code></td>
                    <td class="num">{number(item.count)} {#if item.trait}<small class="muted">{t('unknown.peopleShort')}</small>{/if}</td>
                    {#if editable}
                      <td class="row-actions">
                        {#if item.dictionary}
                          <button type="button" onclick={() => onedit({ group: 'value', item: null, preset: { dictionary: item.dictionary, code: item.value, name: item.value } })}>{@html icons.plus}{t('unknown.createValue')}<span class="sr-only">: {item.value}</span></button>
                        {:else}
                          <small class="muted">{t('unknown.dictionaryArchived')}</small>
                        {/if}
                      </td>
                    {/if}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      {/if}

      {#if report.parts.length > 0}
        <section aria-labelledby="unknown-parts">
          <h3 id="unknown-parts">{t('unknown.parts')}</h3>
          <p class="help">{t('unknown.partsHint')}</p>
          <div class="scroll frame">
            <table>
              <thead><tr><th scope="col">{t('unknown.part')}</th><th scope="col">{t('unknown.value')}</th><th scope="col">{t('people.sender')}</th><th scope="col" class="num">{t('unknown.touches')}</th>{#if editable}<th scope="col"><span class="sr-only">{t('setupList.actions')}</span></th>{/if}</tr></thead>
              <tbody>
                {#each report.parts as item (`${item.sender}/${item.part}/${item.value}`)}
                  {@const target = partTarget(item.part, item.value)}
                  <tr>
                    <td>{partName(setup, item.part)}</td>
                    <td><code>{item.value}</code></td>
                    <td>{senderName(setup, item.sender)}</td>
                    <td class="num">{number(item.count)}</td>
                    {#if editable}
                      <td class="row-actions">
                        {#if 'dictionary' in target}
                          <button type="button" onclick={() => onedit({ group: 'value', item: null, preset: { dictionary: target.dictionary, code: item.value, name: item.value } })}>{@html icons.plus}{t('unknown.createValue')}<span class="sr-only">: {item.value}</span></button>
                        {:else}
                          <small class="muted">{t(target.reason, { n: target.n ?? 0 })}</small>
                        {/if}
                      </td>
                    {/if}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      {/if}

      {#if report.labels.length > 0}
        <section aria-labelledby="unknown-labels">
          <h3 id="unknown-labels">{t('unknown.labels')}</h3>
          <p class="help">{t('unknown.labelsHint')}</p>
          <!-- «В генератор» открывает вкладку «Метки» с разобранной меткой: её можно выдать и сохранить в реестр. -->
          <div class="scroll frame">
            <table class="labels">
              <thead><tr><th scope="col">{t('unknown.label')}</th><th scope="col">{t('people.sender')}</th><th scope="col" class="num">{t('unknown.people')}</th>{#if editable}<th scope="col"><span class="sr-only">{t('setupList.actions')}</span></th>{/if}</tr></thead>
              <tbody>
                {#each report.labels as item (`${item.sender}/${item.label}`)}
                  <tr>
                    <td class="label"><code>{item.label}</code></td>
                    <td>{senderName(setup, item.sender)}</td>
                    <td class="num">{number(item.count)}</td>
                    {#if editable}
                      <td class="row-actions">
                        {#if setup.schemas.some((_) => _.sender === item.sender && _.archivedAt === null)}
                          <a class="button ghost" href={generatorHref(item.sender, item.label)}>{@html icons.tag}{t('labels.toGenerator')}<span class="sr-only">: {item.label}</span></a>
                        {:else}
                          <small class="muted">{t('labels.noSchemaFor')}</small>
                        {/if}
                      </td>
                    {/if}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      {/if}
    </div>
  {/if}
</LoadState>

<style>
  .list {
    display: grid;
    gap: 1.5rem;
    min-width: 0;
  }

  .intro {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
    align-items: start;
    justify-content: space-between;
  }

  .intro p {
    flex: 1 1 24rem;
    max-width: 46rem;
    margin: 0;
    color: var(--muted);
    font-size: 0.875rem;
    text-wrap: pretty;
  }

  section {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }

  h3 {
    font-size: 1rem;
  }

  .help {
    margin: 0;
  }

  .scroll {
    overflow-x: auto;
    /* Свой блок отсчёта: подписи только для читалки (.sr-only) в шапке таблицы прокручиваются вместе с ней, а не
       расширяют страницу на узком экране. */
    position: relative;
  }

  table {
    min-width: 40rem;
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

  /* Метка — одно слово из частей: переносится по знакам, столбец не уже 16rem. */
  .labels .label {
    min-width: 16rem;
  }

  .labels .label code {
    overflow-wrap: anywhere;
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .row-actions {
    width: 1%;
    white-space: nowrap;
    text-align: right;
  }

  .row-actions button,
  .row-actions .button {
    min-height: 2rem;
    padding: 0 0.65rem;
    font-size: 0.8125rem;
  }

  .row-actions :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .empty {
    padding: 1.25rem;
  }

  .empty p {
    margin: 0;
    color: var(--muted);
  }
</style>
