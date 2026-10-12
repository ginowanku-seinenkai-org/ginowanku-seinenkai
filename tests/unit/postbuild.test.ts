// postbuild の HTML の検査（03 §12.3 の2、07 UT-28）
import { describe, expect, it } from 'vitest';
import { buildHeaders, checkHeaders, findInlineViolations } from '../../scripts/postbuild.ts';

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

describe('buildHeaders・checkHeaders（03 §12.1・§12.2）', () => {
  const text = buildHeaders('https://abcd1234.supabase.co/');
  it('CSP の connect-src に Supabase のオリジンだけを入れる', () => {
    const csp = text.split('\n').find((l) => l.includes('Content-Security-Policy')) ?? '';
    expect(csp).toContain("connect-src 'self' https://abcd1234.supabase.co;");
    expect(csp).toContain("script-src 'self' https://challenges.cloudflare.com;");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("'unsafe-inline'");
  });
  it('Cache-Control は /* に書かず、/_astro/* と /photos/* にだけ付ける', () => {
    const blocks = text.split('\n\n');
    expect(blocks[0]).not.toContain('Cache-Control');
    expect(text).toContain('/_astro/*\n  Cache-Control: public, max-age=31536000, immutable');
    expect(text).toContain('/photos/*\n  Cache-Control: public, max-age=31536000, immutable');
  });
  it('上限（規則100件、1行2,000文字）に収まる', () => {
    expect(checkHeaders(text)).toEqual([]);
    expect(checkHeaders(`/*\n  X: ${'a'.repeat(2001)}`)).toHaveLength(1);
  });
});
