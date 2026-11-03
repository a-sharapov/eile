import { describe, expect, it } from 'bun:test';
import { isDomainError } from '../../../shared/kernel/errors.ts';
import {
  admitConfirmation,
  assertConfirmation,
  CONFIRMATION_WINDOW_MS,
  type ConfirmationLog,
  fillTemplate,
  letterOf,
} from './confirmation.ts';
import { type Confirmation, NO_CONFIRMATION } from './form.ts';
import {
  checkValues,
  type FieldSpec,
  parseLabels,
  type Value,
} from './schema.ts';

const field = (name: string, kind: FieldSpec['kind']): FieldSpec => ({
  name,
  kind,
  label: name,
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
});

const value = (name: string, text: string, kind: Value['kind'] = 'text') => ({
  name,
  label: name,
  kind,
  value: text,
});

const _FIELDS = [field('name', 'text'), field('mail', 'email')];

const on = (patch: Partial<Confirmation>) => ({
  title: 'Bestellung',
  confirmation: {
    ...NO_CONFIRMATION,
    enabled: true,
    subject: 'Ihre {form}',
    text: 'Hallo {name}, danke!',
    ...patch,
  },
});

describe('письмо отправителю', () => {
  it('адрес — из первого поля почты; тема и текст — с подстановками', () => {
    expect(
      letterOf(on({}), _FIELDS, [
        value('name', 'Anna'),
        value('mail', ' anna@example.com ', 'email'),
      ])
    ).toEqual({
      to: 'anna@example.com',
      subject: 'Ihre Bestellung',
      text: 'Hallo Anna, danke!',
    });
  });

  it('выключено, адреса нет или он не похож на один адрес — письма нет', () => {
    const values = [value('mail', 'anna@example.com', 'email')];
    expect(letterOf(on({ enabled: false }), _FIELDS, values)).toBeNull();
    expect(letterOf(on({}), _FIELDS, [])).toBeNull();
    expect(
      letterOf(on({}), _FIELDS, [
        value('mail', 'a@example.com, b@example.com', 'email'),
      ])
    ).toBeNull();
    expect(
      letterOf(on({}), _FIELDS, [value('mail', 'a@example.com\r\nBcc: x@y.z')])
    ).toBeNull();
  });

  it('поле адреса из настройки; без поля — ошибка при сохранении', () => {
    const fields = [field('work', 'text'), field('mail', 'email')];
    expect(
      letterOf(on({ field: 'work' }), fields, [value('work', 'b@example.com')])
        ?.to
    ).toBe('b@example.com');
    const codeOf = (run: () => unknown) => {
      try {
        run();
        return null;
      } catch (error) {
        return isDomainError(error) ? error.code : 'other';
      }
    };
    expect(
      codeOf(() =>
        assertConfirmation([field('name', 'text')], on({}).confirmation)
      )
    ).toBe('forms.invalid_confirmation');
    expect(
      codeOf(() =>
        assertConfirmation(fields, on({ field: 'nope' }).confirmation)
      )
    ).toBe('forms.invalid_confirmation');
    expect(
      codeOf(() => assertConfirmation([field('name', 'text')], NO_CONFIRMATION))
    ).toBeNull();
  });

  it('значение посетителя не добавит заголовок и не подменит направление текста', () => {
    const values = [
      value(
        'name',
        `Anna\r\nBcc: spam@example.com${String.fromCodePoint(0x202e)}gnp.exe`
      ),
    ];
    expect(fillTemplate('Hallo {name}', 'F', values, true)).toBe(
      'Hallo Anna Bcc: spam@example.com gnp.exe'
    );
    expect(fillTemplate('Hallo {name}', 'F', values, false)).toBe(
      'Hallo Anna\nBcc: spam@example.com gnp.exe'
    );
    expect(fillTemplate('{form}: {nope}', 'F', values, true)).toBe('F: {nope}');
    const letter = letterOf(on({ subject: 'Re: {name}' }), _FIELDS, [
      ...values,
      value('mail', 'anna@example.com', 'email'),
    ]);
    expect(letter?.subject).not.toContain('\n');
  });

  it('тема по умолчанию — название формы', () => {
    expect(
      letterOf(on({ subject: '' }), _FIELDS, [
        value('mail', 'anna@example.com', 'email'),
      ])?.subject
    ).toBe('Bestellung');
  });

  it('скрытое поле с подписями: в теме и тексте — подпись, значение без подписи — как есть', () => {
    const paket = {
      ...field('paket', 'hidden'),
      labels: 'berater=KI-Küchenberater|planung=KI-Küchenberater + KI-Planung',
      options: parseLabels(
        'berater=KI-Küchenberater|planung=KI-Küchenberater + KI-Planung'
      ),
    };
    const fields = [..._FIELDS, paket];
    const letter = (key: string) =>
      letterOf(
        on({ subject: 'Ihre Bestellung: {paket}', text: 'Paket: {paket}' }),
        fields,
        checkValues(
          fields,
          { name: ['Anna'], mail: ['anna@example.com'], paket: [key] },
          'de'
        ).values
      );
    expect(letter('planung')).toEqual({
      to: 'anna@example.com',
      subject: 'Ihre Bestellung: KI-Küchenberater + KI-Planung',
      text: 'Paket: KI-Küchenberater + KI-Planung',
    });
    expect(letter('sonder')?.text).toBe('Paket: sonder');
  });
});

describe('одно письмо на адрес с формы за 10 минут', () => {
  it('второе за окно — нет, другой адрес или форма — да, после окна — снова да', () => {
    const start = 1_000_000;
    const first = admitConfirmation(
      new Map(),
      'order',
      'Anna@Example.com',
      start
    );
    expect(first.allowed).toBe(true);
    const again = admitConfirmation(
      first.log,
      'order',
      'anna@example.com',
      start + 60_000
    );
    expect(again.allowed).toBe(false);
    expect(
      admitConfirmation(again.log, 'order', 'bob@example.com', start + 1)
        .allowed
    ).toBe(true);
    expect(
      admitConfirmation(again.log, 'callback', 'anna@example.com', start + 1)
        .allowed
    ).toBe(true);
    expect(
      admitConfirmation(
        again.log,
        'order',
        'anna@example.com',
        start + CONFIRMATION_WINDOW_MS
      ).allowed
    ).toBe(true);
  });

  it('отказ не продлевает окно, старые записи забываются', () => {
    const log: ConfirmationLog = new Map([['order|old@example.com', 0]]);
    const decided = admitConfirmation(
      log,
      'order',
      'new@example.com',
      CONFIRMATION_WINDOW_MS + 1
    );
    expect([...decided.log.keys()]).toEqual(['order|new@example.com']);
    const refused = admitConfirmation(
      decided.log,
      'order',
      'new@example.com',
      CONFIRMATION_WINDOW_MS + 2
    );
    expect(refused.log.get('order|new@example.com')).toBe(
      CONFIRMATION_WINDOW_MS + 1
    );
  });
});
