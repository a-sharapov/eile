import { describe, expect, it } from 'bun:test';
import { attempt, isDomainError } from '../../../shared/kernel/errors.ts';
import { parseReleasesUrl, safeDownload } from './releases-url.ts';

const code = (run: () => unknown): string =>
  attempt(
    () => (run(), 'ok'),
    (error) => (isDomainError(error) ? error.code : String(error))
  );

describe('CMS_RELEASES_URL', () => {
  it('https — как есть, без / на конце; путь зеркала остаётся', () => {
    expect(parseReleasesUrl('https://mirror.example/api/')).toBe(
      'https://mirror.example/api'
    );
    expect(parseReleasesUrl(' https://Mirror.Example ')).toBe(
      'https://mirror.example'
    );
  });

  it('http — только на этой машине или с явным разрешением', () => {
    expect(parseReleasesUrl('http://127.0.0.1:9000')).toBe(
      'http://127.0.0.1:9000'
    );
    expect(parseReleasesUrl('http://localhost:9000/')).toBe(
      'http://localhost:9000'
    );
    expect(parseReleasesUrl('http://[::1]:9000')).toBe('http://[::1]:9000');
    expect(code(() => parseReleasesUrl('http://mirror.lan'))).toBe(
      'upkeep.insecure_releases_url'
    );
    expect(code(() => parseReleasesUrl('http://localhost.evil.example'))).toBe(
      'upkeep.insecure_releases_url'
    );
    expect(parseReleasesUrl('http://mirror.lan', true)).toBe(
      'http://mirror.lan'
    );
  });

  it('не адрес, чужая схема, логин, query и якорь — отказ', () => {
    [
      'mirror.example',
      'ftp://mirror.example',
      'file:///srv/releases',
      'https://user:secret@mirror.example',
      'https://mirror.example/?token=1',
      'https://mirror.example/#x',
      '',
    ].forEach(
      (raw) =>
        void expect(code(() => parseReleasesUrl(raw))).toBe(
          'upkeep.invalid_releases_url'
        )
    );
  });

  it('файлы выпуска — по тем же правилам', () => {
    expect(safeDownload('https://github.com/a/b/releases/download/x')).toBe(
      true
    );
    expect(safeDownload('http://127.0.0.1:9000/cms.gz')).toBe(true);
    expect(safeDownload('http://mirror.lan/cms.gz')).toBe(false);
    expect(safeDownload('http://mirror.lan/cms.gz', true)).toBe(true);
    expect(safeDownload('/relative/cms.gz')).toBe(false);
  });
});
