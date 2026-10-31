<script lang="ts">
import '@fontsource-variable/onest';
import '#lib/theme.css';
import { restoreAppearance, shown } from '#lib/appearance.svelte.ts';
import { describeHints } from '#lib/hints.ts';
import Dialog from '#lib/ui/Dialog.svelte';
import MediaPicker from '#lib/ui/MediaPicker.svelte';
import Notices from '#lib/ui/Notices.svelte';

let { children } = $props();

// Цвета пользователя — до первой отрисовки: вход и загрузка не мигают синим по умолчанию.
restoreAppearance();

// Подсказки под полями — описания полей для читалки во всём менеджере, включая диалоги.
$effect(() => describeHints(document.body));
</script>

<!-- Смена языка перерисовывает менеджер целиком: строки берутся при отрисовке, а не хранятся. -->
{#key shown.language}
  {@render children()}
  <Notices />
  <MediaPicker />
  <Dialog />
{/key}
