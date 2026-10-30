import { describe, expect, it } from 'bun:test';
import { hasKeyTags } from './placeholders.ts';

describe('теги ключей в шаблоне', () => {
  it('находятся в разметке и в атрибутах', () => {
    expect(hasKeyTags('<p>{i18n.buy}</p>')).toBe(true);
    expect(hasKeyTags('<a href="[@shop]">x</a>')).toBe(true);
  });

  it('выражения site.i18n и site.custom, код и стили — не теги', () => {
    expect(hasKeyTags('<p>{site.i18n.buy} {site.custom.phone}</p>')).toBe(
      false
    );
    expect(
      hasKeyTags(
        '<script>const a = "[@x] {i18n.y}";</script><style>p::before{content:"[@x]"}</style><p>{a}</p>'
      )
    ).toBe(false);
  });
});
