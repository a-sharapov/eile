import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { attempt, isDomainError } from '../src/shared/kernel/errors.ts';
import { DEMO } from './fixtures/demo.ts';

// Набор переводов: исходная страница и её переводы на других языках — hreflang, sitemap и $core.

let app: App;
let ru = 0;
let en = 0;
let about = 0;

const get = (path: string) => app.fetch(new Request(`http://localhost${path}`));
const html = (path: string) => get(path).then((_) => _.text());

const hreflang = (page: string): string[] =>
  [
    ...page.matchAll(
      /<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g
    ),
  ].map((_) => `${_[1]} ${_[2]}`);

const codeOf = (action: () => unknown): string | null =>
  attempt(
    () => (action(), null),
    (error) => (isDomainError(error) ? error.code : 'other')
  );

beforeEach(() => {
  app = createApp({ scaffold: DEMO });
  app.site.settings.update({ language: 'ru', languages: ['en', 'de'] });
  ru = app.content.published.byPath('/kontakty')!.id;
  en = app.content.pages.create({
    title: 'English',
    alias: 'en',
    template: 'Base',
    language: 'en',
    publish: true,
  });
  about = app.content.pages.create({
    parentId: en,
    title: 'Contacts',
    alias: 'contacts',
    template: 'Base',
    publish: true,
    translationOf: ru,
  });
});

afterEach(() => app.close());

describe('переводы страниц', () => {
  it('у обеих страниц — hreflang на все языки и x-default на исходную', async () => {
    const expected = [
      'ru http://localhost/kontakty',
      'en http://localhost/en/contacts',
      'x-default http://localhost/kontakty',
    ];
    expect(hreflang(await html('/kontakty'))).toEqual(expected);
    expect(hreflang(await html('/en/contacts'))).toEqual(expected);
    // Без переводов — без hreflang.
    expect(hreflang(await html('/en'))).toEqual([]);
  });

  it('перевод перевода встаёт в тот же набор; кэш исходной узнаёт о новом переводе', async () => {
    expect(hreflang(await html('/kontakty'))).toHaveLength(3);
    const de = app.content.pages.create({
      title: 'Kontakt',
      alias: 'kontakt-de',
      template: 'Base',
      language: 'de',
      publish: true,
      translationOf: about,
    });
    expect(Number(app.content.drafts.page(de).translationOf)).toBe(ru);
    expect(hreflang(await html('/kontakty'))).toContain(
      'de http://localhost/kontakt-de'
    );
    // Связь снята — переводы уходят из шапки и исходной, и бывшего перевода.
    app.content.pages.edit(about, { translationOf: null });
    expect(hreflang(await html('/en/contacts'))).toEqual([]);
    expect(hreflang(await html('/kontakty'))).not.toContain(
      'en http://localhost/en/contacts'
    );
  });

  it('новый адрес перевода — в шапке исходной сразу', async () => {
    await html('/kontakty');
    app.content.pages.edit(about, { alias: 'contact' });
    expect(hreflang(await html('/kontakty'))).toContain(
      'en http://localhost/en/contact'
    );
    // Перенос самого перевода в другую ветку — тоже новый адрес в шапке исходной.
    const other = app.content.pages.create({
      title: 'Other',
      alias: 'other',
      template: 'Base',
      language: 'en',
      publish: true,
    });
    await html('/kontakty');
    app.content.pages.move(about, other);
    expect(hreflang(await html('/kontakty'))).toContain(
      'en http://localhost/other/contact'
    );
    app.content.pages.move(about, en);
    app.content.pages.move(en, null);
    app.content.pages.edit(en, { alias: 'english' });
    expect(hreflang(await html('/kontakty'))).toContain(
      'en http://localhost/english/contact'
    );
  });

  it('черновик, скрытая от поиска и второй перевод на тот же язык в hreflang не идут', async () => {
    app.content.pages.create({
      title: 'Draft',
      alias: 'draft',
      template: 'Base',
      language: 'de',
      translationOf: ru,
    });
    app.content.pages.create({
      parentId: en,
      title: 'Contacts again',
      alias: 'again',
      template: 'Base',
      publish: true,
      translationOf: ru,
    });
    expect(hreflang(await html('/kontakty'))).toEqual([
      'ru http://localhost/kontakty',
      'en http://localhost/en/contacts',
      'x-default http://localhost/kontakty',
    ]);
    app.content.pages.edit(about, { searchable: false });
    expect(hreflang(await html('/kontakty'))).toEqual([
      'ru http://localhost/kontakty',
      'en http://localhost/en/again',
      'x-default http://localhost/kontakty',
    ]);
  });

  it('правила связи: не сама на себя, исходная существует, у исходной со своими переводами — отказ', () => {
    expect(
      codeOf(() => app.content.pages.edit(ru, { translationOf: ru }))
    ).toBe('content.invalid_translation');
    expect(
      codeOf(() => app.content.pages.edit(en, { translationOf: 9999 }))
    ).toBe('content.translation_not_found');
    expect(
      codeOf(() => app.content.pages.edit(ru, { translationOf: en }))
    ).toBe('content.translation_has_translations');
  });

  it('исходная удалена из корзины — переводы остаются страницами без набора', async () => {
    app.content.pages.trash(ru);
    app.content.trash.empty();
    expect(app.content.drafts.page(about).translationOf).toBeNull();
    expect(hreflang(await html('/en/contacts'))).toEqual([]);
  });

  it('sitemap.xml — с xhtml:link на переводы', async () => {
    const sitemap = await html('/sitemap.xml');
    expect(sitemap).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(sitemap).toContain('<loc>http://localhost/en/contacts</loc>');
    expect(sitemap).toContain(
      '<xhtml:link rel="alternate" hreflang="en" href="http://localhost/en/contacts"/>'
    );
  });

  it('$core: translations() — переключатель языка в шаблоне', async () => {
    app.design.templates.save(
      'Base',
      "<script>import { translations } from '$core';\nlet { page } = $props();</script><nav>{#each translations() as _ (_.language)}<a href={_.url} hreflang={_.language} aria-current={_.current ? 'page' : undefined}>{_.title}</a>{/each}</nav>"
    );
    const page = await html('/en/contacts');
    expect(page).toContain('<a href="/kontakty" hreflang="ru">');
    expect(page).toContain(
      '<a href="/en/contacts" hreflang="en" aria-current="page">Contacts</a>'
    );
    expect(await html('/en')).toContain('<nav></nav>');
  });

  it('менеджер: набор переводов в карточке страницы, исходная первой', async () => {
    const setup = await app.fetch(
      new Request('http://localhost/manager/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: app.identity.setup.token(),
          email: 'admin@example.com',
          password: 'correct horse battery',
        }),
      })
    );
    const cookie = (setup.headers.get('set-cookie') ?? '').split(';')[0]!;
    const details = await app
      .fetch(
        new Request(`http://localhost/manager/api/pages/${about}`, {
          headers: { cookie },
        })
      )
      .then((_) => _.json() as Promise<any>);
    expect(details.page.translationOf).toBe(ru);
    expect(details.translations).toMatchObject([
      // Пустой язык — язык сайта: так его показывает и редактор.
      { id: ru, language: '', original: true, published: true },
      { id: about, language: 'en', original: false },
    ]);
  });
});
