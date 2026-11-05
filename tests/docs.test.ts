import { describe, expect, it } from 'bun:test';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Склейка веток однажды удвоила строки оглавления ADR и унесла его шапку вниз, а в README задвоила строку
// со ссылкой; Biome Markdown не проверяет.

const _ROOT = resolve(import.meta.dir, '..');

const _lines = (path: string) =>
  Bun.file(resolve(_ROOT, path))
    .text()
    .then((_) => _.split('\n'));

describe('документация', () => {
  it('оглавление ADR: шапка сверху, каждое решение одной строкой, по номерам', async () => {
    const lines = await _lines('docs/README.md');
    const start = lines.indexOf('## ADR') + 2;
    const table = lines.slice(
      start,
      lines.findIndex((_, i) => i >= start && !_.startsWith('|'))
    );
    expect(table[0]).toMatch(/^\| №\s+\| Решение\s+\|$/);
    expect(table[1]).toMatch(/^\| -+ \| -+ \|$/);
    expect(
      table.slice(2).map((_) => /^\| \[\d{4}\]\(adr\/([^)]+)\)/.exec(_)?.[1])
    ).toEqual(
      readdirSync(resolve(_ROOT, 'docs/adr'))
        .filter((_) => /^\d{4}-.+\.md$/.test(_))
        .sort()
    );
  });

  it('в README и оглавлении документации строки не повторяются подряд', async () => {
    const files = await Promise.all(
      ['README.md', 'docs/README.md', 'CONTRIBUTING.md'].map(_lines)
    );
    expect(
      files.flatMap((lines) =>
        lines.filter((_, i) => _.trim() !== '' && _ === lines[i - 1])
      )
    ).toEqual([]);
  });
});
