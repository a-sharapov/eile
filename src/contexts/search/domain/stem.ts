// Основа слова: русский — по алгоритму Snowball (Портер для русского), английский — лёгкое снятие
// окончаний. Индекс и запрос проходят через одну функцию, поэтому важнее постоянство, чем лингвистика.

const _VOWELS = 'аеиоуыэюя';

const _vowel = (char: string | undefined): boolean =>
  char !== undefined && _VOWELS.includes(char);

type Group = { readonly endings: readonly string[]; readonly afterAYa?: true };

// Группа «после а/я»: окончание считается, только если перед ним а или я; сама буква остаётся.
const _GERUND: readonly Group[] = [
  { endings: ['в', 'вши', 'вшись'], afterAYa: true },
  { endings: ['ив', 'ивши', 'ившись', 'ыв', 'ывши', 'ывшись'] },
];
const _ADJECTIVE: readonly Group[] = [
  {
    endings: [
      'ее',
      'ие',
      'ые',
      'ое',
      'ими',
      'ыми',
      'ей',
      'ий',
      'ый',
      'ой',
      'ем',
      'им',
      'ым',
      'ом',
      'его',
      'ого',
      'ему',
      'ому',
      'их',
      'ых',
      'ую',
      'юю',
      'ая',
      'яя',
      'ою',
      'ею',
    ],
  },
];
const _PARTICIPLE: readonly Group[] = [
  { endings: ['ем', 'нн', 'вш', 'ющ', 'щ'], afterAYa: true },
  { endings: ['ивш', 'ывш', 'ующ'] },
];
const _REFLEXIVE: readonly Group[] = [{ endings: ['ся', 'сь'] }];
const _VERB: readonly Group[] = [
  {
    endings: [
      'ла',
      'на',
      'ете',
      'йте',
      'ли',
      'й',
      'л',
      'ем',
      'н',
      'ло',
      'но',
      'ет',
      'ют',
      'ны',
      'ть',
      'ешь',
      'нно',
    ],
    afterAYa: true,
  },
  {
    endings: [
      'ила',
      'ыла',
      'ена',
      'ейте',
      'уйте',
      'ите',
      'или',
      'ыли',
      'ей',
      'уй',
      'ил',
      'ыл',
      'им',
      'ым',
      'ен',
      'ило',
      'ыло',
      'ено',
      'ят',
      'ует',
      'уют',
      'ит',
      'ыт',
      'ены',
      'ить',
      'ыть',
      'ишь',
      'ую',
      'ю',
    ],
  },
];
const _NOUN: readonly Group[] = [
  {
    endings: [
      'а',
      'ев',
      'ов',
      'ие',
      'ье',
      'е',
      'иями',
      'ями',
      'ами',
      'еи',
      'ии',
      'и',
      'ией',
      'ей',
      'ой',
      'ий',
      'й',
      'иям',
      'ям',
      'ием',
      'ем',
      'ам',
      'ом',
      'о',
      'у',
      'ах',
      'иях',
      'ях',
      'ы',
      'ь',
      'ию',
      'ью',
      'ю',
      'ия',
      'ья',
      'я',
    ],
  },
];
const _SUPERLATIVE: readonly Group[] = [{ endings: ['ейш', 'ейше'] }];

type Ending = { readonly ending: string; readonly afterAYa: boolean };

const _sorted = (groups: readonly Group[]): readonly Ending[] =>
  groups
    .flatMap((_) =>
      _.endings.map((ending) => ({ ending, afterAYa: _.afterAYa === true }))
    )
    .toSorted((a, b) => b.ending.length - a.ending.length);

const _AMONG = {
  gerund: _sorted(_GERUND),
  adjective: _sorted(_ADJECTIVE),
  participle: _sorted(_PARTICIPLE),
  reflexive: _sorted(_REFLEXIVE),
  verb: _sorted(_VERB),
  noun: _sorted(_NOUN),
  superlative: _sorted(_SUPERLATIVE),
};

// Как among в Snowball: берётся самое длинное окончание; не выполнено его условие — снятия нет вовсе.
const _strip = (rv: string, among: readonly Ending[]): string | null =>
  ((found) =>
    found === undefined
      ? null
      : found.afterAYa && !'ая'.includes(rv.at(-found.ending.length - 1) ?? '-')
        ? null
        : rv.slice(0, rv.length - found.ending.length))(
    among.find((_) => rv.endsWith(_.ending))
  );

