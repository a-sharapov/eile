import { t } from './i18n.ts';

// Заготовки новых элементов. Отдельный модуль: `</script>` внутри строки в .svelte оборвал бы блок.
// Пояснения в них — на языке менеджера: их читает тот, кто создал элемент.
export var starters = () => ({
  template:
    '<script>\n  let { page, site } = $props();\n</script>\n\n<svelte:head>\n  <title>{page.longTitle || page.title} — {site.name}</title>\n</svelte:head>\n\n<h1>{page.longTitle || page.title}</h1>\n{@html page.content}\n',
  component: `<!-- @component\n${t('starter.componentAbout')}\n-->\n<script lang="ts">\n// ${t('starter.componentProps')}\nlet {\n  /** ${t('starter.componentTitle')} */\n  title = '',\n}: { title?: string } = $props();\n</script>\n\n<div>{title}</div>\n`,
  script: `// ${t('starter.scriptAbout')}\nconst stage = document.querySelector('[data-stage]');\n\nstage?.setAttribute('data-ready', '');\n`,
  plugin: `// ${t('starter.pluginHooks')}\nexport default {\n  render: (html: string, { path, status }: { path: string; status: number }) => html,\n  notFound: (path: string): string | null => null,\n  handle: (request: Request): Response | null => null,\n  on: {\n    'content.page_published': (event: { pageId: number }) => {},\n  },\n};\n`,
});
