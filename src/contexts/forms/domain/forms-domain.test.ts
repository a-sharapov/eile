import { describe, expect, it } from 'bun:test';
import { isDomainError } from '../../../shared/kernel/errors.ts';
import { createForm, editForm, parseFormName } from './form.ts';
import { checkValues, type FieldSpec, isShown } from './schema.ts';
import { resolveSource, type SourceContext, utmOf } from './sources.ts';
import {
  changeSubmission,
  looksLikeSpam,
  markRead,
  type Submission,
  subjectOf,
} from './submission.ts';

const codeOf = (run: () => unknown): string | null => {
  try {
    run();
    return null;
  } catch (error) {
    return isDomainError(error) ? error.code : 'not a domain error';
  }
};

const field = (patch: Partial<FieldSpec>): FieldSpec => ({
  name: 'x',
  kind: 'text',
  label: 'X',
  required: false,
  pattern: null,
  min: null,
  max: null,
  step: null,
  minLength: null,
  maxLength: null,
  multiple: false,
  options: [],
  source: null,
  message: null,
  showIf: null,
  accept: [],
  maxSize: null,
  ...patch,
});

describe('форма', () => {
  it('имя — строчная латиница, цифры и дефисы', () => {
    expect(parseFormName('call-back-2')).toBe('call-back-2' as never);
    expect(codeOf(() => parseFormName('Callback'))).toBe('forms.invalid_name');
    expect(codeOf(() => parseFormName('-x'))).toBe('forms.invalid_name');
  });

  it('пустые настройки — умолчания, заголовок обязателен', () => {
    const { state, events } = createForm(
      parseFormName('callback'),
      { title: ' Обратный звонок ' },
      'now'
    );
    expect(state).toMatchObject({
      title: 'Обратный звонок',
      submitLabel: 'Отправить',
      subject: 'Заявка: {form}',
      retentionDays: 30,
      minSeconds: 3,
      channels: null,
      revision: 1,
    });
    expect(events.map((_) => _.type)).toEqual(['forms.form_saved']);
    expect(codeOf(() => createForm(parseFormName('a'), {}, 'now'))).toBe(
      'forms.invalid_title'
    );
  });

  it('правка без изменений — без событий и новой ревизии', () => {
    const form = createForm(parseFormName('a'), { title: 'A' }, 'now').state;
    expect(editForm({ title: 'A' }, 'later')(form).events).toEqual([]);
    const changed = editForm({ source: '<p>x</p>' }, 'later')(form);
    expect(changed.state).toMatchObject({ revision: 2, updatedAt: 'later' });
  });

  it.each([
    [{ retentionDays: 0 }, 'forms.invalid_retention'],
    [{ minSeconds: 61 }, 'forms.invalid_seconds'],
    [{ successPage: -1 }, 'forms.invalid_page'],
  ])('%p — %p', (input, code) => {
    expect(
      codeOf(() =>
        createForm(parseFormName('a'), { title: 'A', ...input }, 'now')
      )
    ).toBe(code);
  });
});