const _adjectival = (rv: string): string | null =>
  ((adjective) =>
    adjective === null
      ? null
      : (_strip(adjective, _AMONG.participle) ?? adjective))(
    _strip(rv, _AMONG.adjective)
  );

const _step1 = (rv: string): string =>
  _strip(rv, _AMONG.gerund) ??
  ((unreflexive) =>
    _adjectival(unreflexive) ??
    _strip(unreflexive, _AMONG.verb) ??
    _strip(unreflexive, _AMONG.noun) ??
    unreflexive)(_strip(rv, _AMONG.reflexive) ?? rv);

const _step4 = (rv: string): string =>
  rv.endsWith('нн')
    ? rv.slice(0, -1)
    : ((superlative) =>
        superlative === null
          ? rv.endsWith('ь')
            ? rv.slice(0, -1)
            : rv
          : superlative.endsWith('нн')
            ? superlative.slice(0, -1)
            : superlative)(_strip(rv, _AMONG.superlative));

// R1 — после первой согласной, что идёт за гласной; R2 — то же внутри R1.
const _region = (word: string, from: number): number =>
  ((at) => (at < 0 ? word.length : at + 1))(
    [...word].findIndex(
      (char, index) =>
        index - 1 >= from && !_vowel(char) && _vowel(word[index - 1])
    )
  );

/** Основа русского слова в нижнем регистре, ё уже заменена на е. */
export var stemRussian = (word: string): string =>
  ((start) => {
    const r2 = _region(word, _region(word, 0));
    const rv = word.slice(start);
    const step2 = ((_) => (_.endsWith('и') ? _.slice(0, -1) : _))(_step1(rv));
    const derivational = ((full) =>
      ['ость', 'ост'].reduce<string | null>(
        (found, ending) =>
          found ??
          (full.endsWith(ending) && full.length - ending.length >= r2
            ? step2.slice(0, step2.length - ending.length)
            : null),
        null
      ) ?? step2)(word.slice(0, start) + step2);
    return word.slice(0, start) + _step4(derivational);
  })(((at) => (at < 0 ? word.length : at + 1))([...word].findIndex(_vowel)));

const _EN_VOWEL = /[aeiouy]/;
const _DOUBLE = /([bdfgmnprt])\1$/;

const _undouble = (stem: string): string =>
  _DOUBLE.test(stem) ? stem.slice(0, -1) : stem;

// Таблица правил: первое подходящее снимает окончание; порядок — от длинных к коротким.
const _ENGLISH: readonly ((word: string) => string | null)[] = [
  (_) => (_.endsWith('sses') ? _.slice(0, -2) : null),
  (_) => (_.endsWith('ies') && _.length > 4 ? `${_.slice(0, -3)}y` : null),
  (_) => (/(?:sh|ch|x|z)es$/.test(_) ? _.slice(0, -2) : null),
  (_) =>
    _.endsWith('ing') && _.length >= 6 && _EN_VOWEL.test(_.slice(0, -3))
      ? _undouble(_.slice(0, -3))
      : null,
  (_) =>
    _.endsWith('ed') && _.length >= 5 && _EN_VOWEL.test(_.slice(0, -2))
      ? _undouble(_.slice(0, -2))
      : null,
  (_) => (/[^su]s$/.test(_) && !_.endsWith('is') ? _.slice(0, -1) : null),
];

/** Основа английского слова: множественное число, -ing, -ed. */
export var stemEnglish = (word: string): string =>
  word.length <= 3
    ? word
    : (_ENGLISH.reduce<string | null>(
        (found, rule) => found ?? rule(word),
        null
      ) ?? word);

const _CYRILLIC = /[а-я]/;
const _LATIN = /[a-z]/;
const _MEMO_LIMIT = 50_000;
const _memo = new Map<string, string>();

const _stem = (word: string): string =>
  _CYRILLIC.test(word)
    ? stemRussian(word)
    : _LATIN.test(word)
      ? stemEnglish(word)
      : word;

/** Основа слова в нижнем регистре: кириллица — русская, латиница — английская, цифры — как есть. */
export var stem = (word: string): string =>
  _memo.get(word) ??
  ((value) => (
    void (_memo.size >= _MEMO_LIMIT && _memo.clear()),
    _memo.set(word, value),
    value
  ))(_stem(word));
