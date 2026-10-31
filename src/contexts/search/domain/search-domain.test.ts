import { describe, expect, it } from 'bun:test';
import { documentOf, lineageOf } from './document.ts';
import {
  matchOf,
  parseQuery,
  parseSynonyms,
  QUERY_LIMITS,
  termsOf,
} from './query.ts';
import { snippetOf } from './snippet.ts';
import { stem, stemEnglish, stemRussian } from './stem.ts';
import { editDistance, nearestTerm } from './typos.ts';

describe('основы слов', () => {
  it('русские формы одного слова сходятся к одной основе', () => {
    const groups = [
      ['книга', 'книги', 'книгой', 'книгам'],
      ['тетрадь', 'тетради', 'тетрадью'],
      ['привычка', 'привычки', 'привычками'],
      ['уведомление', 'уведомления', 'уведомлений'],
      ['красивая', 'красивые', 'красивого'],
      ['читать', 'читаю'],
      ['доставка', 'доставки', 'доставкой'],
    ];
    groups.forEach(
      (group) => void expect(new Set(group.map(stemRussian)).size).toBe(1)
    );
  });

  it('ость и суперлатив снимаются только в своей области', () => {
    expect(stemRussian('возможность')).toBe('возможн');
    expect(stemRussian('кость')).toBe('кост');
    expect(stemRussian('новейший')).toBe('нов');
  });

  it('английские: множественное число, -ing и -ed', () => {
    expect(stemEnglish('stories')).toBe('story');
    expect(stemEnglish('boxes')).toBe('box');
    expect(stemEnglish('running')).toBe('run');
    expect(stemEnglish('played')).toBe('play');
    expect(stemEnglish('glasses')).toBe('glass');
    expect(stemEnglish('this')).toBe('this');
  });

  it('цифры и слова без гласных — как есть, ё — как е', () => {
    expect(stem('2026')).toBe('2026');
    expect(termsOf('Ёлка и ЕЛКИ')).toBe('елк и елк');
  });
});

describe('запрос', () => {
  it('операторы и кавычки FTS5 из запроса не проходят', () => {
    const query = parseQuery('title:книги OR кот NEAR(a b) *')!;
    expect(matchOf(query)).toBe(
      '"title"* AND "книг"* AND "or" AND "кот" AND "near"*'
    );
    expect(matchOf(query)).not.toContain(':');
  });

  it('пустой запрос — искать нечего; длина и число слов ограничены', () => {
    expect(parseQuery('  —  ')).toBeNull();
    const long = parseQuery('слово '.repeat(100))!;
    expect(long.clauses).toHaveLength(QUERY_LIMITS.terms);
    expect(long.text.length).toBeLessThanOrEqual(QUERY_LIMITS.length);
  });

  it('префикс — у длинных слов и у последнего, короткие основы точные', () => {
    expect(parseQuery('чай')!.clauses).toEqual([
      [{ stems: ['ча'], prefix: false }],
    ]);
    expect(parseQuery('книги про')!.clauses).toEqual([
      [{ stems: ['книг'], prefix: true }],
      [{ stems: ['про'], prefix: true }],
    ]);
    // Однобуквенные слова при других словах не ищутся.
    expect(parseQuery('книги и тетради')!.clauses).toHaveLength(2);
  });

  it('фраза в кавычках — основы подряд; однобуквенные слова в ней остаются', () => {
    expect(matchOf(parseQuery('«кухни и столы» дуб')!)).toBe(
      '"кухн и стол"* AND "дуб"*'
    );
    // Незакрытая кавычка — фраза до конца запроса: её ещё дописывают.
    expect(matchOf(parseQuery('"белая кух')!)).toBe('"бел кух"*');
    expect(parseQuery('"белая кухня"')!.sources).toEqual(['"белая кухня"']);
  });

  it('синонимы: слово раскрывается в группу через OR, фраза-вариант — фразой', () => {
    const synonyms = parseSynonyms(
      'диван, софа; кушетка\nкухня, кухонный гарнитур\nодно'
    );
    expect(matchOf(parseQuery('софа', synonyms)!)).toBe(
      '("соф"* OR "дива"* OR "кушетк"*)'
    );
    expect(matchOf(parseQuery('кухни дуб', synonyms)!)).toBe(
      '("кухн"* OR "кухон гарнитур"*) AND "дуб"*'
    );
    // Группа из одного варианта — не группа; фраза запроса синонимами не раскрывается.
    expect(matchOf(parseQuery('"одно"', synonyms)!)).toBe('"одн"*');
  });
});

describe('опечатки', () => {
  it('правки: вставка, удаление, замена, перестановка соседних', () => {
    expect(editDistance('каталог', 'каталог', 2)).toBe(0);
    expect(editDistance('ктаалог', 'каталог', 2)).toBe(1);
    expect(editDistance('каталг', 'каталог', 2)).toBe(1);
    expect(editDistance('abcdef', 'zzzzzz', 2)).toBe(3);
  });

  it('ближайшее слово индекса: меньше правок, затем чаще; короткое и цифры не правим', () => {
    const vocabulary = [
      { term: 'каталог', docs: 4 },
      { term: 'катал', docs: 9 },
      { term: 'диван', docs: 2 },
    ];
    expect(nearestTerm('ктаалог', vocabulary)).toBe('каталог');
    expect(nearestTerm('дивнан', vocabulary)).toBe('диван');
    expect(nearestTerm('чай', vocabulary)).toBeNull();
    expect(nearestTerm('2026', vocabulary)).toBeNull();
    expect(nearestTerm('мебель', vocabulary)).toBeNull();
  });
});

describe('отрывок', () => {
  it('найденные формы слова — в <mark>, текст экранирован', () => {
    const query = parseQuery('книги')!;
    const html = snippetOf('Читаю <script> книгу и пишу о книгах.', query);
    expect(html).toContain('<mark>книгу</mark>');
    expect(html).toContain('<mark>книгах</mark>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('длинный текст режется окном вокруг первого совпадения', () => {
    const text = `${'Вступление без нужного слова. '.repeat(20)}Здесь говорится о тетрадях в клетку. ${'Хвост. '.repeat(40)}`;
    const html = snippetOf(text, parseQuery('тетрадь')!);
    expect(html.startsWith('…')).toBe(true);
    expect(html.endsWith('…')).toBe(true);
    expect(html).toContain('<mark>тетрадях</mark>');
    expect(html.replace(/<\/?mark>/g, '').length).toBeLessThan(200);
  });

  it('нет совпадения в тексте — начало текста', () => {
    expect(snippetOf('Первая строка текста.', parseQuery('заголовок')!)).toBe(
      'Первая строка текста.'
    );
  });
});

describe('документ', () => {
  it('ветка — от корня к самой странице, текст — описание, анонс, текст и поля', () => {
    expect(lineageOf([1, 5], 9)).toBe('/1/5/9/');
    const document = documentOf({
      id: 9,
      language: 'ru',
      ancestors: [1, 5],
      title: 'Чай',
      longTitle: 'Зелёный чай',
      menuTitle: '',
      description: 'Описание',
      introText: '',
      content: 'Текст страницы',
      fields: ['Китай'],
    });
    expect(document.title).toBe('Зелёный чай');
    expect(document.text).toBe('Описание\nТекст страницы\nКитай');
    expect(document.titleTerms).toBe('ча зелен ча');
  });
});
