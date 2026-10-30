import { describe, expect, it } from 'bun:test';
import { createField, type FieldType, parseFieldValue } from './field.ts';

const field = (type: FieldType, options: string[] = []) =>
  createField({
    name: 'value',
    type,
    options,
    templates: ['Base'],
  }).state;

describe('createField', () => {
  it('подпись по умолчанию — имя, шаблоны без повторов', () => {
    const { state, events } = createField({
      name: 'subtitle',
      type: 'text',
      templates: ['Base', 'Base', 'Blog'],
    });
    expect(state).toMatchObject({
      label: 'subtitle',
      inherit: false,
      defaultValue: null,
      templates: ['Base', 'Blog'],
    });
    expect(events).toEqual([
      { type: 'content.field_saved', field: state.name },
    ]);
  });

  it.each([
    [{ name: 'Price', type: 'number' }, 'camelCase'],
    [{ name: 'price', type: 'money' }, 'Unknown field type'],
    [{ name: 'color', type: 'select' }, 'needs options'],
    [
      { name: 'price', type: 'number', defaultValue: 'free' },
      'not a valid number',
    ],
  ])('%p отклоняется', (input, message) => {
    expect(() => createField(input)).toThrow(message);
  });
});

describe('parseFieldValue', () => {
  it.each([
    ['text', 'Привет'],
    ['richtext', '<p>x</p>'],
    ['number', 12.5],
    ['boolean', false],
    ['date', '2026-10-29'],
    ['image', 'banners/summer.jpg'],
  ] as const)('%p принимает %p', (type, value) => {
    expect(parseFieldValue(field(type))(value)).toBe(value);
  });

  it.each([
    ['text', 5],
    ['number', '5'],
    ['number', Number.NaN],
    ['boolean', 'yes'],
    ['date', '2026-02-30'],
    ['date', '29.10.2026'],
    ['image', '/media/summer.jpg'],
    ['image', 'summer photo.jpg'],
  ] as const)('%p отклоняет %p', (type, value) => {
    expect(() => parseFieldValue(field(type))(value)).toThrow('not a valid');
  });

  it('select принимает только свои варианты', () => {
    const color = field('select', ['red', 'green']);
    expect(parseFieldValue(color)('red')).toBe('red');
    expect(() => parseFieldValue(color)('blue')).toThrow('not a valid select');
  });
});
