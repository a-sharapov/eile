import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { brotliDecompressSync } from 'node:zlib';
import { type App, createApp } from '../src/app.ts';
import { defineManagerAssets } from '../src/contexts/manager/infrastructure/assets.ts';
import { DEMO } from './fixtures/demo.ts';

let app: App;
let admin: string;

const _PASSWORD = 'correct horse battery';

const call = (
  method: string,
  path: string,
  body?: unknown,
  cookie = admin,
  headers: Record<string, string> = {}
) =>
  app.fetch(
    new Request(`http://localhost/manager/api${path}`, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

const json = (response: Response) => response.json() as Promise<any>;

const cookieOf = (response: Response): string =>
  (response.headers.get('set-cookie') ?? '').split(';')[0]!;

const signIn = (email: string, password = _PASSWORD) =>
  call('POST', '/session', { email, password }, '').then(cookieOf);

beforeEach(async () => {
  app = createApp({ scaffold: DEMO });
  const setup = await call(
    'POST',
    '/setup',
    {
      token: app.identity.setup.token(),
      email: 'Admin@Example.com',
      password: _PASSWORD,
    },
    ''
  );
  admin = cookieOf(setup);
});

afterEach(() => app.close());

describe('вход', () => {
  it('настройка создаёт администратора и закрывается', async () => {
    const session = await json(await call('GET', '/session'));
    expect(session).toMatchObject({
      user: { id: 1, email: 'admin@example.com', name: 'admin', role: 'admin' },
      setup: false,
    });
    const again = await call(
      'POST',
      '/setup',
      { token: 'x', email: 'b@example.com', password: _PASSWORD },
      ''
    );
    expect(again.status).toBe(403);
  });

  it('оформление у каждого пользователя своё и приходит с сессией', async () => {
    expect((await json(await call('GET', '/session'))).appearance).toEqual({
      accent: '#2f5c96',
      scheme: 'system',
      language: null,
    });
    const saved = await call('PUT', '/appearance', {
      accent: '#C0392B',
      scheme: 'dark',
    });
    expect(await json(saved)).toEqual({
      accent: '#c0392b',
      scheme: 'dark',
      language: null,
    });
    // Язык меняется отдельно и цвета не трогает.
    expect(
      await json(await call('PUT', '/appearance', { language: 'de' }))
    ).toEqual({
      accent: '#c0392b',
      scheme: 'dark',
      language: 'de',
    });
    expect((await json(await call('GET', '/session'))).appearance.scheme).toBe(
      'dark'
    );
    expect(
      (await call('PUT', '/appearance', { accent: 'red', scheme: 'dark' }))
        .status
    ).toBe(422);
    expect((await call('PUT', '/appearance', { language: 'fr' })).status).toBe(
      422
    );
  });

  it('cookie сессии — HttpOnly и SameSite', async () => {
    const response = await call(
      'POST',
      '/session',
      { email: 'admin@example.com', password: _PASSWORD },
      ''
    );
    expect(response.headers.get('set-cookie')).toMatch(
      /^cms_session=[\w-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/
    );
  });

  it('неверный пароль — 401, после пяти неудач — 429', async () => {
    const wrong = () =>
      call(
        'POST',
        '/session',
        { email: 'admin@example.com', password: 'wrong password' },
        ''
      ).then((_) => _.status);
    expect(await wrong()).toBe(401);
    await Promise.all([wrong(), wrong(), wrong(), wrong()]);
    expect(await wrong()).toBe(429);
  });

  it('выход закрывает сессию', async () => {
    await call('DELETE', '/session');
    expect((await call('GET', '/pages')).status).toBe(401);
  });
});

describe('права', () => {
  it('редактор правит страницы, но не элементы и не пользователей', async () => {
    await call('POST', '/users', {
      email: 'editor@example.com',
      password: _PASSWORD,
      role: 'editor',
    });
    const editor = await signIn('editor@example.com');
    expect((await call('GET', '/pages', undefined, editor)).status).toBe(200);
    expect((await call('GET', '/elements', undefined, editor)).status).toBe(
      403
    );
    expect((await call('GET', '/users', undefined, editor)).status).toBe(403);
  });

  it('последнего администратора нельзя удалить или понизить', async () => {
    expect((await call('DELETE', '/users/1')).status).toBe(422);
    expect((await call('PATCH', '/users/1', { role: 'editor' })).status).toBe(
      422
    );
  });

  it('новый пароль от администратора закрывает сессии пользователя', async () => {
    const { id } = await json(
      await call('POST', '/users', {
        email: 'writer@example.com',
        name: 'Автор',
        role: 'editor',
        password: _PASSWORD,
      })
    );
    const writer = await signIn('writer@example.com');
    expect((await call('GET', '/pages', undefined, writer)).status).toBe(200);
    await call('PATCH', `/users/${id}`, { password: 'another long password' });
    expect((await call('GET', '/pages', undefined, writer)).status).toBe(401);
  });

  it('запрос с чужого Origin отклоняется', async () => {
    const response = await call('POST', '/pages', { title: 'x' }, admin, {
      origin: 'https://evil.example',
    });
    expect(response.status).toBe(403);
  });
});

describe('страницы', () => {
  it('дерево, создание, правка, публикация, предпросмотр', async () => {
    const tree = await json(await call('GET', '/pages'));
    expect(tree.map((_: any) => _.title)).toContain('Контакты');
    const { id } = await json(
      await call('POST', '/pages', { title: 'Новости', template: 'Base' })
    );
    const edited = await json(
      await call('PATCH', `/pages/${id}`, { content: '<p>Свежее</p>' })
    );
    expect(edited.page).toMatchObject({ title: 'Новости', published: false });
    const preview = await call('GET', `/pages/${id}/preview`);
    expect(await preview.text()).toContain('<p>Свежее</p>');
    expect(
      (await app.fetch(new Request('http://localhost/novosti'))).status
    ).toBe(404);
    await call('POST', `/pages/${id}/publish`);
    expect(
      (await app.fetch(new Request('http://localhost/novosti'))).status
    ).toBe(200);
  });

  it('копия и место в дереве', async () => {
    const contacts = app.content.published.byPath('/kontakty')!.id;
    const copy = await call('POST', `/pages/${contacts}/duplicate`, {
      title: 'Контакты (копия)',
    });
    expect(copy.status).toBe(201);
    const { id } = await json(copy);
    const placed = await json(
      await call('POST', `/pages/${id}/place`, { parentId: null, index: 0 })
    );
    expect(placed.page).toMatchObject({ id, menuIndex: 0, published: false });
    expect((await json(await call('GET', '/pages')))[0].title).toBe(
      'Контакты (копия)'
    );
  });

  it('ошибка домена — 422 с кодом', async () => {
    const response = await call('POST', '/pages', {
      title: 'Контакты',
      template: 'Base',
    });
    expect(response.status).toBe(422);
    expect((await json(response)).error.code).toBe('content.alias_taken');
    expect((await call('GET', '/pages/999')).status).toBe(404);
  });

  it('корзина и очистка', async () => {
    const contacts = app.content.published.byPath('/kontakty')!.id;
    await call('POST', `/pages/${contacts}/trash`);
    expect((await json(await call('DELETE', '/trash'))).removed).toBe(1);
  });
});

describe('журнал правок', () => {
  it('правки страниц попадают в журнал: кто, что и когда; повтор склеивается', async () => {
    const contacts = app.content.published.byPath('/kontakty')!.id;
    await call('PATCH', `/pages/${contacts}`, { title: 'Контакты!' });
    await call('PATCH', `/pages/${contacts}`, { title: 'Контакты' });
    await call('POST', `/pages/${contacts}/unpublish`);
    const created = await json(
      await call('POST', '/pages', { title: 'Новости', parentId: null })
    );
    const log = await json(await call('GET', '/activity?limit=10'));
    expect(log.map((_: any) => [_.pageId, _.action, _.userName])).toEqual([
      [created.id, 'created', 'admin'],
      [contacts, 'unpublished', 'admin'],
      [contacts, 'edited', 'admin'],
    ]);
  });

  it('неудачная правка в журнал не попадает', async () => {
    await call('PATCH', '/pages/999', { title: 'Нет такой' });
    expect(await json(await call('GET', '/activity'))).toEqual([]);
  });
});

describe('элементы и настройки', () => {
  it('ошибка компиляции видна редактору элемента — с местом в исходнике', async () => {
    const response = await call('PUT', '/elements/component/Header', {
      source: '<header>\n  <p>{</p>\n</header>',
    });
    expect(response.status).toBe(422);
    const { error } = await json(response);
    expect(error.code).toBe('design.compile_failed');
    expect(error.at.line).toBe(2);
    const saved = await json(
      await call('PUT', '/elements/component/Header', { source: '<header />' })
    );
    expect(saved).toMatchObject({
      kind: 'component',
      name: 'Header',
      revision: 2,
    });
  });

  it('большой JSON сжимается, если клиент принимает сжатие', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        call('POST', '/pages', { title: `Страница ${i}`, template: 'Base' })
      )
    );
    const plain = await call('GET', '/pages');
    expect(plain.headers.get('content-encoding')).toBeNull();
    const packed = await call('GET', '/pages', undefined, admin, {
      'accept-encoding': 'gzip',
    });
    expect(packed.headers.get('content-encoding')).toBe('gzip');
    expect(packed.headers.get('vary')).toContain('accept-encoding');
    const unpacked = Bun.gunzipSync(new Uint8Array(await packed.arrayBuffer()));
    expect(JSON.parse(new TextDecoder().decode(unpacked))).toEqual(
      await json(plain)
    );
  });

  it('каталог компонентов и поля шаблона доступны редактору', async () => {
    await call('POST', '/users', {
      email: 'editor@example.com',
      password: _PASSWORD,
      role: 'editor',
    });
    const editor = await signIn('editor@example.com');
    await call('PUT', '/fields/price', {
      type: 'number',
      templates: ['Base'],
    });
    const catalog = await json(
      await call('GET', '/components', undefined, editor)
    );
    expect(catalog.find((_: any) => _.name === 'Callout')).toMatchObject({
      description: 'Врезка: выделенный абзац с заголовком.',
      props: [
        { name: 'title', type: 'string', label: 'Заголовок', required: false },
        { name: 'text', type: 'string', label: 'Текст', required: true },
        {
          name: 'tone',
          label: 'Оттенок',
          options: [
            { value: 'note', label: 'Заметка' },
            { value: 'success', label: 'Успех' },
            { value: 'warning', label: 'Внимание' },
          ],
        },
      ],
    });
    const fields = await json(
      await call('GET', '/templates/Base/fields', undefined, editor)
    );
    expect(fields.map((_: any) => _.name)).toEqual(['price']);
  });

  it('переводы и свои настройки: читает редактор, правит администратор', async () => {
    await call('POST', '/users', {
      email: 'editor@example.com',
      password: _PASSWORD,
      role: 'editor',
    });
    const editor = await signIn('editor@example.com');
    const saved = await json(
      await call('PUT', '/translations/greeting', {
        values: { ru: 'Привет', en: '' },
      })
    );
    expect(saved).toEqual([{ key: 'greeting', values: { ru: 'Привет' } }]);
    expect((await call('GET', '/translations', undefined, editor)).status).toBe(
      200
    );
    expect(
      (await call('PUT', '/translations/x', { values: { ru: 'y' } }, editor))
        .status
    ).toBe(403);
    // Пояснение задаётся при добавлении; правка значения без пояснения его не стирает.
    await call('PUT', '/custom-settings/phone', {
      value: '+7',
      note: 'Телефон  в шапке\n и подвале',
    });
    expect(
      await json(await call('PUT', '/custom-settings/phone', { value: '+49' }))
    ).toEqual([
      { key: 'phone', value: '+49', note: 'Телефон в шапке и подвале' },
    ]);
    expect(
      (
        await call('PUT', '/custom-settings/phone', {
          value: '+49',
          note: 'x'.repeat(501),
        })
      ).status
    ).toBe(422);
    expect(await json(await call('DELETE', '/custom-settings/phone'))).toEqual(
      []
    );
  });

  it('настройки сайта', async () => {
    const settings = await json(
      await call('PATCH', '/settings', { name: 'Мой сайт' })
    );
    expect(settings.name).toBe('Мой сайт');
  });
});

