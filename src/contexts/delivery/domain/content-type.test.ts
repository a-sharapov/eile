import { describe, expect, it } from 'bun:test';
import { isHtml, isMarkup, responseType } from './content-type.ts';

describe('тип содержимого страницы', () => {
  it('только text/html рендерится шаблоном', () => {
    expect(isHtml('text/html')).toBe(true);
    expect(isHtml('application/xhtml+xml')).toBe(false);
    expect(isHtml('text/plain')).toBe(false);
  });

  it('в разметке подстановки экранируются, в CSS и тексте — нет', () => {
    expect(
      ['text/html', 'text/xml', 'application/rss+xml', 'image/svg+xml'].every(
        isMarkup
      )
    ).toBe(true);
    expect(['text/css', 'text/plain', 'application/json'].some(isMarkup)).toBe(
      false
    );
  });

  it('у текстовых типов в заголовке — UTF-8', () => {
    expect(responseType('text/css')).toBe('text/css; charset=utf-8');
    expect(responseType('application/rss+xml')).toBe(
      'application/rss+xml; charset=utf-8'
    );
    expect(responseType('application/manifest+json')).toBe(
      'application/manifest+json; charset=utf-8'
    );
    expect(responseType('application/pdf')).toBe('application/pdf');
  });
});
