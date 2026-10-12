// @vitest-environment jsdom
// renderBody() の共通テスト（07 §4：RB-01〜RB-42、RB-90〜RB-94）
// fixtures/ を全件読み込み、出力が expected と完全一致することと、共通の不変条件を確かめる
import { describe, expect, it } from 'vitest';
import { renderBody } from './render-body.ts';
import type { RenderContext, ResolvedPhoto } from './types.ts';

interface Fixture {
  name: string;
  input: unknown;
  photos: Record<string, ResolvedPhoto>;
  expected: string;
}

// JSON は文字列のまま読み、JSON.parse で __proto__ などのキーを通常のプロパティとして扱う（RB-40）
const files = import.meta.glob<string>('./fixtures/**/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const fixtures = Object.entries(files).map(([path, raw]) => ({
  path,
  ...(JSON.parse(raw) as Fixture),
}));

const SITE_ORIGIN = 'https://ginowanku-seinenkai.com';

function contextOf(photos: Record<string, ResolvedPhoto>): RenderContext {
  return {
    siteOrigin: SITE_ORIGIN,
    resolvePhoto: (id) =>
      Object.prototype.hasOwnProperty.call(photos, id) ? (photos[id] ?? null) : null,
  };
}

const ALLOWED_ATTRIBUTES: Record<string, readonly string[]> = {
  div: ['class'],
  p: [],
  br: [],
  h2: [],
  h3: [],
  strong: [],
  a: ['href', 'target', 'rel'],
  ul: [],
  ol: [],
  li: [],
  figure: ['class'],
  img: ['src', 'srcset', 'sizes', 'width', 'height', 'alt', 'loading', 'decoding'],
  figcaption: [],
  iframe: [
    'src',
    'title',
    'width',
    'height',
    'loading',
    'referrerpolicy',
    'allow',
    'allowfullscreen',
  ],
};

describe('renderBody（fixtures）', () => {
  it('fixtures が読み込まれている', () => {
    expect(fixtures.length).toBeGreaterThan(30);
  });

  for (const fixture of fixtures) {
    describe(fixture.path, () => {
      const ctx = contextOf(fixture.photos);
      const html = renderBody(fixture.input, ctx);

      it('出力が expected と完全一致する', () => {
        expect(html).toBe(fixture.expected);
      });

      it('RB-94 何度実行しても同じ出力になる', () => {
        expect(renderBody(fixture.input, ctx)).toBe(html);
      });

      it('RB-90〜RB-93 許可した要素・属性だけで、リンク・写真・動画が決まった形', () => {
        if (html === '') return;
        const body = new DOMParser().parseFromString(html, 'text/html').body;
        const root = body.firstElementChild;
        expect(body.children.length).toBe(1);
        expect(root?.tagName.toLowerCase()).toBe('div');
        expect(root?.getAttribute('class')).toBe('content-body');

        const photoSrcs = new Set(
          Object.values(fixture.photos).flatMap((p) => [p.src, p.thumbSrc]),
        );
        for (const el of Array.from(body.querySelectorAll('*'))) {
          const tag = el.tagName.toLowerCase();
          const allowed = ALLOWED_ATTRIBUTES[tag];
          expect(allowed, `許可していない要素 ${tag}`).toBeDefined();
          for (const attr of Array.from(el.attributes)) {
            expect(attr.name.startsWith('on'), `on で始まる属性 ${attr.name}`).toBe(false);
            expect(allowed, `${tag} に許可していない属性 ${attr.name}`).toContain(attr.name);
          }
          if (tag === 'a') expect(el.getAttribute('href')).toMatch(/^https?:/);
          if (tag === 'img') expect(photoSrcs.has(el.getAttribute('src') ?? '')).toBe(true);
          if (tag === 'iframe') {
            // YouTube（youtube-nocookie.com）、TikTok・Instagram（D-70）の決まった形だけ
            expect(el.getAttribute('src')).toMatch(
              /^https:\/\/(www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}|www\.tiktok\.com\/player\/v1\/[0-9]{8,25}\?rel=0|www\.instagram\.com\/(p|reel)\/[A-Za-z0-9_-]{5,40}\/embed\/)$/,
            );
          }
          if (tag === 'figure' && el.hasAttribute('class')) {
            expect(el.getAttribute('class')).toMatch(/^sns-embed sns-(tiktok|instagram)$/);
          }
        }
      });
    });
  }
});

describe('renderBody（その他）', () => {
  const ctx = contextOf({});

  it('RB-40 __proto__ などのキーで Object.prototype が変わらない', () => {
    for (const fixture of fixtures) renderBody(fixture.input, contextOf(fixture.photos));
    expect(({} as Record<string, unknown>)['level']).toBeUndefined();
    expect(({} as Record<string, unknown>)['href']).toBeUndefined();
  });

  it('RB-41 1,000段の入れ子でも落ちず、深さ20で打ち切る', () => {
    let node: unknown = { type: 'text', text: '深い' };
    for (let i = 0; i < 1000; i += 1) node = { type: 'bulletList', content: [node] };
    const html = renderBody({ type: 'doc', content: [node] }, ctx);
    expect(html.startsWith('<div class="content-body"><ul>')).toBe(true);
    expect(html.match(/<ul>/g)?.length).toBe(20);
    expect(html).not.toContain('深い');
  });

  it('RB-42 100,000バイト近い本文でも実用的な時間で終わる', () => {
    const paragraph = {
      type: 'paragraph',
      content: [{ type: 'text', text: 'エイサー'.repeat(20) }],
    };
    const doc = { type: 'doc', content: Array.from({ length: 330 }, () => paragraph) };
    expect(new TextEncoder().encode(JSON.stringify(doc)).length).toBeLessThanOrEqual(100_000);
    const started = performance.now();
    renderBody(doc, ctx);
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('resolvePhoto が例外を投げても renderBody は例外を投げない', () => {
    const throwing: RenderContext = {
      siteOrigin: SITE_ORIGIN,
      resolvePhoto: () => {
        throw new Error('x');
      },
    };
    const doc = {
      type: 'doc',
      content: [{ type: 'photo', attrs: { photoId: '0f0e0d0c-0b0a-4908-8706-050403020100' } }],
    };
    expect(() => renderBody(doc, throwing)).not.toThrow();
  });
});
