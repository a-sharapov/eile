import { describe, expect, it } from 'bun:test';
import { isDomainError } from '../../../shared/kernel/errors.ts';
import { createForm, editForm, parseFormName } from './form.ts';
import {
  challengeText,
  PROOF_LIMITS,
  parseProofLevel,
  parseSolution,
} from './proof.ts';
import {
  assertLabels,
  checkValues,
  type FieldSpec,
  formTextsFor,
  isShown,
  messagesFor,
  parseLabels,
  sentValues,
  valueLabels,
} from './schema.ts';
import {
  assertSources,
  resolveSource,
  type SourceContext,
  utmOf,
} from './sources.ts';
import {
  changeSubmission,
  looksLikeSpam,
  markRead,
  noticeOf,
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
  labels: null,
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

  it('тексты по умолчанию — на языке сайта: немецкий, английский, незнакомый — английский', () => {
    const textsOf = (language: string) =>
      createForm(parseFormName('a'), { title: 'A' }, 'now', {
        language,
        secret: '',
      }).state;
    expect(textsOf('de')).toMatchObject({
      submitLabel: 'Absenden',
      subject: 'Anfrage: {form}',
    });
    expect(textsOf('de-AT').successText).toStartWith('Vielen Dank!');
    expect(textsOf('en').submitLabel).toBe('Send');
    expect(textsOf('fr').submitLabel).toBe('Send');
    expect(textsOf('ru').submitLabel).toBe('Отправить');
  });

  it('письмо отправителю: включённое — с текстом; вебхук — https и секрет от сервера', () => {
    const setup = { language: 'de', secret: 'fresh' };
    const form = createForm(
      parseFormName('order'),
      {
        title: 'Bestellung',
        confirmation: { enabled: true, subject: 'Danke', text: 'Hallo {name}' },
        webhook: { url: 'https://crm.example.com/hook' },
      },
      'now',
      setup
    ).state;
    expect(form.confirmation).toEqual({
      enabled: true,
      field: '',
      subject: 'Danke',
      text: 'Hallo {name}',
    });
    expect(form.webhook).toEqual({
      url: 'https://crm.example.com/hook',
      secret: 'fresh',
    });
    // Секрет не меняется от правки адреса и не задаётся снаружи; новый — по просьбе.
    const moved = editForm(
      {
        webhook: { url: 'https://crm.example.com/v2', secret: 'mine' } as never,
      },
      'later',
      { language: 'de', secret: 'other' }
    )(form).state;
    expect(moved.webhook).toEqual({
      url: 'https://crm.example.com/v2',
      secret: 'fresh',
    });
    expect(
      editForm({ webhook: { renew: true } }, 'later', {
        language: 'de',
        secret: 'other',
      })(form).state.webhook.secret
    ).toBe('other');
    expect(
      codeOf(() =>
        createForm(
          parseFormName('a'),
          { title: 'A', confirmation: { enabled: true } },
          'now'
        )
      )
    ).toBe('forms.invalid_confirmation');
    expect(
      codeOf(() =>
        createForm(
          parseFormName('a'),
          { title: 'A', webhook: { url: 'http://crm.example.com/hook' } },
          'now',
          setup
        )
      )
    ).toBe('forms.invalid_webhook');
  });

  it('правка без изменений — без событий и новой ревизии', () => {
    const form = createForm(parseFormName('a'), { title: 'A' }, 'now').state;
    expect(editForm({ title: 'A' }, 'later')(form).events).toEqual([]);
    const changed = editForm({ source: '<p>x</p>' }, 'later')(form);
    expect(changed.state).toMatchObject({ revision: 2, updatedAt: 'later' });
  });

  it('защита от спама: у новой формы — «standard», правка меняет её на любой уровень и не трогает без просьбы', () => {
    const form = createForm(parseFormName('a'), { title: 'A' }, 'now').state;
    expect(form.proof).toBe('standard');
    expect(editForm({ title: 'B' }, 'later')(form).state.proof).toBe(
      'standard'
    );
    expect(editForm({ proof: 'off' }, 'later')(form).state.proof).toBe('off');
    expect(editForm({ proof: 'strong' }, 'later')(form).state.proof).toBe(
      'strong'
    );
    expect(
      createForm(parseFormName('a'), { title: 'A', proof: 'light' }, 'now')
        .state.proof
    ).toBe('light');
    expect(parseProofLevel('off')).toBe('off');
    expect(codeOf(() => parseProofLevel('max'))).toBe('forms.invalid_proof');
  });

  it.each([
    [{ retentionDays: 0 }, 'forms.invalid_retention'],
    [{ minSeconds: 61 }, 'forms.invalid_seconds'],
    [{ successPage: -1 }, 'forms.invalid_page'],
    [{ proof: 'hard' } as never, 'forms.invalid_proof'],
    [{ proof: true } as never, 'forms.invalid_proof'],
    [{ proof: null } as never, 'forms.invalid_proof'],
  ])('%p — %p', (input, code) => {
    expect(
      codeOf(() =>
        createForm(parseFormName('a'), { title: 'A', ...input }, 'now')
      )
    ).toBe(code);
  });
});

