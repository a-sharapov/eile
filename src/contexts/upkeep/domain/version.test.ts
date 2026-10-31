import { describe, expect, it } from 'bun:test';
import {
  compareVersions,
  isPrerelease,
  newerRelease,
  parseVersion,
  type Release,
} from './version.ts';

const release = (version: string, draft = false): Release => ({
  version,
  url: `https://example.test/v${version}`,
  draft,
  assets: [],
});

describe('версии по semver', () => {
  it('разбор: v в начале, метка пре-релиза, сборка', () => {
    expect(parseVersion('v1.2.3')).toEqual({ core: [1, 2, 3], pre: [] });
    expect(parseVersion('0.1.0-alpha.1+build.5')).toEqual({
      core: [0, 1, 0],
      pre: ['alpha', '1'],
    });
    expect(parseVersion('1.2')).toBeNull();
    expect(parseVersion('01.2.3')).toBeNull();
    expect(isPrerelease('0.1.0-alpha.1')).toBe(true);
    expect(isPrerelease('0.1.0')).toBe(false);
  });

  it('порядок из спецификации semver', () => {
    const ordered = [
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0',
      '1.0.1',
      '1.1.0',
      '2.0.0',
    ];
    ordered.slice(1).forEach((version, index) => {
      expect(compareVersions(ordered[index]!, version)).toBe(-1);
      expect(compareVersions(version, ordered[index]!)).toBe(1);
    });
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1);
  });

  it('альфа видит следующие альфы и стабильные, стабильная — только стабильные', () => {
    const list = [
      release('0.2.0-alpha.1'),
      release('0.1.0'),
      release('0.1.0-alpha.2'),
      release('0.3.0', true),
      release('nightly'),
    ];
    expect(newerRelease('0.1.0-alpha.1', list)?.version).toBe('0.2.0-alpha.1');
    expect(newerRelease('0.1.0', list)).toBeNull();
    expect(newerRelease('0.0.9', list)?.version).toBe('0.1.0');
    expect(newerRelease('0.2.0-alpha.1', list)).toBeNull();
  });
});
