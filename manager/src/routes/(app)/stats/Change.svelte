<script lang="ts">
import type { Change } from '#lib/analytics-reports.ts';
import { currentLanguage, t } from '#lib/i18n.ts';

// Изменение к прошлому периоду: знак, число и стрелка — значение читается и без цвета. Цвет — лучше или хуже:
// у CAC и цены человека меньше — лучше; у расхода — без оценки.
let {
  change,
  lowerBetter = false,
  neutral = false,
  title,
  inline = false,
}: {
  change: Change;
  lowerBetter?: boolean;
  neutral?: boolean;
  /** С чем сравнили: «к 31 авг. — 30 сент.». */
  title?: string;
  /** В строке текста, а не под числом. */
  inline?: boolean;
} = $props();

const _signed = (value: number, text: string): string =>
  value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;

const _number = (value: number, digits: number): string =>
  new Intl.NumberFormat(currentLanguage(), {
    maximumFractionDigits: digits,
  }).format(Math.abs(value));

const text = $derived(
  change.kind === 'new'
    ? t('report.changeNew')
    : change.kind === 'percent'
      ? _signed(
          change.value,
          new Intl.NumberFormat(currentLanguage(), {
            style: 'percent',
            maximumFractionDigits: Math.abs(change.value) < 0.1 ? 1 : 0,
          }).format(Math.abs(change.value))
        )
      : change.kind === 'points'
        ? t('report.changePoints', {
            value: _signed(change.value, _number(change.value, 1)),
          })
        : t('report.changeMonths', {
            value: _signed(change.value, _number(change.value, 0)),
          })
);

const direction = $derived(
  change.kind === 'new' ? 1 : Math.sign(Math.round(change.value * 1000))
);
const tone = $derived(
  neutral || direction === 0
    ? 'plain'
    : direction > 0 !== lowerBetter
      ? 'good'
      : 'bad'
);
</script>

<small class="change {tone}" class:inline title={title}><span aria-hidden="true">{direction > 0 ? '▲' : direction < 0 ? '▼' : '='}</span> {text}</small>

<style>
  .change {
    display: block;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .change.inline {
    display: inline;
  }

  .change span {
    font-size: 0.625rem;
  }

  /* Цвет тона притемнён к тексту: контраст не ниже 4.5:1 и в тёмной теме. */
  .good {
    color: color-mix(in oklch, var(--ok) 70%, var(--text));
  }

  .bad {
    color: color-mix(in oklch, var(--danger) 70%, var(--text));
  }
</style>
