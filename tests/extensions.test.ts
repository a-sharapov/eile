import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import {
  attempt,
  type DomainError,
  isDomainError,
} from '../src/shared/kernel/errors.ts';
import { DEMO } from './fixtures/demo.ts';

let app: App;

beforeEach(() => {
  app = createApp({ scaffold: DEMO });
});

afterEach(() => app.close());

const get = (path: string) => app.fetch(new Request(`http://localhost${path}`));
const html = (path: string) => get(path).then((_) => _.text());

const errorCode = (action: () => void): string | undefined =>
  attempt(
    () => void action(),
    (error) => (isDomainError(error) ? error.code : String(error))
  );

describe('плагины', () => {
  it('render правит HTML, notFound даёт редирект', async () => {
    app.extensions.plugins.save(
      'Seo',
      `export default {
        render: (html: string, { status }: { status: number }) => html.replace('</head>', '<meta name="x-status" content="' + status + '">\\n</head>'),
        notFound: (path: string) => (path === '/old-contacts' ? '/kontakty' : null),
      };`
    );
    expect(await html('/kontakty')).toContain(
      '<meta name="x-status" content="200">'
    );
    const moved = await get('/old-contacts');
    expect(moved.status).toBe(301);
    expect(moved.headers.get('location')).toBe('/kontakty');
    expect((await get('/missing')).status).toBe(404);
  });

  it('получает доменные события и читает $core', async () => {
    const seen: string[] = [];
    (globalThis as Record<string, unknown>).__cmsSeen = seen;
    app.extensions.plugins.save(
      'Audit',
      `import { site } from '$core';
      export default {
        on: { 'content.page_published': () => void (globalThis as any).__cmsSeen.push(site().name) },
      };`
    );
    const id = app.content.pages.create({ title: 'Новости', template: 'Base' });
    app.content.pages.publish(id);
    await Bun.sleep(20);
    expect(seen).toEqual(['Eile']);
  });

  it('ошибка в плагине не роняет сайт; выключенный плагин молчит', async () => {
    app.extensions.plugins.save(
      'Broken',
      'export default { render: () => { throw new Error("boom"); } };'
    );
    expect((await get('/kontakty')).status).toBe(200);
    app.extensions.plugins.save(
      'Mark',
      "export default { render: (html: string) => html + '<!--mark-->' };"
    );
    expect(await html('/kontakty')).toContain('<!--mark-->');
    app.extensions.plugins.setEnabled('Mark', false);
    expect(await html('/kontakty')).not.toContain('<!--mark-->');
  });

  it('синтаксис и импорты проверяются при сохранении', () => {
    expect(
      errorCode(() => app.extensions.plugins.save('Bad', 'export default {'))
    ).toBe('extensions.compile_failed');
    expect(
      attempt<unknown>(
        () =>
          app.extensions.plugins.save(
            'Bad',
            'export default {\n  on: { x( => 1 }\n}'
          ),
        (error) => (error as DomainError).at
      )
    ).toEqual({ line: 2, column: 12 });
    expect(
      errorCode(() =>
        app.extensions.plugins.save(
          'Fs',
          "import fs from 'node:fs'; export default {};"
        )
      )
    ).toBe('extensions.forbidden_import');
  });
});

describe('компоненты в контенте', () => {
  it('тег [[Name prop]] в тексте страницы рендерит компонент', async () => {
    app.design.components.save(
      'Badge',
      '<script>let { text, size = 1 } = $props();</script><mark data-size={size}>{text}</mark>'
    );
    app.design.templates.save(
      'Base',
      "<script>import Content from '$core/Content'; let { page } = $props();</script><main><Content of={page} /></main>"
    );
    const about = app.content.published.byPath('/o-proekte')!.id;
    app.content.pages.edit(about, {
      content: '<p>Статус:</p>[[Badge text="бета" size=2]][[Missing]]',
    });
    expect(await html('/o-proekte')).toContain(
      '<main><p>Статус:</p><mark data-size="2">бета</mark></main>'
    );
  });
});
