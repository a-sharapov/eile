import type { App } from '../../src/app.ts';
import { kitClosure } from '../../src/kit/index.ts';
import type { Chapter, Replay, ReplayPage } from './markup.ts';
import { savedCode } from './markup.ts';

/** Байты картинки для шага «загрузите фото»: тесту хватит заглушки, снимкам нужна настоящая. */
export type Picture = (path: string) => {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
};

// Наименьший PNG 1×1: тесту важен путь в медиатеке, а не картинка.
const _PIXEL = Uint8Array.fromBase64(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='
);

const _pixel: Picture = () => ({ data: _PIXEL, width: 1, height: 1 });

/**
 * Проходит главы кукбука на сайте `app`, как читатель: сохраняет примеры, создаёт страницы, поля и
 * формы. Следующая глава начинается, когда закончилась проверка `after` предыдущей.
 */
export var replay = (
  app: App,
  chapters: readonly Chapter[],
  after: (chapter: Chapter) => Promise<unknown> | undefined = () => undefined,
  picture: Picture = _pixel
): Promise<void> => {
  const ids = new Map<string, number>(
    app.content.drafts.tree().map((_) => [_.title, _.id])
  );
  const idOf = (title: string): number =>
    ids.get(title) ??
    (() => {
      throw new Error(`Кукбук: нет страницы «${title}»`);
    })();

  const input = (page: Partial<ReplayPage>) => ({
    ...(page.title === undefined ? {} : { title: page.title }),
    ...(page.alias === undefined ? {} : { alias: page.alias }),
    ...(page.template === undefined ? {} : { template: page.template }),
    ...(page.content === undefined ? {} : { content: page.content }),
    ...(page.introText === undefined ? {} : { introText: page.introText }),
    ...(page.longTitle === undefined ? {} : { longTitle: page.longTitle }),
    ...(page.menuTitle === undefined ? {} : { menuTitle: page.menuTitle }),
    ...(page.hiddenFromMenu === undefined
      ? {}
      : { hiddenFromMenu: page.hiddenFromMenu }),
  });

  const steps = (chapter: Chapter): Replay => ({
    code: () =>
      savedCode(chapter.content).forEach(
        (_) =>
          void (_.kind === 'template'
            ? app.design.templates.save(_.name, _.source)
            : app.design.components.save(_.name, _.source))
      ),
    kit: (name) =>
      kitClosure(name).forEach(
        (_) => void app.design.components.save(_.name, _.source)
      ),
    page: (page) => {
      const id = app.content.pages.create({
        ...input(page),
        title: page.title,
        template: page.template ?? 'Minimal',
        parentId: page.parent === undefined ? null : idOf(page.parent),
        ...(page.fields ? { fields: page.fields } : {}),
        publish: page.publish ?? true,
      });
      ids.set(page.title, id);
      return id;
    },
    edit: (title, change) => {
      const id = idOf(title);
      app.content.pages.edit(id, input(change));
      void (change.fields && app.content.pages.setFields(id, change.fields));
      void (change.title && ids.set(change.title, id));
    },
    field: (field) => void app.content.fields.save(field),
    form: (name, form) => void app.forms.forms.save(name, form),
    setting: (key, value) => void app.site.customSettings.save(key, value),
    rename: (name) => void app.site.settings.update({ name }),
    upload: (path, alt) => {
      const file = picture(path);
      app.media.files.save({ path, ...file });
      app.media.files.describe(path, alt);
    },
  });

  return chapters.reduce<Promise<void>>(
    (previous, chapter) =>
      previous.then(() => {
        const step = steps(chapter);
        void (chapter.replay ? chapter.replay(step) : step.code());
        return Promise.resolve(after(chapter)).then(() => undefined);
      }),
    Promise.resolve()
  );
};
