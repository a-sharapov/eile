import { describe, expect, it } from 'bun:test';
import type { CachedPage } from '../application/ports.ts';
import { defineMemoryPageCache } from './memory-page-cache.ts';

// Страница весом 2 × 100 символов = 200 байт.
const page = (tag: string): CachedPage => ({
  content: { html: 'x'.repeat(100) },
  contentType: 'text/html',
  pageId: 1,
  tags: new Set([tag]),
});

describe('кэш страниц в памяти', () => {
  it('держит бюджет в байтах и вытесняет давно не читанные', () => {
    const cache = defineMemoryPageCache(() => 600);
    ['/a', '/b', '/c'].forEach((_) => void cache.set(_, page('t')));
    cache.get('/a');
    cache.set('/d', page('t'));
    expect(
      ['/a', '/b', '/c', '/d'].map((_) => cache.get(_) !== undefined)
    ).toEqual([true, false, true, true]);
  });

  it('бюджет читается на каждой записи: уменьшили — лишнее уходит со следующей', () => {
    let budget = 600;
    const cache = defineMemoryPageCache(() => budget);
    ['/a', '/b', '/c'].forEach((_) => void cache.set(_, page('t')));
    budget = 400;
    cache.set('/d', page('t'));
    expect(cache.size()).toEqual({ pages: 2, bytes: 400, budget: 400 });
  });

  it('перезапись и сброс по тегу освобождают место', () => {
    const cache = defineMemoryPageCache(() => 400);
    cache.set('/a', page('one'));
    cache.set('/a', page('one'));
    cache.set('/b', page('two'));
    expect(cache.get('/a')).toBeDefined();
    cache.invalidate(['one']);
    cache.set('/c', page('two'));
    expect(
      [cache.get('/a'), cache.get('/b'), cache.get('/c')].map(Boolean)
    ).toEqual([false, true, true]);
  });
});
