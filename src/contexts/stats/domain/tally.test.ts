import { describe, expect, it } from 'bun:test';
import { goGoal } from './settings.ts';
import { goalsTally, goalTally, type Visitor, viewTally } from './tally.ts';
import { originOf, type Visit } from './visit.ts';

const _VISIT: Visit = {
  entry: '/kuechenplaner',
  source: 'newsletter',
  referrer: 'mail.example.com',
  utmSource: 'newsletter',
  utmMedium: '',
  utmCampaign: 'herbst',
  utmContent: 'banner-oben',
  utmTerm: '',
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

  it('utm_content и utm_term — свои разрезы посещения; пустой utm_term строки не заводит', () => {
    const tally = viewTally(_VISIT, true, { path: '/', language: '' });
    expect(tally).toContainEqual({
      dimension: 'utm_content',
      value: 'banner-oben',
      visitors: 1,
      views: 1,
    });
    expect(tally.some((_) => _.dimension === 'utm_term')).toBe(false);
    const term = viewTally({ ..._VISIT, utmTerm: 'küche eiche' }, false, {
      path: '/',
      language: '',
    });
    expect(term).toContainEqual({
      dimension: 'utm_term',
      value: 'küche eiche',
      visitors: 0,
      views: 1,
    });
  });

  it('origin — исходные UTM и хост реферера одной строкой, у прямого захода тоже', () => {
    const tally = viewTally(_VISIT, true, { path: '/', language: '' });
    expect(tally.filter((_) => _.dimension === 'origin')).toEqual([
      {
        dimension: 'origin',
        value: '["newsletter","","herbst","banner-oben","","mail.example.com"]',
        visitors: 1,
        views: 1,
      },
    ]);
    const direct: Visit = {
      ..._VISIT,
      source: '',
      referrer: '',
      utmSource: '',
      utmCampaign: '',
      utmContent: '',
    };
    expect(
      viewTally(direct, false, { path: '/', language: '' }).find(
        (_) => _.dimension === 'origin'
      )
    ).toEqual({
      dimension: 'origin',
      value: '["","","","","",""]',
      visitors: 0,
      views: 1,
    });
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

  it('цель — источнику, странице входа и origin дня; второй раз — событие без посетителя', () => {
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
      {
        goal: 'form:bestellung',
        dimension: 'origin',
        value: originOf(_VISIT),
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

  it('переход: go:<код> и go: — две цели со своими счётчиками; две кнопки — в go: один посетитель', () => {
    const trial = goalTally(visitor, goGoal('trial'))!;
    const any = goalTally(trial.visitor, goGoal(''))!;
    expect(any.visitor.goals).toEqual({ 'go:trial': 1, 'go:': 1 });
    expect(trial.increments.map((_) => _.goal)).toEqual([
      'go:trial',
      'go:trial',
      'go:trial',
      'go:trial',
    ]);
    const shop = goalTally(any.visitor, goGoal('shop'))!;
    const again = goalTally(shop.visitor, goGoal(''))!;
    expect(shop.increments[0]!.visitors).toBe(1);
    expect(again.increments.every((_) => _.visitors === 0)).toBe(true);
    expect(again.visitor.goals['go:']).toBe(2);
    expect(
      goalTally({ ...visitor, goals: { 'go:': 20 } }, goGoal(''))
    ).toBeNull();
  });

  it('несколько целей разом: прибавки всех; исчерпавшая повторы — без прибавок, остальные считаются', () => {
    const both = goalsTally(visitor, ['go:trial', 'go:']);
    expect(both.visitor.goals).toEqual({ 'go:trial': 1, 'go:': 1 });
    expect(both.increments).toHaveLength(8);
    const tired = goalsTally({ ...visitor, goals: { 'go:': 20 } }, [
      'go:trial',
      'go:',
    ]);
    expect(tired.visitor.goals).toEqual({ 'go:trial': 1, 'go:': 20 });
    expect(new Set(tired.increments.map((_) => _.goal))).toEqual(
      new Set(['go:trial'])
    );
    expect(goalsTally(visitor, [])).toEqual({ visitor, increments: [] });
  });
});
