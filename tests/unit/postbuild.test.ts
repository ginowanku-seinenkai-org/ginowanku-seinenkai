// postbuild の HTML の検査（03 §12.3 の2、07 UT-28）
import { describe, expect, it } from 'vitest';
import { findInlineViolations } from '../../scripts/postbuild.ts';

describe('findInlineViolations', () => {
  it('外部の script と JSON-LD は通す', () => {
    expect(
      findInlineViolations(
        '<script type="module" src="/_astro/a.js"></script><script type="application/ld+json">{}</script>',
      ),
    ).toEqual([]);
  });
  it('インラインの script・style 要素・style 属性・on 属性を見つける', () => {
    const html =
      '<script>alert(1)</script><style>p{}</style><p style="color:red">x</p><img src=x onerror="alert(1)">';
    expect(findInlineViolations(html)).toEqual([
      'インラインの <script>',
      '<style> 要素',
      'style= 属性',
      'onerror= 属性',
    ]);
  });
});