describe('проверка значений по HTML5', () => {
  const check = (spec: Partial<FieldSpec>, values: string[], language = 'ru') =>
    checkValues([field(spec)], { x: values }, language);

  it.each([
    [{ required: true }, [], 'Заполните это поле'],
    [{ required: true }, ['  '], 'Заполните это поле'],
    [{ kind: 'email' }, ['nope'], 'Нужен адрес почты: name@example.com'],
    [{ kind: 'url' }, ['javascript:alert(1)'], 'Нужен адрес сайта: https://…'],
    [{ kind: 'number' }, ['abc'], 'Нужно число'],
    [
      { kind: 'number', min: '1', max: '10' },
      ['11'],
      'Значение вне допустимых границ',
    ],
    [
      { kind: 'date', min: '2026-01-01' },
      ['2025-12-31'],
      'Значение вне допустимых границ',
    ],
    [
      { pattern: '\\+?[0-9 \\(\\)\\-]{10,}' },
      ['12'],
      'Значение не подходит по формату',
    ],
    [{ maxLength: 3 }, ['abcd'], 'Слишком длинно'],
    [{ minLength: 3 }, ['ab'], 'Слишком коротко'],
    [
      { kind: 'select', options: [{ value: 'a', label: 'A' }] },
      ['b'],
      'Выберите вариант из списка',
    ],
  ])('%p, %p — %p', (spec, values, message) => {
    expect(check(spec as Partial<FieldSpec>, values).errors).toEqual({
      x: message,
    });
  });

  it('свой текст ошибки из data-message, язык сайта', () => {
    expect(
      check({ required: true, message: 'Как вас зовут?' }, []).errors
    ).toEqual({
      x: 'Как вас зовут?',
    });
    expect(check({ required: true }, [], 'en').errors).toEqual({
      x: 'Please fill in this field',
    });
  });

  it('верные значения — с подписями, варианты — подписями, лишнее отброшено', () => {
    const checked = checkValues(
      [
        field({ name: 'name', label: 'Имя', required: true }),
        field({
          name: 'ways',
          kind: 'checkbox',
          label: 'Как связаться',
          multiple: true,
          options: [
            { value: 'phone', label: 'Телефон' },
            { value: 'tg', label: 'Telegram' },
          ],
        }),
        field({
          name: 'ok',
          kind: 'consent',
          label: 'Согласие',
          required: true,
          options: [{ value: 'yes', label: 'Да' }],
        }),
      ],
      { name: ['Иван'], ways: ['phone', 'tg'], ok: ['yes'], evil: ['x'] },
      'ru'
    );
    expect(checked.errors).toEqual({});
    expect(checked.values).toEqual([
      { name: 'name', label: 'Имя', kind: 'text', value: 'Иван' },
      {
        name: 'ways',
        label: 'Как связаться',
        kind: 'checkbox',
        value: 'Телефон, Telegram',
      },
      { name: 'ok', label: 'Согласие', kind: 'consent', value: '✓' },
    ]);
  });

  it('неверный шаблон не мешает, как в браузере; шаблон — с флагом v', () => {
    expect(check({ pattern: '([' }, ['что угодно']).errors).toEqual({});
    // Под флагом v скобки и дефис в классе экранируются, иначе браузер шаблон пропустит.
    expect(check({ pattern: '[0-9 ()-]{10,}' }, ['12']).errors).toEqual({});
  });
});

describe('условные поля и файлы', () => {
  const delivery = field({
    name: 'delivery',
    kind: 'radio',
    options: [
      { value: 'courier', label: 'Курьер' },
      { value: 'pickup', label: 'Самовывоз' },
    ],
  });
  const address = field({
    name: 'address',
    required: true,
    showIf: { field: 'delivery', values: ['courier'] },
  });
  const floor = field({
    name: 'floor',
    required: true,
    showIf: { field: 'address', values: [] },
  });

  it('скрытое условием поле не проверяется и в заявку не идёт, показанное — проверяется', () => {
    const fields = [delivery, address, floor];
    const pickup = checkValues(
      fields,
      { delivery: ['pickup'], address: ['ул. Ленина'], floor: [''] },
      'ru'
    );
    expect(pickup.errors).toEqual({});
    expect(pickup.values.map((_) => _.name)).toEqual(['delivery']);
    const courier = checkValues(fields, { delivery: ['courier'] }, 'ru');
    // Этаж зависит от адреса, а адрес пуст — этаж скрыт, адрес обязателен.
    expect(Object.keys(courier.errors)).toEqual(['address']);
  });

  it('условие на поле-файл: приложили файл — зависимое поле показано и сохраняется', () => {
    const cv = field({ name: 'cv', kind: 'file' });
    const note = field({
      name: 'note',
      required: true,
      showIf: { field: 'cv', values: [] },
    });
    const checked = checkValues([cv, note], { note: ['см. файл'] }, 'ru', {
      cv: [{ name: 'cv.pdf', type: 'application/pdf', size: 10 }],
    });
    expect(checked.values.map((_) => _.name)).toEqual(['cv', 'note']);
    expect(checkValues([cv, note], {}, 'ru').errors).toEqual({});
  });

  it('у поля с multiple проверяется каждое значение', () => {
    const emails = field({ name: 'x', kind: 'email', multiple: true });
    expect(
      checkValues([emails], { x: ['a@b.ru', 'not an email'] }, 'ru').errors
    ).toEqual({ x: 'Нужен адрес почты: name@example.com' });
  });

  it('условие на поле, которого нет в форме, не скрывает', () => {
    expect(
      isShown([address], {}, field({ showIf: { field: 'nope', values: [] } }))
    ).toBe(true);
  });

  it('файл: обязательность, размер, тип по расширению и по типу, один без multiple', () => {
    const plan = field({
      name: 'plan',
      kind: 'file',
      required: true,
      accept: ['.pdf', 'image/*'],
      maxSize: 1000,
    });
    const check = (uploads: { name: string; type: string; size: number }[]) =>
      checkValues([plan], {}, 'ru', { plan: uploads });
    expect(check([]).errors.plan).toBe('Заполните это поле');
    expect(check([{ name: 'a.pdf', type: '', size: 2000 }]).errors.plan).toBe(
      'Файл слишком большой'
    );
    expect(
      check([{ name: 'a.exe', type: 'application/x-msdownload', size: 10 }])
        .errors.plan
    ).toBe('Такой файл здесь не подходит');
    expect(
      check([
        { name: 'A.PDF', type: '', size: 10 },
        { name: 'b.png', type: 'image/png', size: 10 },
      ]).values
    ).toEqual([{ name: 'plan', label: 'X', kind: 'file', value: 'A.PDF' }]);
    expect(
      checkValues([{ ...plan, multiple: true }], {}, 'ru', {
        plan: [
          { name: 'a.pdf', type: '', size: 10 },
          { name: 'b.png', type: 'image/png', size: 10 },
        ],
      }).values[0]!.value
    ).toBe('a.pdf, b.png');
  });
});

