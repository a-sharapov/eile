import { expect, it } from 'bun:test';
import {
  emptyField,
  type FieldDraft,
  fieldHtml,
  optionsOf,
  patterns,
  serializeForm,
  starterFields,
} from '../manager/src/lib/form-blocks.ts';
import { LANGUAGES, loadLanguage } from '../manager/src/lib/i18n.ts';
import { checkValues } from '../src/contexts/forms/domain/schema.ts';
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
