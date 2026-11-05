import { expect, it } from 'bun:test';
import {
  blockGaps,
  blockSpan,
  emptyField,
  type FieldDraft,
  type FormBlock,
  fieldHtml,
  labelLines,
  labelsAttr,
  moveBlock,
  optionsOf,
  patterns,
  serializeForm,
  starterFields,
  stepOf,
} from '../manager/src/lib/form-blocks.ts';
import { LANGUAGES, loadLanguage } from '../manager/src/lib/i18n.ts';
import {
  assertLabels,
  checkValues,
} from '../src/contexts/forms/domain/schema.ts';
import { fieldsOf } from '../src/contexts/forms/infrastructure/html-markup.ts';

// Стартовая форма подписана на языке менеджера.
await loadLanguage('ru');

// Редактор форм собирает разметку, сервер её разбирает: каждое поле должно прочитаться тем же.

const parsed = (field: FieldDraft) => fieldsOf(fieldHtml(field));

it('стартовая форма читается сервером как задумано', () => {
  expect(
    fieldsOf(starterFields().map(fieldHtml).join('\n')).map((_) => [
      _.name,
      _.kind,
      _.label,
      _.required,
    ])
  ).toEqual([
    ['name', 'text', 'Имя', true],
    ['phone', 'tel', 'Телефон', true],
    ['comment', 'textarea', 'Комментарий', false],
    ['consent', 'consent', 'Согласен на обработку персональных данных', true],
  ]);
});

it.each([
  ['email', { kind: 'email' }, 'email'],
  ['url', { kind: 'url' }, 'url'],
  ['number', { kind: 'number', min: '1', max: '9', step: '1' }, 'number'],
  ['date', { kind: 'date', min: '2026-01-01' }, 'date'],
  ['range', { kind: 'range', min: '0', max: '100' }, 'range'],
] as const)('%p — тот же вид и границы', (_name, patch, kind) => {
  const [spec] = parsed({
    ...emptyField(),
    label: 'Поле',
    name: 'f',
    ...patch,
  });
  expect(spec).toMatchObject({
    kind,
    label: 'Поле',
    min:
      patch.kind === 'email' || patch.kind === 'url'
        ? null
        : ('min' in patch && patch.min) || null,
  });
});

it('список, переключатели и галочки — варианты со значениями и подписями', () => {
  const options = 'Сайт\nshop | Магазин & склад';
  expect(optionsOf(options)).toEqual([
    { value: 'Сайт', label: 'Сайт' },
    { value: 'shop', label: 'Магазин & склад' },
  ]);
  for (const kind of ['select', 'radio', 'checkbox'] as const) {
    const [spec] = parsed({
      ...emptyField(kind),
      label: 'Тема',
      name: 'topic',
      required: true,
      options,
    });
    expect(spec).toMatchObject({
      kind,
      label: 'Тема',
      required: kind !== 'checkbox',
      multiple: kind === 'checkbox',
      options: [
        { value: 'Сайт', label: 'Сайт' },
        { value: 'shop', label: 'Магазин & склад' },
      ],
    });
  }
});

it('скрытое поле — источник и подпись; постоянное — значение', () => {
  expect(
    parsed({
      ...emptyField('hidden'),
      name: 'src',
      label: 'Метки',
      source: 'utm',
    })
  ).toMatchObject([{ kind: 'hidden', label: 'Метки', source: 'utm' }]);
  expect(
    fieldHtml({ ...emptyField('hidden'), name: 'k', source: '', value: 'a"b' })
  ).toBe('<input type="hidden" name="k" value="a&quot;b">');
});

it('подписи скрытого поля: строки редактора — в data-labels, сервер читает их вариантами и сохранит', () => {
  const field = {
    ...emptyField('hidden'),
    name: 'paket',
    label: 'Paket',
    source: 'query:paket',
    options:
      'berater | KI-Küchenberater\nplanung | KI-Küchenberater & KI-Planung',
  };
  expect(fieldHtml(field)).toBe(
    '<input type="hidden" name="paket" data-source="query:paket" data-label="Paket" data-labels="berater=KI-Küchenberater|planung=KI-Küchenberater &amp; KI-Planung">'
  );
  const specs = parsed(field);
  expect(specs).toMatchObject([
    {
      kind: 'hidden',
      options: [
        { value: 'berater', label: 'KI-Küchenberater' },
        { value: 'planung', label: 'KI-Küchenberater & KI-Planung' },
      ],
    },
  ]);
  expect(() => assertLabels(specs)).not.toThrow();
  // Разбор редактора вернёт те же строки: правка поля подписи не теряет.
  expect(labelLines(labelsAttr(field.options))).toBe(field.options);
  expect(labelLines(' a = A | b=x=y ')).toBe('a | A\nb | x=y');
  // Без подписей атрибута нет.
  expect(fieldHtml({ ...field, options: '' })).not.toContain('data-labels');
});