describe('спам и тема', () => {
  const value = (text: string, kind: FieldSpec['kind'] = 'textarea') => ({
    name: 'c',
    label: 'C',
    kind,
    value: text,
  });

  it('ссылки и разметка — спам; почта в тексте и поле адреса — нет', () => {
    expect(looksLikeSpam([value('Купите на cheap-pills.xyz')], false)).toBe(
      true
    );
    expect(looksLikeSpam([value('<a href=x>click</a>')], true)).toBe(true);
    expect(looksLikeSpam([value('Пишите на ivan@mail.ru')], false)).toBe(false);
    expect(looksLikeSpam([value('https://mysite.ru', 'url')], false)).toBe(
      false
    );
    expect(looksLikeSpam([value('Портфолио: behance.net/ivan')], true)).toBe(
      false
    );
  });

  it('тема: название формы и значения полей', () => {
    expect(
      subjectOf('Заявка: {form} от {name} {nope}', 'Звонок', [
        { name: 'name', label: 'Имя', kind: 'text', value: 'Иван' },
      ])
    ).toBe('Заявка: Звонок от Иван {nope}');
  });
});

describe('заявка', () => {
  const submission: Submission = {
    id: 1,
    form: 'a',
    formTitle: 'A',
    values: [],
    context: { pageId: null, pageTitle: '', url: '', referrer: '', utm: {} },
    ip: '',
    userAgent: '',
    status: 'new',
    note: '',
    readAt: null,
    readBy: null,
    createdAt: 't0',
    updatedAt: 't0',
  };

  it('прочитана один раз — первым, кто открыл', () => {
    const read = markRead(7, 't1')(submission);
    expect(read.state).toMatchObject({ readAt: 't1', readBy: 7 });
    expect(markRead(8, 't2')(read.state).events).toEqual([]);
  });

  it('статус и заметка; незнакомый статус — отказ', () => {
    expect(
      changeSubmission(
        { status: 'done', note: 'Перезвонили' },
        't1'
      )(submission).state
    ).toMatchObject({ status: 'done', note: 'Перезвонили' });
    expect(
      codeOf(() => changeSubmission({ status: 'lost' }, 't1')(submission))
    ).toBe('forms.invalid_status');
  });
});

describe('источники скрытых полей', () => {
  const context: SourceContext = {
    page: { id: 5, title: 'Кухни', path: '/kuhni' },
    origin: 'https://site.ru',
    query: { utm_source: 'ya', utm_medium: 'cpc', ref: 'friend', other: 'x' },
    referrer: 'https://ya.ru/',
    siteName: 'Сайт',
    field: (name) => (name === 'price' ? '100' : null),
    setting: (key) => (key === 'phone' ? '+7 900' : null),
    now: '2026-10-30T10:00:00Z',
  };

  it.each([
    ['page.title', 'Кухни'],
    ['page.url', 'https://site.ru/kuhni'],
    ['page.id', '5'],
    ['page.field:price', '100'],
    ['page.field:nope', ''],
    ['utm', 'utm_source=ya&utm_medium=cpc'],
    ['query:ref', 'friend'],
    ['referrer', 'https://ya.ru/'],
    ['site.name', 'Сайт'],
    ['setting:phone', '+7 900'],
    ['time', '2026-10-30T10:00:00Z'],
    ['unknown', ''],
  ])('%p → %p', (source, value) => {
    expect(resolveSource(source, context)).toBe(value);
  });

  it('UTM — только пять известных меток', () => {
    expect(utmOf(context.query)).toEqual({
      utm_source: 'ya',
      utm_medium: 'cpc',
    });
  });
});
