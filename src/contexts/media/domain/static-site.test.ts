import { describe, expect, it } from 'bun:test';
import {
  compressible,
  hiddenPart,
  immutable,
  indexOf,
  staticType,
} from './static-site.ts';

describe('папка-сайт', () => {
  it('типы — по расширению; чужое не отдаётся', () => {
    expect(staticType('index.html')).toBe('text/html; charset=utf-8');
    expect(staticType('_astro/index.BJPmg_gH.js')).toBe(
      'text/javascript; charset=utf-8'
    );
    expect(staticType('css/base.CSS')).toBe('text/css; charset=utf-8');
    expect(staticType('site.webmanifest')).toBe('application/manifest+json');
    expect(staticType('hdr/workshop_1k.hdr')).toBe('image/vnd.radiance');
    expect(staticType('fonts/a.woff2')).toBe('font/woff2');
    expect(staticType('index.php')).toBeNull();
    expect(staticType('.env')).toBeNull();
    expect(staticType('README')).toBeNull();
    expect(staticType('dir.html/README')).toBeNull();
  });

  it('сжимается текст, картинки и шрифты — нет', () => {
    expect(compressible('text/html; charset=utf-8')).toBe(true);
    expect(compressible('application/json')).toBe(true);
    expect(compressible('image/svg+xml')).toBe(true);
    expect(compressible('image/png')).toBe(false);
    expect(compressible('font/woff2')).toBe(false);
  });

  it('файлы сборки с хэшем — навсегда в кэше браузера', () => {
    expect(immutable('_astro/index.BJPmg_gH.js')).toBe(true);
    expect(immutable('_app/immutable/chunks/a.js')).toBe(true);
    expect(immutable('index.html')).toBe(false);
    expect(immutable('images/_astro.png')).toBe(false);
  });

  it('скрытое и следы архиваторов — не файлы сайта', () => {
    expect(hiddenPart('.env')).toBe(true);
    expect(hiddenPart('a/.git/config')).toBe(true);
    expect(hiddenPart('__MACOSX/a.png')).toBe(true);
    expect(hiddenPart('images/_assets.png')).toBe(false);
    expect(hiddenPart('a.b/c.html')).toBe(false);
  });

  it('адрес папки — её index.html', () => {
    expect(indexOf('')).toBe('index.html');
    expect(indexOf('about/')).toBe('about/index.html');
    expect(indexOf('about')).toBe('about');
  });
});
