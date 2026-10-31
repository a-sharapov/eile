import { describe, expect, it } from 'bun:test';
import { chain } from '../../../shared/kernel/changed.ts';
import { createField } from './field.ts';
import {
  applySchedule,
  createPage,
  editPage,
  movePage,
  parsePageId,
  publishPage,
  restorePage,
  setFields,
  trashPage,
  unpublishPage,
} from './page.ts';

const _AT = '2026-11-01T10:00:00.000Z';

const id = parsePageId(1);
const draft = createPage(id, { title: 'News', template: 'Base' }).state;

describe('Page', () => {
  it('создаётся неопубликованной, алиас — из заголовка', () => {
    const { state, events } = createPage(id, {
      title: ' О проекте ',
      template: 'Base',
    });
    expect(state).toMatchObject({
      title: 'О проекте',
      alias: 'o-proekte',
      published: false,
      cacheable: true,
    });
    expect(events).toEqual([
      { type: 'content.page_created', pageId: id, parentId: null },
    ]);
  });

  it('повторная публикация не порождает событий', () => {
    const once = publishPage(_AT)(draft);
    expect(once.events).toEqual([
      { type: 'content.page_published', pageId: id, parentId: null },
    ]);
    expect(publishPage(_AT)(once.state).events).toEqual([]);
    expect(unpublishPage(draft).events).toEqual([]);
  });

  it('перевод: не сам себя; событие несёт исходную и прежнюю исходную', () => {
    expect(() => editPage({ translationOf: 1 })(draft)).toThrow(
      'translation of itself'
    );
    const linked = editPage({ translationOf: 7 })(draft);
    expect(linked.state.translationOf).toBe(parsePageId(7));
    expect(linked.events).toEqual([
      {
        type: 'content.page_edited',
        pageId: id,
        parentId: null,
        translationOf: parsePageId(7),
        previousTranslationOf: null,
      },
    ]);
    expect(editPage({ translationOf: null })(linked.state).events).toEqual([
      {
        type: 'content.page_edited',
        pageId: id,
        parentId: null,
        previousTranslationOf: parsePageId(7),
      },
    ]);
  });

  it('chain копит события переходов', () => {
    const created = createPage(id, { title: 'News', template: 'Base' });
    expect(chain(publishPage(_AT))(created).events.map((_) => _.type)).toEqual([
      'content.page_created',
      'content.page_published',
    ]);
  });

  it('правка проверяет каждое изменённое поле и не трогает остальные', () => {
    expect(() => editPage({ title: '  ' })(draft)).toThrow('Title must be');
    expect(() => editPage({ alias: 'Bad Alias' })(draft)).toThrow(
      'must be lowercase'
    );
    expect(
      editPage({ alias: 'news-2026', menuIndex: 3, content: undefined })(draft)
        .state
    ).toMatchObject({
      alias: 'news-2026',
      menuIndex: 3,
      title: 'News',
      content: '',
    });
  });

  it('пустой алиас выводится из заголовка — и при создании, и при правке', () => {
    expect(
      String(
        createPage(id, { title: 'О проекте', alias: ' ', template: 'Base' })
          .state.alias
      )
    ).toBe('o-proekte');
    expect(
      String(editPage({ title: 'Контакты', alias: '' })(draft).state.alias)
    ).toBe('kontakty');
  });

  it('не может быть родителем самой себе', () => {
    expect(() =>
      createPage(id, { parentId: id, title: 'Loop', template: 'Base' })
    ).toThrow('own parent');
  });

  it('id — положительное целое', () => {
    expect(() => parsePageId(0)).toThrow('Invalid page id');
    expect(() => parsePageId(1.5)).toThrow('Invalid page id');
  });

  it('перемещение внутрь своей ветки запрещено, на прежнее место — без событий', () => {
    const child = parsePageId(2);
    expect(movePage(null, [])(draft).events).toEqual([]);
    expect(() => movePage(child, [child, id])(draft)).toThrow('own branch');
    expect(movePage(child, [child])(draft).state.parentId).toBe(child);
  });
});

