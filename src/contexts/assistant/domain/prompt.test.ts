import { describe, expect, it } from 'bun:test';
import { endpointOf, parseConnection } from './connection.ts';
import { buildPrompt, cleanOutput, parseTarget } from './prompt.ts';

const _site = {
  name: 'Кухни на заказ',
  language: 'ru',
  description: 'Мастерская в Минске',
  url: 'https://example.com',
};

describe('подключение ИИ', () => {
  it('адрес — http(s), без хвостового слэша; пустой ключ оставляет прежний', () => {
    const first = parseConnection(
      { url: 'https://api.deepseek.com/', model: 'deepseek-flash', key: 'k1' },
      null
    );
    expect(first.url).toBe('https://api.deepseek.com');
    expect(parseConnection({ ...first, key: '' }, first).key).toBe('k1');
    expect(endpointOf(first)).toBe('https://api.deepseek.com/chat/completions');
    expect(
      endpointOf({ ...first, url: 'http://localhost:1/v1/chat/completions' })
    ).toBe('http://localhost:1/v1/chat/completions');
    expect(() =>
      parseConnection({ url: 'ftp://x', model: 'm', key: 'k' }, null)
    ).toThrow();
    expect(() =>
      parseConnection({ url: 'https://x', model: 'm' }, null)
    ).toThrow();
  });
});

describe('промпт', () => {
  it('системный промпт знает сайт, поле, его ограничения и место', () => {
    const prompt = buildPrompt(
      parseTarget({
        kind: 'text',
        label: 'Заголовок',
        hint: 'Короче — лучше',
        value: 'Кухни',
        maxLength: 60,
        area: 'страница «О нас»',
        facts: ['Путь: /o-nas'],
      }),
      'сделай живее',
      _site,
      'Пишем на «вы»'
    );
    expect(prompt.system).toContain('«Кухни на заказ»');
    expect(prompt.system).toContain('Поле: «Заголовок»');
    expect(prompt.system).toContain('Не длиннее 60 знаков');
    expect(prompt.system).toContain('- Путь: /o-nas');
    expect(prompt.system).toContain('Указания владельца сайта: Пишем на «вы»');
    expect(prompt.user).toContain('Запрос: сделай живее');
    expect(prompt.user).toContain('Текущее значение поля:\nКухни');
  });

  it('для шаблона — правила шаблонов и ответ целым файлом', () => {
    const prompt = buildPrompt(
      parseTarget({ kind: 'template', label: 'Код' }),
      'добавь футер',
      _site,
      ''
    );
    expect(prompt.system).toContain('let { page, site } = $props();');
    expect(prompt.system).toContain('Верни файл целиком');
    expect(prompt.temperature).toBeLessThan(0.5);
  });

  it('неизвестный вид поля и пустой запрос не принимаются', () => {
    expect(() => parseTarget({ kind: 'sql' })).toThrow();
  });
});

describe('ответ модели', () => {
  it('без обёртки ```, кавычек и переносов у строки; длина — по полю, по слову', () => {
    expect(
      cleanOutput(
        parseTarget({ kind: 'template' }),
        '```svelte\n<p>Привет</p>\n```'
      )
    ).toBe('<p>Привет</p>');
    expect(cleanOutput(parseTarget({ kind: 'text' }), '«Кухни\nмечты»')).toBe(
      'Кухни мечты'
    );
    expect(
      cleanOutput(
        parseTarget({ kind: 'text', maxLength: 20 }),
        'Кухни мечты для всей семьи'
      )
    ).toBe('Кухни мечты для');
  });
});
