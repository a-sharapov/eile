// Заготовки новых элементов. Отдельный модуль: `</script>` внутри строки в .svelte оборвал бы блок.
export var STARTERS = {
  template:
    '<script>\n  let { page, site } = $props();\n</script>\n\n<svelte:head>\n  <title>{page.longTitle || page.title} — {site.name}</title>\n</svelte:head>\n\n<h1>{page.longTitle || page.title}</h1>\n{@html page.content}\n',
  component:
    '<!-- @component\nЧто делает компонент — одной фразой: её видно в каталоге блоков.\n-->\n<script lang="ts">\n// Подпись параметра в редакторе страницы — комментарий /** … */ над ним.\nlet {\n  /** Заголовок */\n  title = \'\',\n}: { title?: string } = $props();\n</script>\n\n<div>{title}</div>\n',
  plugin:
    "// Хуки необязательны: оставьте нужные.\nexport default {\n  render: (html: string, { path, status }: { path: string; status: number }) => html,\n  notFound: (path: string): string | null => null,\n  on: {\n    'content.page_published': (event: { pageId: number }) => {},\n  },\n};\n",
} as const;