describe('наследуемые поля', () => {
  it('редактор видит, что возьмёт пустое поле и у какой страницы', async () => {
    await call('PUT', '/fields/banner', {
      type: 'text',
      inherit: true,
      templates: ['Base'],
    });
    const section = await json(
      await call('POST', '/pages', { title: 'Раздел', template: 'Base' })
    );
    await call('PUT', `/pages/${section.id}/fields`, { banner: 'Скидки' });
    const child = await json(
      await call('POST', '/pages', {
        title: 'Вложенная',
        template: 'Base',
        parentId: section.id,
      })
    );
    const details = await json(await call('GET', `/pages/${child.id}`));
    expect(details.inherited).toEqual({
      banner: { value: 'Скидки', from: { id: section.id, title: 'Раздел' } },
    });
  });
});

describe('свой пароль', () => {
  it('меняется по текущему паролю, прежние сеансы закрываются', async () => {
    const other = await signIn('admin@example.com');
    const wrong = await call('PUT', '/session/password', {
      current: 'not my password',
      password: 'another horse battery',
    });
    expect(wrong.status).toBe(401);
    const changed = await call('PUT', '/session/password', {
      current: _PASSWORD,
      password: 'another horse battery',
    });
    expect(changed.status).toBe(200);
    const fresh = cookieOf(changed);
    expect((await call('GET', '/pages', undefined, fresh)).status).toBe(200);
    expect((await call('GET', '/pages', undefined, other)).status).toBe(401);
    expect(
      (
        await call(
          'POST',
          '/session',
          {
            email: 'admin@example.com',
            password: 'another horse battery',
          },
          ''
        )
      ).status
    ).toBe(200);
  });
});

