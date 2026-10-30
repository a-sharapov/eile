import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { type App, createApp } from '../src/app.ts';
import { DEMO } from './fixtures/demo.ts';

let app: App;

beforeEach(() => {
  app = createApp({ scaffold: DEMO });
  app.site.settings.update({ language: 'ru', languages: ['en'] });
  app.site.translations.save('greeting', { ru: 'Привет', en: 'Hello' });
  app.site.translations.save('onlyRu', { ru: 'Только по-русски' });
  app.site.customSettings.save('phone', '+7 900 000-00-00');
});

afterEach(() => app.close());

const html = (path: string) =>
  app.fetch(new Request(`http://localhost${path}`)).then((_) => _.text());

const idOf = (path: string) => app.content.published.byPath(path)!.id;

describe('переводы и свои настройки', () => {
  it('ключи в контенте — на языке ветки; язык наследуется, <html lang> тоже', async () => {
    const en = app.content.pages.create({
      title: 'English',
      alias: 'en',
      template: 'Base',
      language: 'en',
      publish: true,
      content: '<p>{i18n.greeting}, [@phone] — {i18n.onlyRu}</p>',
    });
    app.content.pages.create({
      parentId: en,
      title: 'About',
      template: 'Base',
      publish: true,
      content: '<p>{i18n.greeting}</p>',
    });
    app.content.pages.edit(idOf('/kontakty'), {
      content: '<p>{i18n.greeting} {i18n.nope}</p>',
    });
    const english = await html('/en');
    expect(english).toStartWith('<!doctype html>\n<html lang="en">');
    expect(english).toContain(
      '<p>Hello, +7 900 000-00-00 — Только по-русски</p>'
    );
    expect(await html('/en/about')).toContain('<p>Hello</p>');
    expect(await html('/kontakty')).toContain('<p>Привет {i18n.nope}</p>');
  });

  it('site.i18n и site.custom в шаблоне, теги в параметрах компонента; значения экранируются', async () => {
    app.site.customSettings.save('brand', '<b>Ко</b>');
    app.design.templates.save(
      'Base',
      "<script>import Content from '$core/Content';\nlet { page, site } = $props();</script><h1 title={site.custom.brand}>{site.i18n.greeting}</h1><Content of={page} />"
    );
    app.content.pages.edit(idOf('/kontakty'), {
      content: '[[Callout title="{i18n.greeting}" text="[@phone]"]]',
    });
    const page = await html('/kontakty');
    expect(page).toContain('<h1 title="&lt;b>Ко&lt;/b>">Привет</h1>');
    expect(page).toContain('<strong>Привет</strong>');
    expect(page).toContain('+7 900 000-00-00');
  });

  it('теги ключей в шаблоне отклоняются с подсказкой', () => {
    expect(() =>
      app.design.templates.save('Base', '<h1>{i18n.greeting}</h1>')
    ).toThrow('{site.i18n.key}');
    expect(() =>
      app.design.templates.save('Base', '<p title="[@phone]">x</p>')
    ).toThrow('{site.custom.key}');
  });

  it('нет ключа — в шаблоне виден сам ключ', async () => {
    app.design.templates.save(
      'Base',
      '<script>let { site } = $props();</script><p>{site.i18n.missing} {site.custom.missing}</p>'
    );
    expect(await html('/kontakty')).toContain(
      '<p>{i18n.missing} [@missing]</p>'
    );
  });

  it('правка перевода сбрасывает кэш страниц', async () => {
    app.content.pages.edit(idOf('/kontakty'), {
      content: '<p>{i18n.greeting}</p>',
    });
    expect(await html('/kontakty')).toContain('<p>Привет</p>');
    app.site.translations.save('greeting', { ru: 'Здравствуйте', en: 'Hello' });
    expect(await html('/kontakty')).toContain('<p>Здравствуйте</p>');
  });

  it('неверный ключ и язык отклоняются', () => {
    expect(() => app.site.translations.save('1bad', { ru: 'x' })).toThrow(
      'must be latin'
    );
    expect(() => app.site.translations.save('ok', { Russian: 'x' })).toThrow(
      'not valid'
    );
    expect(() =>
      app.content.pages.create({
        title: 'X',
        template: 'Base',
        language: 'Russian',
      })
    ).toThrow('not a language tag');
  });
});
