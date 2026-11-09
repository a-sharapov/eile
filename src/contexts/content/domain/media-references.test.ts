import { describe, expect, it } from 'bun:test';
import { mediaReferences } from './media-references.ts';

describe('упоминания файлов медиатеки', () => {
  it('адреса в тексте, значения полей, JSON, исходные пути с пробелами и %-кодами', () => {
    const found = mediaReferences([
      '<p><img src="/media/img/sea.jpg?v=ab12" alt=""> и <a href="/media/docs/price.pdf">прайс</a></p>',
      'theme/stones/gabbro.webp',
      '{"fieldValue":[{"image":"assets/images/4a_(5).jpg"}]}',
      '<img src="/assets/images/%D0%A4%D0%BE%D1%82%D0%BE/Притыцкого 89.JPG">',
      'Скачайте файл file.txt и прочее',
    ]);
    expect(found.has('img/sea.jpg')).toBe(true);
    expect(found.has('docs/price.pdf')).toBe(true);
    expect(found.has('theme/stones/gabbro.webp')).toBe(true);
    expect(found.has('assets/images/4a_(5).jpg')).toBe(true);
    expect(found.has('assets/images/Фото/Притыцкого 89.JPG')).toBe(true);
    expect(found.has('file.txt')).toBe(true);
    expect(found.has('img/none.jpg')).toBe(false);
  });
});
