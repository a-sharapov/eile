import type { ClientInit } from '@sveltejs/kit/hooks';
import { startLanguage } from '#lib/appearance.svelte.ts';

// Словарь — до первой отрисовки: менеджер сразу на своём языке, без мелькания ключей.
export const init: ClientInit = startLanguage;