it('кавычки и угловые скобки в подписях не ломают разметку', () => {
  const [spec] = parsed({
    ...emptyField(),
    label: 'Ваш "ник" <тут>',
    name: 'nick',
    message: 'Нужно "так"',
  });
  expect(spec).toMatchObject({
    label: 'Ваш "ник" <тут>',
    message: 'Нужно "так"',
  });
});

it('шаблоны из подсказок верны под флагом v и проверяются сервером', () => {
  for (const pattern of LANGUAGES.flatMap((_) => patterns(_))) {
    expect(() => new RegExp(`^(?:${pattern.value})$`, 'v')).not.toThrow();
  }
  const [phone] = parsed(starterFields()[1]!);
  expect(checkValues([phone!], { phone: ['12'] }, 'ru').errors.phone).toBe(
    'Нужен телефон: +7 900 000-00-00'
  );
  expect(
    checkValues([phone!], { phone: ['+7 (900) 000-00-00'] }, 'ru').errors
  ).toEqual({});
});

it('файл, условие показа и шаги из редактора сервер читает так же', () => {
  const file: FieldDraft = {
    ...emptyField('file'),
    label: 'Чертёж',
    name: 'plan',
    required: true,
    accept: '.pdf, image/*',
    maxSize: '5',
    multiple: true,
    showField: 'delivery',
    showValues: 'courier, post',
  };
  expect(parsed(file)).toMatchObject([
    {
      name: 'plan',
      kind: 'file',
      label: 'Чертёж',
      required: true,
      multiple: true,
      accept: ['.pdf', 'image/*'],
      maxSize: 5 * 1024 * 1024,
      showIf: { field: 'delivery', values: ['courier', 'post'] },
    },
  ]);
  const source = serializeForm([
    { id: 1, kind: 'step', title: 'Контакты' },
    {
      id: 2,
      kind: 'field',
      field: { ...emptyField('text'), label: 'Имя', name: 'name' },
      original: null,
    },
    { id: 3, kind: 'step', title: 'Чертёж' },
    { id: 4, kind: 'field', field: file, original: null },
  ]);
  expect(source).toContain('<fieldset class="form-step" data-step="Контакты">');
  expect(source.match(/<fieldset class="form-step"/g)).toHaveLength(2);
  expect(fieldsOf(source).map((_) => _.name)).toEqual(['name', 'plan']);
});

it('шаг без названия — конец шагов: то, что ниже, остаётся вне fieldset', () => {
  const source = serializeForm([
    { id: 1, kind: 'step', title: 'Контакты' },
    {
      id: 2,
      kind: 'field',
      field: { ...emptyField('text'), label: 'Имя', name: 'name' },
      original: null,
    },
    { id: 3, kind: 'step', title: '' },
    { id: 4, kind: 'text', html: '<p>После шагов</p>' },
  ]);
  expect(source.match(/<fieldset class="form-step"/g)).toHaveLength(1);
  expect(source.trimEnd()).toEndWith('</fieldset>\n<p>После шагов</p>');
});

it('разметка ответа — текстовый блок: переживает сборку, а её поля сервер полями формы не считает', () => {
  const sent =
    '<template data-sent><h2 tabindex="-1">Спасибо!</h2><input name="again"></template>';
  const source = serializeForm([
    {
      id: 1,
      kind: 'field',
      field: { ...emptyField('text'), label: 'Имя', name: 'name' },
      original: null,
    },
    { id: 2, kind: 'text', html: sent },
  ]);
  expect(source.trimEnd()).toEndWith(sent);
  expect(fieldsOf(source).map((_) => _.name)).toEqual(['name']);
});

// Перестановка блоков: поле — куда угодно, в том числе в другой шаг; шаг — целиком, на границу шагов.

const _field = (id: number, name: string): FormBlock => ({
  id,
  kind: 'field',
  field: { ...emptyField('text'), label: name, name },
  original: null,
});

const _FORM: readonly FormBlock[] = [
  { id: 1, kind: 'text', html: '<p>Вступление</p>' },
  { id: 2, kind: 'step', title: 'Контакты' },
  _field(3, 'name'),
  _field(4, 'phone'),
  { id: 5, kind: 'step', title: 'Проект' },
  _field(6, 'role'),
  _field(7, 'budget'),
  { id: 8, kind: 'step', title: '' },
  _field(9, 'consent'),
];

