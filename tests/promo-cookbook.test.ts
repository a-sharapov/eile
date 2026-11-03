import { afterEach, describe, expect, it } from 'bun:test';
import { CHAPTERS_EN } from '../site/cookbook/en/index.ts';
import type { Chapter } from '../site/cookbook/markup.ts';
import { replay } from '../site/cookbook/replay.ts';
import { CHAPTERS_RU } from '../site/cookbook/ru/index.ts';
import { type App, createApp } from '../src/app.ts';
import { type Scaffold, WELCOME, WELCOME_EN } from '../src/scaffolds/index.ts';

// Кукбук проверяет сам себя: тест проходит главы, как читатель, и смотрит на сайт после каждой.

let app: App;

afterEach(() => app.close());

const get = (path: string) => app.fetch(new Request(`http://localhost${path}`));

// Страница, как её получает браузер: HTML и файлы стилей по ссылкам из head (ADR 0047).
const html = (path: string) =>
  get(path).then((_) =>
    _.text().then((page) =>
      Promise.all(
        [...page.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(
          (link) => get(link[1]!).then((css) => css.text())
        )
      ).then((styles) => ({
        status: _.status,
        text: [page, ...styles].join('\n'),
      }))
    )
  );

const walk = (chapters: readonly Chapter[], scaffold: Scaffold) => {
  app = createApp({ scaffold });
  return replay(app, chapters, (chapter) =>
    Promise.all(
      (chapter.expect ?? []).map(({ 0: path, 1: text }) =>
        html(path).then((_) => {
          expect(`${chapter.alias} ${path} ${_.status}`).toBe(
            `${chapter.alias} ${path} 200`
          );
          expect(_.text).toContain(text);
        })
      )
    )
  );
};

describe('кукбук', () => {
  it('русские главы проходятся от начала до конца', () =>
    walk(CHAPTERS_RU, WELCOME));

  it('английские главы — тоже, на английском приветствии', () =>
    walk(CHAPTERS_EN, WELCOME_EN));

  it('главы двух языков идут парами: переключатель языка ищет пару по месту', () =>
    expect(CHAPTERS_EN.length).toBe(CHAPTERS_RU.length));
});
