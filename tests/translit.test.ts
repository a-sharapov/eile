import { expect, it } from 'bun:test';
import { aliasFromTitle as managerAlias } from '../manager/src/lib/translit.ts';
import { createApp } from '../src/app.ts';
import { aliasFromTitle } from '../src/contexts/content/domain/alias.ts';
import { DEMO } from './fixtures/demo.ts';

// Менеджер собирает адрес из заголовка сам, пока его не правили: он должен совпасть с серверным.

const _TITLES = [
  'О проекте',
  'Über uns: Größe',
  'Straße und Łódź',
  'Smørrebrød, Ærø, Œuvre',
  'İstanbul ılık',
  'Café — Menu!',
];

it.each(['', 'ru', 'de', 'de-AT', 'tr', 'fi'])(
  'менеджер и сервер дают один адрес; язык страницы %p',
  (language) => {
    expect(_TITLES.map((_) => managerAlias(_, language))).toEqual(
      _TITLES.map((_) => aliasFromTitle(_, language) as string)
    );
  }
);

it('адрес новой страницы — по языку ветки, иначе сайта', () => {
  const app = createApp({ scaffold: DEMO });
  const german = app.content.pages.create({
    title: 'Deutsch',
    alias: 'de',
    template: 'Base',
    language: 'de',
  });
  expect(
    app.content.drafts.page(
      app.content.pages.create({
        parentId: german,
        title: 'Über uns',
        template: 'Base',
      })
    ).alias as string
  ).toBe('ueber-uns');
  expect(
    app.content.drafts.page(
      app.content.pages.create({ title: 'Über uns', template: 'Base' })
    ).alias as string
  ).toBe('uber-uns');
  app.site.settings.update({ language: 'de' });
  expect(
    app.content.drafts.page(
      app.content.pages.create({ title: 'Größe', template: 'Base' })
    ).alias as string
  ).toBe('groesse');
  // Ветка видна и в дереве менеджера — язык узла уже с учётом предков.
  expect(
    app.content.drafts
      .tree()
      .find((_) => _.title === 'Über uns' && _.parentId === german)?.language
  ).toBe('de');
  app.close();
});
