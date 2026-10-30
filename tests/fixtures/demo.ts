import { KIT } from '../../src/kit/index.ts';
import { PRODUCT } from '../../src/product.ts';
import type { Scaffold } from '../../src/scaffolds/scaffold.ts';
import base from './demo/Base.svelte' with { type: 'text' };
import callout from './demo/Callout.svelte' with { type: 'text' };
import header from './demo/Header.svelte' with { type: 'text' };

// Импорт текстом; собственные типы Svelte для `*.svelte` описывают компонент.
const _text = (source: unknown): string => source as string;

const _PAGES = [
  [
    'Главная',
    'Сайт работает: эту страницу собрал шаблон Base из компонентов Header и Menu.',
  ],
  ['О проекте', 'Алиас этой страницы получен из заголовка транслитерацией.'],
  [
    'Контакты',
    'Шаблоны и компоненты лежат в базе и компилируются при сохранении.',
  ],
] as const;

// Блог показывает ленту из набора и порции по ЧПУ: /blog/page-2.
const _POSTS = [
  ['Первая запись', 'Посты — дочерние страницы блога, скрытые из меню.'],
  ['Вторая запись', 'Лента берёт заголовок, дату и анонс поста.'],
  ['Третья запись', 'Вторая порция ленты живёт по адресу /blog/page-2.'],
] as const;

// Компонент в тексте страницы: в менеджере это блок с формой параметров.
const _TRY =
  '\n[[Callout title="Попробуйте" text="Откройте /manager и поправьте эту врезку: это компонент Callout внутри текста страницы."]]';

/** Демо-сайт тестов: весь набор, Header, Callout, шаблон Base, три страницы, блог с порциями и 404. */
export var DEMO: Scaffold = {
  name: 'demo',
  title: 'Демо',
  summary: 'Сайт для тестов',
  siteName: PRODUCT,
  kit: KIT.map((_) => _.name),
  components: { Header: _text(header), Callout: _text(callout) },
  templates: { Base: _text(base) },
  pages: [
    ..._PAGES.map(({ 0: title, 1: text }, index) => ({
      ...(index === 0 ? { key: 'home' } : {}),
      title,
      template: 'Base',
      content: `<p>${text}</p>${index === 0 ? _TRY : ''}`,
      description: text,
    })),
    {
      title: 'Блог',
      alias: 'blog',
      template: 'Base',
      content: '[[PostList perPage=2]]',
      description: 'Записи демо-сайта.',
      children: _POSTS.map(({ 0: title, 1: text }) => ({
        title,
        template: 'Base',
        content: `<p>${text}</p>`,
        introText: text,
        hiddenFromMenu: true,
      })),
    },
    {
      key: 'not-found',
      title: 'Страница не найдена',
      alias: '404',
      template: 'Base',
      content: '<p>Такой страницы нет. <a href="/">На главную</a></p>',
      hiddenFromMenu: true,
    },
  ],
  home: 'home',
  notFound: 'not-found',
};