describe('поля страницы', () => {
  const subtitle = createField({
    name: 'subtitle',
    type: 'text',
    templates: ['Base'],
  }).state;
  const price = createField({
    name: 'price',
    type: 'number',
    templates: ['Product'],
  }).state;

  it('значение проверяется по типу поля, null удаляет своё значение', () => {
    const withSubtitle = setFields([subtitle], { subtitle: 'Коротко' })(draft);
    expect(withSubtitle.state.fields).toEqual({ subtitle: 'Коротко' });
    expect(
      setFields([subtitle], { subtitle: null })(withSubtitle.state).state.fields
    ).toEqual({});
    expect(() => setFields([subtitle], { subtitle: 5 })(draft)).toThrow(
      'not a valid text'
    );
  });

  it('поле чужого шаблона не задаётся', () => {
    expect(() => setFields([price], { price: 10 })(draft)).toThrow(
      'not assigned to template "Base"'
    );
  });
});

describe('стандартные поля, ссылки, расписание, корзина', () => {
  it('стандартные поля обрезаются и проверяются по длине', () => {
    const { state } = createPage(id, {
      title: 'News',
      template: 'Base',
      longTitle: '  Все новости  ',
      menuTitle: 'Новости',
    });
    expect(state).toMatchObject({
      longTitle: 'Все новости',
      menuTitle: 'Новости',
    });
    expect(() => editPage({ description: 'x'.repeat(1001) })(draft)).toThrow(
      'at most 1000'
    );
  });

  it('ссылке нужна цель: URL, /путь или id страницы', () => {
    expect(() => editPage({ kind: 'link' })(draft)).toThrow('needs a target');
    expect(() => editPage({ linkTo: 'ftp://x' })(draft)).toThrow('http(s) URL');
    expect(editPage({ kind: 'link', linkTo: '42' })(draft).state).toMatchObject(
      { kind: 'link', linkTo: '42' }
    );
  });

  it('тип содержимого — MIME без параметров, по умолчанию text/html', () => {
    expect(draft.contentType).toBe('text/html');
    expect(
      editPage({ contentType: ' Application/RSS+XML ' })(draft).state
    ).toMatchObject({ contentType: 'application/rss+xml' });
    expect(() => editPage({ contentType: 'css' })(draft)).toThrow(
      'not a MIME type'
    );
    expect(() =>
      editPage({ contentType: 'text/html; charset=utf-8' })(draft)
    ).toThrow('not a MIME type');
  });

  it('снятие с публикации должно быть позже публикации', () => {
    expect(() =>
      editPage({
        publishAt: '2026-11-02T00:00:00Z',
        unpublishAt: '2026-11-01T00:00:00Z',
      })(draft)
    ).toThrow('later than publishAt');
    expect(() => editPage({ publishAt: 'завтра' })(draft)).toThrow(
      'not a date and time'
    );
  });

  it('applySchedule публикует и снимает по наступившим моментам', () => {
    const scheduled = editPage({
      publishAt: '2026-11-01T09:00:00+00:00',
      unpublishAt: '2026-11-01T12:00:00Z',
    })(draft).state;
    const published = applySchedule(_AT)(scheduled);
    expect(published.state).toMatchObject({
      published: true,
      publishAt: null,
      publishedAt: '2026-11-01T09:00:00.000Z',
      unpublishAt: '2026-11-01T12:00:00.000Z',
    });
    expect(
      applySchedule('2026-11-01T12:00:00.000Z')(published.state).state
    ).toMatchObject({ published: false, unpublishAt: null });
    expect(applySchedule('2026-11-01T08:00:00.000Z')(scheduled).events).toEqual(
      []
    );
  });

  it('корзина и восстановление — по одному событию', () => {
    const trashed = trashPage(_AT)(draft);
    expect(trashed.state.trashedAt).toBe(_AT);
    expect(trashPage(_AT)(trashed.state).events).toEqual([]);
    expect(restorePage(trashed.state).events).toEqual([
      { type: 'content.page_restored', pageId: id, parentId: null },
    ]);
  });
});
