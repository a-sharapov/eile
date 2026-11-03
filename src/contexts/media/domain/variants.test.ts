import { describe, expect, it } from 'bun:test';
import type { ImageTraits } from './image-size.ts';
import { type MediaPath, stemOf, variantWidth } from './media.ts';
import {
  decodedPixels,
  isResizable,
  MAX_DECODED_PIXELS,
  planVariants,
  takesVariants,
  type VariantPlan,
  variantPath,
} from './variants.ts';

const path = (raw: string) => raw as MediaPath;

const still = (format: ImageTraits['format']): ImageTraits => ({
  format,
  animated: false,
  progressive: false,
  samples: format === 'jpeg' ? 1.5 : 4,
});

const JPEG = still('jpeg');
const PNG = still('png');

const sizes = (plan: VariantPlan) =>
  plan.kind === 'make'
    ? plan.variants.map((_) => [String(_.path), _.width, _.height])
    : plan.reason;

describe('варианты размеров', () => {
  it('имя варианта — как прежде у менеджера: путь без расширения, @ширина, .webp', () => {
    expect(String(variantPath(path('img/sea.jpg'), 960))).toBe(
      'img/sea@960.webp'
    );
    expect(String(variantPath(path('a.b/photo.v2.png'), 480))).toBe(
      'a.b/photo.v2@480.webp'
    );
    // Вариант узнаётся по имени и попадает в семейство оригинала.
    const made = variantPath(path('img/hero@2x.png'), 1920);
    expect([variantWidth(made), stemOf(made)]).toEqual([1920, 'img/hero@2x']);
  });

  it('альбомный, портретный и квадратный кадр: ширины меньше оригинала, высота по пропорции', () => {
    expect(
      sizes(planVariants(path('i/l.jpg'), { width: 4000, height: 3000 }, JPEG))
    ).toEqual([
      ['i/l@480.webp', 480, 360],
      ['i/l@960.webp', 960, 720],
      ['i/l@1920.webp', 1920, 1440],
    ]);
    expect(
      sizes(planVariants(path('i/p.png'), { width: 1000, height: 1500 }, PNG))
    ).toEqual([
      ['i/p@480.webp', 480, 720],
      ['i/p@960.webp', 960, 1440],
    ]);
    // Округление — Math.round, как в менеджере: 1064×846 → 960×763.
    expect(
      sizes(planVariants(path('i/s.webp'), { width: 1064, height: 846 }, PNG))
    ).toEqual([
      ['i/s@480.webp', 480, 382],
      ['i/s@960.webp', 960, 763],
    ]);
    expect(
      sizes(
        planVariants(path('i/pano.jpg'), { width: 10000, height: 100 }, JPEG)
      )
    ).toEqual([
      ['i/pano@480.webp', 480, 5],
      ['i/pano@960.webp', 960, 10],
      ['i/pano@1920.webp', 1920, 19],
    ]);
  });

  it('не растягивает: ширина оригинала и больше — без такого варианта, до 480 — без вариантов', () => {
    const widths = (width: number) =>
      ((plan) =>
        plan.kind === 'make' ? plan.variants.map((_) => _.width) : plan.reason)(
        planVariants(path('i/x.png'), { width, height: 100 }, PNG)
      );
    expect(widths(1921)).toEqual([480, 960, 1920]);
    expect(widths(1920)).toEqual([480, 960]);
    expect(widths(481)).toEqual([480]);
    expect(widths(480)).toBe('small');
    expect(widths(16)).toBe('small');
  });

  it('пропускает анимацию, GIF и то, что не прочесть', () => {
    expect(
      planVariants(
        path('i/a.png'),
        { width: 800, height: 600 },
        { ...PNG, animated: true }
      )
    ).toEqual({ kind: 'skip', reason: 'animated' });
    expect(
      planVariants(path('i/g.png'), { width: 800, height: 600 }, still('gif'))
        .kind
    ).toBe('skip');
    expect(planVariants(path('i/b.jpg'), null, JPEG)).toEqual({
      kind: 'skip',
      reason: 'unreadable',
    });
    expect(
      planVariants(path('i/b.jpg'), { width: 800, height: 600 }, still(null))
        .kind
    ).toBe('skip');
  });

  it('предел пикселей: PNG — весь кадр, прогрессивный JPEG — коэффициенты, обычный JPEG — уменьшенный кадр', () => {
    expect(MAX_DECODED_PIXELS).toBe(6000 * 4000);
    expect(
      planVariants(path('i/a.png'), { width: 6000, height: 4000 }, PNG).kind
    ).toBe('make');
    expect(
      planVariants(path('i/a.png'), { width: 6001, height: 4000 }, PNG)
    ).toEqual({ kind: 'skip', reason: 'too_large', pixels: 24_004_000 });
    // Прогрессивный 4:2:0 — три четверти кадра RGBA, 4:4:4 — полтора.
    const progressive = (samples: number) => ({
      ...JPEG,
      progressive: true,
      samples,
    });
    expect(
      planVariants(
        path('i/p.jpg'),
        { width: 6000, height: 4000 },
        progressive(1.5)
      ).kind
    ).toBe('make');
    expect(
      decodedPixels({ width: 4000, height: 4000 }, progressive(3), 480)
    ).toBe(MAX_DECODED_PIXELS);
    expect(
      planVariants(
        path('i/p.jpg'),
        { width: 4001, height: 4000 },
        progressive(3)
      )
    ).toEqual({ kind: 'skip', reason: 'too_large', pixels: 24_006_000 });
    // 12000×8000 = 96 Мп, но вариант 1920 декодируется в 2/8: 3000×2000.
    expect(decodedPixels({ width: 12000, height: 8000 }, JPEG, 1920)).toBe(
      3000 * 2000
    );
    expect(
      planVariants(path('i/big.jpg'), { width: 12000, height: 8000 }, JPEG).kind
    ).toBe('make');
    // Вариант больше половины кадра — без уменьшения при декодировании.
    expect(decodedPixels({ width: 3000, height: 2000 }, JPEG, 1920)).toBe(
      3000 * 2000
    );
    expect(decodedPixels({ width: 6000, height: 4000 }, PNG, 480)).toBe(
      24_000_000
    );
    // Свой предел — для тестов и маленьких серверов.
    expect(
      planVariants(path('i/a.png'), { width: 2000, height: 1000 }, PNG, 1000)
        .kind
    ).toBe('skip');
  });

  it('варианты положены JPEG, PNG и WebP шире 480, но не SVG, GIF, AVIF и не самим вариантам', () => {
    const file = (p: string, contentType: string, width: number | null) => ({
      path: path(p),
      contentType,
      width,
    });
    expect(takesVariants(file('a.jpg', 'image/jpeg', 2000))).toBe(true);
    expect(takesVariants(file('a.png', 'image/png', 481))).toBe(true);
    expect(takesVariants(file('a.webp', 'image/webp', 1200))).toBe(true);
    expect(takesVariants(file('a.png', 'image/png', 480))).toBe(false);
    expect(takesVariants(file('a.jpg', 'image/jpeg', null))).toBe(false);
    expect(takesVariants(file('a.svg', 'image/svg+xml', 2000))).toBe(false);
    expect(takesVariants(file('a.gif', 'image/gif', 2000))).toBe(false);
    expect(takesVariants(file('a.avif', 'image/avif', 2000))).toBe(false);
    expect(takesVariants(file('a@960.webp', 'image/webp', 960))).toBe(false);
    expect(isResizable(file('a.png', 'image/png', 100))).toBe(true);
  });
});