describe('удаление и создание без перезаписи', () => {
  const _CREATE_ONLY = { 'if-none-match': '*' };

  it('новый элемент с занятым именем не затирает существующий', async () => {
    const before = await json(await call('GET', '/elements/component/Header'));
    const response = await call(
      'PUT',
      '/elements/component/Header',
      { source: '<div></div>' },
      admin,
      _CREATE_ONLY
    );
    expect(response.status).toBe(409);
    expect((await json(response)).error.code).toBe('design.element_exists');
    expect(await json(await call('GET', '/elements/component/Header'))).toEqual(
      before
    );
  });

  it('используемый элемент не удаляется, неиспользуемый — удаляется', async () => {
    expect(
      await json(await call('GET', '/elements/component/Header/usage'))
    ).toEqual({ pages: [], elements: ['Base'] });
    expect((await call('DELETE', '/elements/component/Header')).status).toBe(
      409
    );
    const template = await call('DELETE', '/elements/template/Base');
    expect(template.status).toBe(409);
    expect((await json(template)).error.code).toBe('design.element_in_use');
    const callout = await json(
      await call('GET', '/elements/component/Callout/usage')
    );
    expect(callout.pages.length).toBeGreaterThan(0);
    expect((await call('DELETE', '/elements/component/Callout')).status).toBe(
      409
    );

    await call('PUT', '/elements/component/Unused', { source: '<p>x</p>' });
    expect((await call('DELETE', '/elements/component/Unused')).status).toBe(
      200
    );
    expect((await call('GET', '/elements/component/Unused')).status).toBe(404);
  });

  it('тег в тексте отличает компонент от похожего имени', async () => {
    await call('PUT', '/elements/component/Note', { source: '<p>n</p>' });
    await call('POST', '/pages', {
      title: 'С заметкой',
      template: 'Base',
      content: '[[NoteBig]]',
    });
    expect(
      (await json(await call('GET', '/elements/component/Note/usage'))).pages
    ).toEqual([]);
  });

  it('поле удаляется вместе со значениями на страницах', async () => {
    await call('PUT', '/fields/price', { type: 'number', templates: ['Base'] });
    const repeat = await call(
      'PUT',
      '/fields/price',
      { type: 'string', templates: [] },
      admin,
      _CREATE_ONLY
    );
    expect(repeat.status).toBe(409);
    const { id } = await json(
      await call('POST', '/pages', { title: 'Товар', template: 'Base' })
    );
    await call('PUT', `/pages/${id}/fields`, { price: 10 });
    expect(await json(await call('GET', '/fields/price/usage'))).toEqual({
      pages: 1,
    });
    expect((await call('DELETE', '/fields/price')).status).toBe(200);
    expect(await json(await call('GET', '/fields'))).toEqual([]);
    expect((await json(await call('GET', `/pages/${id}`))).page.fields).toEqual(
      {}
    );
  });

  it('страница в корзине тоже держит компонент', async () => {
    await call('PUT', '/elements/component/Note', { source: '<p>n</p>' });
    const { id } = await json(
      await call('POST', '/pages', {
        title: 'Со вставкой',
        template: 'Base',
        content: '[[Note]]',
      })
    );
    await call('POST', `/pages/${id}/trash`);
    expect(
      (await json(await call('GET', '/elements/component/Note/usage'))).pages
    ).toEqual([{ id, title: 'Со вставкой', trashed: true }]);
  });

  it('видно, где используется файл медиатеки', async () => {
    const { id } = await json(
      await call('POST', '/pages', {
        title: 'С картинкой',
        template: 'Base',
        content: '<p><img src="/media/images/a.png" alt=""></p>',
      })
    );
    expect(await json(await call('GET', '/media-usage/images/a.png'))).toEqual({
      pages: [{ id, title: 'С картинкой', trashed: false }],
      site: false,
    });
    expect(
      (await json(await call('GET', '/media-usage/images/b.png'))).pages
    ).toEqual([]);
  });

  it('плагин удаляется', async () => {
    await call('PUT', '/plugins/Probe', {
      source: 'export default { render: (html) => html };',
    });
    expect((await call('DELETE', '/plugins/Probe')).status).toBe(200);
    expect((await call('GET', '/plugins/Probe')).status).toBe(404);
  });
});

describe('SPA менеджера', () => {
  const assets = defineManagerAssets({
    '/index.html': import.meta.path,
    '/_app/immutable/app.abc.js': import.meta.path,
  });

  it('неизвестный путь отдаёт index.html, файлы с хэшем кэшируются навсегда', async () => {
    expect((await assets.serve('/pages/5')).headers.get('cache-control')).toBe(
      'no-cache'
    );
    expect(
      (await assets.serve('/_app/immutable/app.abc.js')).headers.get(
        'cache-control'
      )
    ).toContain('immutable');
    expect((await defineManagerAssets({}).serve('/')).status).toBe(503);
  });

  it('текст сжимается один раз и отдаётся с тем же типом', async () => {
    const first = await assets.serve('/_app/immutable/app.abc.js', 'gzip, br');
    const again = await assets.serve('/_app/immutable/app.abc.js', 'gzip, br');
    expect(first.headers.get('content-encoding')).toBe('br');
    expect(first.headers.get('content-type')).toContain('javascript');
    expect(
      brotliDecompressSync(new Uint8Array(await first.arrayBuffer())).toString()
    ).toBe(await Bun.file(import.meta.path).text());
    expect((await again.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });
});