const _labels = (blocks: readonly FormBlock[]): string[] =>
  blocks.map((_) =>
    _.kind === 'field' ? _.field.name : _.kind === 'step' ? `#${_.title}` : 'T'
  );

// Что видит посетитель: части формы по порядку — название шага (пусто вне шагов) и имена его полей.
const _steps = (blocks: readonly FormBlock[]): [string, string[]][] =>
  serializeForm(blocks)
    .split(/(<fieldset class="form-step"[\s\S]*?<\/fieldset>)/)
    .filter((_) => _.trim())
    .map((part) => [
      part.match(/^<fieldset class="form-step" data-step="([^"]*)"/)?.[1] ?? '',
      fieldsOf(part).map((_) => _.name),
    ]);

it('шаг едет со всем, что в нём, до следующего шага; поле и текст — по одному', () => {
  expect(_FORM.map((_, i) => blockSpan(_FORM, i))).toEqual([
    1, 3, 1, 1, 3, 1, 1, 2, 1,
  ]);
});

it('поле встаёт в любой промежуток, шаг — только на границу шагов или в конец', () => {
  expect(blockGaps(_FORM, 3)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(blockGaps(_FORM, 4)).toEqual([1, 4, 7, 9]);
});

it('поле на одно место вниз — то же, что кнопка «Ниже», и через границу шага', () => {
  const swap = (blocks: readonly FormBlock[], index: number) =>
    blocks.map((block, i) =>
      i === index
        ? blocks[index + 1]!
        : i === index + 1
          ? blocks[index]!
          : block
    );
  expect(moveBlock(_FORM, 2, 4)).toEqual(swap(_FORM, 2));
  expect(moveBlock(_FORM, 3, 5)).toEqual(swap(_FORM, 3));
  expect(_steps(moveBlock(_FORM, 3, 5))).toEqual([
    ['', []],
    ['Контакты', ['name']],
    ['Проект', ['phone', 'role', 'budget']],
    ['', ['consent']],
  ]);
});

it('поле переезжает в другой шаг куда угодно, и сервер видит его там', () => {
  const moved = moveBlock(_FORM, 2, 7);
  expect(_labels(moved)).toEqual([
    'T',
    '#Контакты',
    'phone',
    '#Проект',
    'role',
    'budget',
    'name',
    '#',
    'consent',
  ]);
  expect(_steps(moved)).toEqual([
    ['', []],
    ['Контакты', ['phone']],
    ['Проект', ['role', 'budget', 'name']],
    ['', ['consent']],
  ]);
  expect(stepOf(moved, 6)).toBe('Проект');
});

it('шаг переезжает целиком: его поля остаются с ним, чужие шаги не режутся', () => {
  const moved = moveBlock(_FORM, 4, 1);
  expect(_labels(moved)).toEqual([
    'T',
    '#Проект',
    'role',
    'budget',
    '#Контакты',
    'name',
    'phone',
    '#',
    'consent',
  ]);
  expect(_steps(moved)).toEqual([
    ['', []],
    ['Проект', ['role', 'budget']],
    ['Контакты', ['name', 'phone']],
    ['', ['consent']],
  ]);
  // Внутрь чужого шага и перед вступлением шаг не встаёт — порядок прежний.
  expect(moveBlock(_FORM, 4, 3)).toEqual([..._FORM]);
  expect(moveBlock(_FORM, 1, 0)).toEqual([..._FORM]);
});

it('любая допустимая перестановка сохраняет все поля, а шаг едет со своим содержимым', () => {
  const contents = (blocks: readonly FormBlock[]) =>
    Object.fromEntries(
      blocks.flatMap((block, i) =>
        block.kind === 'step'
          ? [[block.id, blocks.slice(i + 1, i + blockSpan(blocks, i))]]
          : []
      )
    );
  for (const [from, block] of _FORM.entries())
    for (const to of blockGaps(_FORM, from)) {
      const moved = moveBlock(_FORM, from, to);
      expect(moved.map((_) => _.id).toSorted((a, b) => a - b)).toEqual(
        _FORM.map((_) => _.id)
      );
      expect(
        fieldsOf(serializeForm(moved))
          .map((_) => _.name)
          .toSorted()
      ).toEqual(['budget', 'consent', 'name', 'phone', 'role']);
      if (block.kind === 'step')
        expect(contents(moved)).toEqual(contents(_FORM));
    }
});

it('stepOf: до шагов и после их конца — null, внутри — название шага', () => {
  expect(_FORM.map((_, i) => stepOf(_FORM, i))).toEqual([
    null,
    'Контакты',
    'Контакты',
    'Контакты',
    'Проект',
    'Проект',
    'Проект',
    null,
    null,
  ]);
});
