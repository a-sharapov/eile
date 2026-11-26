import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { PageLoad } from './$types';

// «Приём» переехал в «Качество» (ADR 0072, этап 4): закладки и ссылки этапов 1–3 на `?tab=intake` ведут туда.
export const load: PageLoad = ({ url }) =>
  void (
    url.searchParams.get('tab') === 'intake' &&
    redirect(307, `${resolve('/(app)/stats/quality')}?tab=intake`)
  );
