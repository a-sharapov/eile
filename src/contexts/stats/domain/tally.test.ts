import { describe, expect, it } from 'bun:test';
import { goalTally, type Visitor, viewTally } from './tally.ts';
import type { Visit } from './visit.ts';

const _VISIT: Visit = {
  entry: '/kuechenplaner',
  source: 'newsletter',
  referrer: 'mail.example.com',
  utmSource: 'newsletter',
  utmMedium: '',
  utmCampaign: 'herbst',
  device: 'mobile',
  browserLanguage: 'de',
};

describe('прибавки просмотра', () => {
  it('первый за день — посетитель во всех разрезах посещения; страница и язык — только просмотр', () => {
    const tally = viewTally(_VISIT, true, { path: '/preise', language: 'de' });
    expect(tally).toContainEqual({
      dimension: 'total',
      value: '',
      visitors: 1,
      views: 1,
    });
    expect(tally).toContainEqual({
      dimension: 'page',
      value: '/preise',
      visitors: 0,
      views: 1,
    });
    expect(tally).toContainEqual({
      dimension: 'entry',
      value: '/kuechenplaner',
      visitors: 1,
      views: 1,
    });
    expect(tally).toContainEqual({
      dimension: 'language',
      value: 'de',
      visitors: 0,
      views: 1,
    });
    // Пустой utm_medium строки не заводит.
    expect(tally.some((_) => _.dimension === 'utm_medium')).toBe(false);
  });

  it('повторный просмотр — без посетителя; прямой заход — пустой источник', () => {
    const tally = viewTally({ ..._VISIT, source: '', referrer: '' }, false, {
      path: '/',
      language: '',
    });
    expect(tally.every((_) => _.visitors === 0)).toBe(true);
    expect(tally).toContainEqual({
      dimension: 'source',
      value: '',
      visitors: 0,
      views: 1,
    });
    expect(tally.some((_) => _.dimension === 'referrer')).toBe(false);
    expect(tally.some((_) => _.dimension === 'language')).toBe(false);
  });
});

describe('цели', () => {
  const visitor: Visitor = { ..._VISIT, goals: {} };

  it('цель — источнику и странице входа дня; второй раз — событие без посетителя', () => {
    const first = goalTally(visitor, 'form:bestellung')!;
    expect(first.increments).toEqual([
      {
        goal: 'form:bestellung',
        dimension: 'total',
        value: '',
        visitors: 1,
        events: 1,
      },
      {
        goal: 'form:bestellung',
        dimension: 'source',
        value: 'newsletter',
        visitors: 1,
        events: 1,
      },
      {
        goal: 'form:bestellung',
        dimension: 'entry',
        value: '/kuechenplaner',
        visitors: 1,
        events: 1,
      },
    ]);
    const second = goalTally(first.visitor, 'form:bestellung')!;
    expect(second.increments.every((_) => _.visitors === 0)).toBe(true);
    expect(second.visitor.goals['form:bestellung']).toBe(2);
    // Другая цель того же посетителя — снова «впервые».
    expect(
      goalTally(second.visitor, 'link:https://app.example.com/new')!
        .increments[0]!.visitors
    ).toBe(1);
  });

  it('повторы одной цели за день — не больше двадцати', () => {
    const tired = { ...visitor, goals: { 'form:bestellung': 20 } };
    expect(goalTally(tired, 'form:bestellung')).toBeNull();
  });
});
