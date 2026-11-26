<script lang="ts">
import { type CsvRow, csvText } from '#lib/csv.ts';
import { saveCsv } from '#lib/download.ts';
import { currentLanguage, t } from '#lib/i18n.ts';
import { icons } from '#lib/icons.ts';
import { failed } from '#lib/notices.svelte.ts';

// Кнопка «CSV» у таблицы: файл собирается из того же ответа, что на экране, — нового запроса нет.
let {
  name,
  rows,
  label,
}: {
  /** Имя файла: `eile-<таблица>-<с>-<по>.csv`. */
  name: string;
  rows: () => readonly CsvRow[];
  /** Что выгружается — для читалки: «CSV: Кто привёл». */
  label: string;
} = $props();

const run = () =>
  Promise.resolve()
    .then(() => saveCsv(name, csvText(rows(), currentLanguage())))
    .then(undefined, failed);
</script>

<button type="button" class="ghost csv" aria-label={t('csv.buttonFor', { name: label })} title={t('csv.buttonFor', { name: label })} onclick={run}>{@html icons.download}CSV</button>

<style>
  .csv {
    flex: none;
    min-height: 2rem;
    padding: 0 0.6rem;
    font-size: 0.8125rem;
  }

  .csv :global(svg) {
    width: 0.9rem;
    height: 0.9rem;
  }
</style>
