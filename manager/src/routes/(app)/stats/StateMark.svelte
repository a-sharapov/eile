<script lang="ts">
import { STATE_LABELS } from '#lib/analytics.ts';
import { t } from '#lib/i18n.ts';
import type { PersonState } from '#lib/types.ts';
import Mark from './Mark.svelte';

// Состояние человека отметкой: слово и тон — тон только помогает глазу, смысл несёт слово.
let { state }: { state: PersonState } = $props();

const _TONES: Readonly<
  Record<PersonState, 'plain' | 'ok' | 'warn' | 'accent'>
> = {
  new: 'plain',
  trial: 'accent',
  customer: 'ok',
  returned: 'ok',
  lapsed: 'warn',
};
</script>

<Mark tone={_TONES[state]}>{t(STATE_LABELS[state])}</Mark>
