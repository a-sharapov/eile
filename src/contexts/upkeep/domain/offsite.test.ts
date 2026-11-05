import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_OFFSITE,
  EMPTY_OFFSITE,
  latestCopy,
  offsiteSecret,
  outdatedCopies,
  parseOffsite,
  remoteName,
} from './offsite.ts';

const codeOf = (run: () => unknown): string | null => {
  try {
    run();
    return null;
  } catch (error) {
    return (error as { code: string }).code;
  }
};

describe('настройки хранилища', () => {
  it('адрес — origin и путь без косой на конце; префикс — с косой', () => {
    expect(
      parseOffsite({
        endpoint: 'https://fra1.digitaloceanspaces.com/',
        prefix: '/muehlenhof/daily/',
      })
    ).toMatchObject({
      endpoint: 'https://fra1.digitaloceanspaces.com',
      prefix: 'muehlenhof/daily/',
    });
    expect(
      parseOffsite({ endpoint: 'https://abc.supabase.co/storage/v1/s3' })
        .endpoint
    ).toBe('https://abc.supabase.co/storage/v1/s3');
    expect(parseOffsite({ endpoint: '' }).endpoint).toBe('');
  });

  it('незаданное берётся из прежних настроек', () => {
    const base = parseOffsite({ bucket: 'copies', keep: 30 });
    expect(parseOffsite({ region: 'fra1' }, base)).toMatchObject({
      bucket: 'copies',
      keep: 30,
      region: 'fra1',
    });
  });

  it('неверное — своим кодом', () => {
    expect(codeOf(() => parseOffsite({ endpoint: 'ftp://x' }))).toBe(
      'upkeep.invalid_endpoint'
    );
    expect(
      codeOf(() => parseOffsite({ endpoint: 'https://user:pw@host' }))
    ).toBe('upkeep.invalid_endpoint');
    // Метадата облака и http не на этой машине — режутся; своё MinIO в LAN и на петле — нет.
    expect(
      codeOf(() => parseOffsite({ endpoint: 'https://169.254.169.254' }))
    ).toBe('upkeep.invalid_endpoint');
    expect(
      codeOf(() => parseOffsite({ endpoint: 'http://s3.example.com' }))
    ).toBe('upkeep.invalid_endpoint');
    expect(
      codeOf(() => parseOffsite({ endpoint: 'https://192.168.1.9:9000' }))
    ).toBe(null);
    expect(
      codeOf(() => parseOffsite({ endpoint: 'http://localhost:9000' }))
    ).toBe(null);
    expect(codeOf(() => parseOffsite({ prefix: 'a/../b' }))).toBe(
      'upkeep.invalid_prefix'
    );
    expect(codeOf(() => parseOffsite({ bucket: 'a' }))).toBe(
      'upkeep.invalid_bucket'
    );
    expect(codeOf(() => parseOffsite({ region: 'eu central' }))).toBe(
      'upkeep.invalid_region'
    );
    expect(codeOf(() => parseOffsite({ keep: 0 }))).toBe('upkeep.invalid_keep');
    expect(codeOf(() => parseOffsite({ accessKey: 'a b' }))).toBe(
      'upkeep.invalid_access_key'
    );
    expect(codeOf(() => parseOffsite({ enabled: true }))).toBe(
      'upkeep.offsite_incomplete'
    );
  });

  it('прежний секрет — только тому же хранилищу, бакету и ключу доступа', () => {
    const previous = {
      ...EMPTY_OFFSITE,
      settings: parseOffsite({
        endpoint: 'https://a.example',
        bucket: 'copies',
        accessKey: 'AK',
      }),
      secret: 'old',
    };
    expect(offsiteSecret('', previous.settings, previous)).toBe('old');
    expect(offsiteSecret(' new ', previous.settings, previous)).toBe('new');
    for (const change of [
      { endpoint: 'https://b.example' },
      { bucket: 'other' },
      { accessKey: 'AK2' },
    ]) {
      expect(
        offsiteSecret(undefined, { ...previous.settings, ...change }, previous)
      ).toBe('');
    }
  });

  it('по умолчанию выключено, хранить 14', () => {
    expect(DEFAULT_OFFSITE).toMatchObject({ enabled: false, keep: 14 });
  });
});

describe('копии в хранилище', () => {
  it('имя — файл автокопии и .enc', () => {
    expect(remoteName('/var/lib/cms/backups/site-auto-20261103-0330.db')).toBe(
      'site-auto-20261103-0330.db.enc'
    );
  });

  it('лишние — самые старые копии этой базы; чужие имена не трогаются', () => {
    const names = [
      'site-auto-20261103-0330.db.enc',
      'site-auto-20261101-0330.db.enc',
      'site-auto-20261102-0330.db.enc',
      'shop-auto-20261001-0330.db.enc',
      'site-auto-20261001-0330.db',
      'notes.txt',
    ];
    expect(outdatedCopies(names, 'site', 2)).toEqual([
      'site-auto-20261101-0330.db.enc',
    ]);
    expect(outdatedCopies(names, 'site', 5)).toEqual([]);
  });

  it('последняя — по времени записи, при равном — по имени', () => {
    expect(
      latestCopy([
        { name: 'a-auto-1.db.enc', size: 1, at: '2026-11-02T00:00:00Z' },
        { name: 'b-auto-1.db.enc', size: 1, at: '2026-11-03T00:00:00Z' },
        { name: 'b-auto-0.db.enc', size: 1, at: '2026-11-03T00:00:00Z' },
      ])?.name
    ).toBe('b-auto-1.db.enc');
    expect(latestCopy([])).toBeNull();
  });
});
