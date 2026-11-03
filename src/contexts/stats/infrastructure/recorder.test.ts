import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_STATS_SETTINGS,
  type StatsSettings,
} from '../domain/settings.ts';
import type { GoalIncrement, Increment, Visitor } from '../domain/tally.ts';
import type { Visit } from '../domain/visit.ts';
import { defineRecorder } from './recorder.ts';
import type { StatsStore } from './sqlite-stats.ts';

const _VISIT: Visit = {
  entry: '/',
  source: '',
  referrer: '',
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
  device: 'desktop',
  browserLanguage: 'de',
};

const _ON: StatsSettings = {
  ...DEFAULT_STATS_SETTINGS,
  enabled: true,
  timeZone: 'UTC',
};

// Хранилище в памяти: что записано и сколько раз забывали посетителей.
const memoryStore = () => {
  const visitors = new Map<string, Visitor>();
  const writes: {
    day: string;
    traffic: readonly Increment[];
    goals: readonly GoalIncrement[];
  }[] = [];
  let forgotten = 0;
  const store: StatsStore = {
    visitor: (day, id) => visitors.get(`${day} ${id}`) ?? null,
    write: (day, traffic, goals, rows) => (
      writes.push({ day, traffic, goals }),
      rows.forEach(
        ({ 0: id, 1: visitor }) => void visitors.set(`${day} ${id}`, visitor)
      )
    ),
    forgetVisitors: () => (visitors.clear(), void (forgotten += 1)),
    purgeBefore: () => undefined,
  };
  return { store, visitors, writes, forgotten: () => forgotten };
};

const setup = (start = '2026-11-03T10:00:00Z') => {
  let now = new Date(start);
  const memory = memoryStore();
  let salts = 0;
  const later: (() => void)[] = [];
  const recorder = defineRecorder({
    store: memory.store,
    clock: () => now,
    random: () => new Uint8Array(32).fill(++salts),
    soon: (run) => void later.push(run),
  });
  recorder.configure(_ON);
  return {
    recorder,
    memory,
    later,
    at: (iso: string) => void (now = new Date(iso)),
    salts: () => salts,
  };
};

const total = (writes: ReturnType<typeof memoryStore>['writes']) =>
  writes
    .flatMap((_) => _.traffic)
    .filter((_) => _.dimension === 'total')
    .reduce(
      (sum, _) => ({
        visitors: sum.visitors + _.visitors,
        views: sum.views + _.views,
      }),
      { visitors: 0, views: 0 }
    );

const page = { path: '/', language: 'de' };

describe('счётчик процесса', () => {
  it('тот же адрес и браузер — один посетитель; другой браузер — другой', () => {
    const { recorder, memory } = setup();
    recorder.view('203.0.113.7', 'Firefox', () => _VISIT, page);
    recorder.view('203.0.113.7', 'Firefox', () => _VISIT, page);
    recorder.view('203.0.113.7', 'Chrome', () => _VISIT, page);
    recorder.flush();
    expect(total(memory.writes)).toEqual({ visitors: 2, views: 3 });
    expect(memory.writes).toHaveLength(1);
  });

  it('временные адреса IPv6 одной сети /64 — один посетитель', () => {
    const { recorder, memory } = setup();
    recorder.view('2001:db8:1:2::a', 'Safari', () => _VISIT, page);
    recorder.view('2001:db8:1:2::b', 'Safari', () => _VISIT, page);
    recorder.flush();
    expect(total(memory.writes).visitors).toBe(1);
  });

  it('в базе — только короткий хэш и посещение, ни адреса, ни User-Agent', () => {
    const { recorder, memory } = setup();
    recorder.view('203.0.113.7', 'Firefox/132', () => _VISIT, page);
    recorder.flush();
    const { 0: key, 1: stored } = [...memory.visitors][0]!;
    const id = key.split(' ')[1]!;
    expect(id).toMatch(/^[\w-]{12}$/);
    expect(JSON.stringify(stored)).not.toContain('203.0.113.7');
    expect(JSON.stringify(stored)).not.toContain('Firefox');
  });

  it('полночь пояса: новая соль, вчерашние посетители забыты, тот же человек — снова новый', () => {
    const { recorder, memory, at, salts } = setup('2026-11-03T22:00:00Z');
    recorder.view('203.0.113.7', 'Firefox', () => _VISIT, page);
    expect(salts()).toBe(1);
    at('2026-11-04T00:05:00Z');
    recorder.view('203.0.113.7', 'Firefox', () => _VISIT, page);
    recorder.flush();
    expect(salts()).toBe(2);
    expect(memory.writes.map((_) => _.day)).toEqual([
      '2026-11-03',
      '2026-11-04',
    ]);
    expect(total(memory.writes).visitors).toBe(2);
    // При первом просмотре процесса и в полночь: посетители прежней соли ничего не значат.
    expect(memory.forgotten()).toBe(2);
  });

  it('таймер меняет сутки и без посетителей', () => {
    const { recorder, at, salts, memory } = setup();
    recorder.view('203.0.113.7', 'Firefox', () => _VISIT, page);
    at('2026-11-05T09:00:00Z');
    recorder.tick();
    expect(salts()).toBe(2);
    expect(memory.visitors.size).toBe(0);
  });

  it('цель — только посетителю, который сегодня смотрел страницы', () => {
    const { recorder, memory } = setup();
    expect(recorder.goal('203.0.113.7', 'Firefox', 'form:a')).toBe(false);
    recorder.view('203.0.113.7', 'Firefox', () => _VISIT, page);
    recorder.flush();
    // Посетитель уже в базе, а не в буфере: его находят и там.
    expect(recorder.goal('203.0.113.7', 'Firefox', 'form:a')).toBe(true);
    recorder.flush();
    expect(memory.writes.at(-1)!.goals).toContainEqual({
      goal: 'form:a',
      dimension: 'total',
      value: '',
      visitors: 1,
      events: 1,
    });
  });

  it('полный буфер уходит в базу вскоре, не дожидаясь таймера', () => {
    const { recorder, memory, later } = setup();
    Array.from({ length: 3000 }, (_, n) =>
      recorder.view('203.0.113.7', `Agent ${n}`, () => _VISIT, {
        path: `/p/${n}`,
        language: 'de',
      })
    );
    expect(later).toHaveLength(1);
    later[0]!();
    expect(memory.writes).toHaveLength(1);
    expect(total(memory.writes).visitors).toBe(3000);
  });

  it('счёт выключили — посетители дня забыты сразу', () => {
    const { recorder, memory } = setup();
    recorder.view('203.0.113.7', 'Firefox', () => _VISIT, page);
    recorder.flush();
    expect(memory.visitors.size).toBe(1);
    recorder.configure({ ..._ON, enabled: false });
    expect(memory.visitors.size).toBe(0);
  });
});