describe('задача защиты строкой', () => {
  const task = {
    algorithm: 'SHA-256' as const,
    salt: 'AbCdEfGhIjKlMn_-',
    max: PROOF_LIMITS.standard,
    expires: 1_800_000_000_000,
    hash: 'f'.repeat(64),
    signature: 's'.repeat(43),
  };

  it('в атрибут — через точку, решение — задача и число', () => {
    const text = challengeText(task);
    expect(text).toBe(
      `SHA-256.AbCdEfGhIjKlMn_-.200000.1800000000000.${'f'.repeat(64)}.${'s'.repeat(43)}`
    );
    expect(parseSolution(`${text}.4711`)).toEqual({ ...task, number: 4711 });
  });

  it.each([
    ['', 'пусто'],
    ['SHA-256.x.1.2.3.4.5', 'короткие части'],
    [
      `SHA-1.AbCdEfGhIjKlMn_-.200000.1800000000000.${'f'.repeat(64)}.${'s'.repeat(43)}.1`,
      'чужой алгоритм',
    ],
    [
      `SHA-256.AbCdEfGhIjKlMn_-.200000.1800000000000.${'f'.repeat(64)}.${'s'.repeat(43)}`,
      'без числа',
    ],
    [
      `SHA-256.AbCdEfGhIjKlMn_-.200000.1800000000000.${'F'.repeat(64)}.${'s'.repeat(43)}.1`,
      'хэш не в нижнем регистре',
    ],
    [
      `SHA-256.AbCdEfGhIjKlMn_-.200000.1800000000000.${'f'.repeat(64)}.${'s'.repeat(43)}.-1`,
      'отрицательное число',
    ],
    [
      `SHA-256.AbCdEfGhIjKlMn_-.200000.1800000000000.${'f'.repeat(64)}.${'s'.repeat(43)}.12345678`,
      'число длиннее семи цифр',
    ],
  ])('не того вида — null: %p (%s)', (raw) => {
    expect(parseSolution(raw)).toBeNull();
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

  it('немецкий сайт — ошибки и подписи шагов по-немецки, незнакомый язык — по-английски', () => {
    expect(check({ required: true }, [], 'de').errors).toEqual({
      x: 'Bitte füllen Sie dieses Feld aus',
    });
    expect(check({ kind: 'email' }, ['nope'], 'de-CH').errors).toEqual({
      x: 'Bitte geben Sie eine E-Mail-Adresse ein: name@example.com',
    });
    expect(messagesFor('de').invalid).toBe(
      'Bitte überprüfen Sie Ihre Angaben im Formular'
    );
    expect(formTextsFor('de')).toMatchObject({
      next: 'Weiter',
      back: 'Zurück',
      progress: 'Schritt {n} von {m}',
    });
    expect(messagesFor('fr').required).toBe('Please fill in this field');
    expect(formTextsFor('fr').next).toBe('Next');
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
    cookie: (name) =>
      (
        ({
          partner: 'P-42',
          cms_session: 'secret-session',
          '__Host-cms_session': 'secret-session',
          cms_form: 'flash',
        }) as Record<string, string>
      )[name] ?? null,
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
    ['cookie:partner', 'P-42'],
    ['cookie:nope', ''],
    ['cookie:cms_session', ''],
    ['cookie:CMS_Session', ''],
    ['cookie:__Host-cms_session', ''],
    ['cookie:cms_form', ''],
    ['unknown', ''],
  ])('%p → %p', (source, value) => {
    expect(resolveSource(source, context)).toBe(value);
  });

  it('cookie самой CMS и не имя cookie в поле не сохранить; пустое имя — ещё не выбрано', () => {
    const sources = (...list: string[]) =>
      codeOf(() => assertSources(list.map((source) => field({ source }))));
    expect(sources('cookie:partner', 'page.title', 'cookie:')).toBeNull();
    expect(sources('cookie:cms_session')).toBe('forms.reserved_cookie');
    expect(sources('page.id', 'cookie:__Secure-token')).toBe(
      'forms.reserved_cookie'
    );
    expect(sources('cookie:a b')).toBe('forms.invalid_cookie');
  });

  it('UTM — только пять известных меток', () => {
    expect(utmOf(context.query)).toEqual({
      utm_source: 'ya',
      utm_medium: 'cpc',
    });
  });
});

describe('подписи значений скрытого поля', () => {
  const _PAKET =
    'berater=KI-Küchenberater|planung=KI-Küchenberater + KI-Planung';
  const paket = field({
    name: 'paket',
    kind: 'hidden',
    label: 'Paket',
    source: 'query:paket',
    labels: _PAKET,
    options: parseLabels(_PAKET),
  });

  it('data-labels: значение=подпись через |; пробелы и пустые записи не в счёт, «=» в подписи остаётся', () => {
    expect(parseLabels(_PAKET)).toEqual([
      { value: 'berater', label: 'KI-Küchenberater' },
      { value: 'planung', label: 'KI-Küchenberater + KI-Planung' },
    ]);
    expect(parseLabels(' a = A |  | b=x=y |')).toEqual([
      { value: 'a', label: 'A' },
      { value: 'b', label: 'x=y' },
    ]);
    expect(parseLabels('')).toEqual([]);
  });

  it('неверные записи разбор пропускает, у повтора — первая подпись: форма из копии сайта не падает', () => {
    expect(parseLabels('nolabel|=Leer|leer=|a=A|a=B')).toEqual([
      { value: 'a', label: 'A' },
    ]);
  });

  it('как у списка: в заявке подпись, ключ — в raw; значение без подписи — как есть', () => {
    expect(checkValues([paket], { paket: ['planung'] }, 'de').values).toEqual([
      {
        name: 'paket',
        label: 'Paket',
        kind: 'hidden',
        value: 'KI-Küchenberater + KI-Planung',
        raw: 'planung',
      },
    ]);
    const other = checkValues([paket], { paket: ['test'] }, 'de');
    expect(other.values).toEqual([
      {
        name: 'paket',
        label: 'Paket',
        kind: 'hidden',
        value: 'test',
        raw: 'test',
      },
    ]);
    // Подпись — не правило: чужое значение не ошибка, как у скрытого поля без подписей.
    expect(other.errors).toEqual({});
    // Скрытое поле без подписей и список — как раньше, без raw.
    expect(
      checkValues(
        [
          field({ name: 'ref', kind: 'hidden', source: 'query:ref' }),
          field({
            name: 'topic',
            kind: 'select',
            options: [{ value: 'a', label: 'A' }],
          }),
        ],
        { ref: ['friend'], topic: ['a'] },
        'de'
      ).values
    ).toEqual([
      { name: 'ref', label: 'X', kind: 'hidden', value: 'friend' },
      { name: 'topic', label: 'X', kind: 'select', value: 'A' },
    ]);
  });

  it('условие data-show-if сравнивает ключ, а не подпись', () => {
    const extra = field({
      name: 'extra',
      showIf: { field: 'paket', values: ['planung'] },
    });
    expect(isShown([paket, extra], { paket: ['planung'] }, extra)).toBe(true);
    expect(isShown([paket, extra], { paket: ['berater'] }, extra)).toBe(false);
  });

  it('для вебхука и плагинов: значения — ключи, подписи — отдельно', () => {
    const { values } = checkValues(
      [paket, field({ name: 'firma', label: 'Firma' })],
      { paket: ['planung'], firma: ['Küchen Müller'] },
      'de'
    );
    expect(sentValues(values)).toEqual({
      paket: 'planung',
      firma: 'Küchen Müller',
    });
    expect(valueLabels(values)).toEqual({
      paket: 'KI-Küchenberater + KI-Planung',
    });
  });

  it('тема и текст уведомления — с подписью; скрытое поле без подписей в тексте не показано', () => {
    const { values } = checkValues(
      [
        paket,
        field({ name: 'firma', label: 'Firma' }),
        field({ name: 'seite', kind: 'hidden', source: 'page.url' }),
      ],
      {
        paket: ['planung'],
        firma: ['Küchen Müller'],
        seite: ['https://muehlenhof.example/'],
      },
      'de'
    );
    expect(
      subjectOf('Bestellung: {paket}, {firma}', 'Bestellung', values)
    ).toBe('Bestellung: KI-Küchenberater + KI-Planung, Küchen Müller');
    const notice = noticeOf(
      { subject: 'Bestellung: {paket}' },
      {
        id: 1,
        form: 'bestellung',
        formTitle: 'Bestellung',
        values,
        context: {
          pageId: null,
          pageTitle: '',
          url: '',
          referrer: '',
          utm: {},
        },
        ip: '',
        userAgent: '',
        status: 'new',
        createdAt: '2026-11-03T10:00:00Z',
      },
      '',
      'de'
    );
    expect(notice.title).toBe('Bestellung: KI-Küchenberater + KI-Planung');
    expect(notice.fields).toEqual([
      { label: 'Paket', value: 'KI-Küchenberater + KI-Planung' },
      { label: 'Firma', value: 'Küchen Müller' },
    ]);
  });

  it('при сохранении: data-labels не у скрытого поля, запись не значение=подпись, повтор — понятная ошибка', () => {
    const labelsOf = (
      labels: string | null,
      kind: FieldSpec['kind'] = 'hidden'
    ) => codeOf(() => assertLabels([field({ name: 'paket', kind, labels })]));
    expect(labelsOf(_PAKET)).toBeNull();
    expect(labelsOf(null)).toBeNull();
    expect(labelsOf(null, 'select')).toBeNull();
    expect(labelsOf('a=A|')).toBeNull();
    expect(labelsOf('a=A', 'select')).toBe('forms.labels_not_hidden');
    expect(labelsOf('a=A', 'text')).toBe('forms.labels_not_hidden');
    expect(labelsOf('berater|planung=Planung')).toBe('forms.invalid_labels');
    expect(labelsOf('=Leer')).toBe('forms.invalid_labels');
    expect(labelsOf('leer=')).toBe('forms.invalid_labels');
    expect(labelsOf('a=A|a=B')).toBe('forms.invalid_labels');
    // Текст — для агента и журнала: какое поле и какая запись.
    const broken = (labels: string) => () =>
      assertLabels([field({ name: 'paket', kind: 'hidden', labels })]);
    expect(broken('a=A|berater')).toThrow(
      'data-labels of field "paket": "berater" is not value=label'
    );
    expect(broken('a=A|a=B')).toThrow('value "a" has two labels');
  });
});
