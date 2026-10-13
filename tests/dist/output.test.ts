// @vitest-environment jsdom
// ビルド出力の検査（07 UT-20〜UT-29、03 §2.3）。build か build:fixture のあとに、ビルドと同じ PUBLIC_SITE_ENV で実行する
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findInlineViolations } from '../../scripts/postbuild.ts';
import { parseEnv } from '../../src/lib/env.ts';
import { PRIVACY_ESTABLISHED_ON, PRIVACY_VERSION } from '../../src/lib/privacy.ts';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const ORIGIN = 'https://ginowanku-seinenkai.com';
const siteEnv = parseEnv(process.env).siteEnv;

const htmlFiles = readdirSync(DIST, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.html'))
  .sort();
const pages = htmlFiles.map((file) => {
  const html = readFileSync(join(DIST, file), 'utf8');
  return {
    file,
    path: `/${file.replace(/\.html$/, '').replace(/(^|\/)index$/, '')}`,
    html,
    doc: new DOMParser().parseFromString(html, 'text/html'),
  };
});
const NOINDEX_PAGES = new Set(['/contact/thanks', '/404']);

// ビルドに使ったデータ（.data/。build:fixture では固定データ、build では本物のデータ）
// 本物のデータでは記事や SNS の URL がまだない時期もあるので、「ある」ことはデータにあるときだけ求める
const data = (name: string): unknown => JSON.parse(readFileSync(join(ROOT, '.data', name), 'utf8'));
const dataPosts = data('posts.json') as {
  kind: string;
  event_starts_at: string | null;
  event_place: string | null;
}[];
const dataSettings = data('site-settings.json') as Record<string, unknown>;
const hasPosts = dataPosts.length > 0;
const hasEventWithPlace = dataPosts.some(
  (p) => p.kind === 'event' && p.event_starts_at !== null && p.event_place !== null,
);
const hasSns = ['instagram_url', 'facebook_url', 'tiktok_url'].some((k) =>
  Boolean(dataSettings[k]),
);
const meta = (doc: Document, selector: string) =>
  doc.querySelector(selector)?.getAttribute('content') ?? null;
const read = (name: string) => readFileSync(join(DIST, name), 'utf8');
function pageAt(path: string) {
  const found = pages.find((p) => p.path === path);
  if (found === undefined) throw new Error(`${path} の HTML がありません`);
  return found;
}

describe(`ビルド出力（PUBLIC_SITE_ENV=${siteEnv}）`, () => {
  it('HTML がある', () => expect(pages.length).toBeGreaterThan(10));

  describe.each(pages)('$path', ({ path, html, doc }) => {
    it('UT-20 title・description・og:title・og:image・canonical', () => {
      expect(doc.title).toMatch(/｜(宜野湾区青年会|沖縄県宜野湾市)$/);
      expect(meta(doc, 'meta[property="og:title"]')).toBeTruthy();
      expect(meta(doc, 'meta[property="og:image"]')).toMatch(new RegExp(`^${ORIGIN}/`));
      if (!NOINDEX_PAGES.has(path)) expect(meta(doc, 'meta[name="description"]')).toBeTruthy();
      if (path === '/404') {
        expect(doc.querySelector('link[rel="canonical"]')).toBeNull();
      } else {
        expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
          `${ORIGIN}${path === '/' ? '/' : path}`,
        );
      }
    });

    it('UT-24 <html lang="ja">、h1 は1つ', () => {
      expect(doc.documentElement.getAttribute('lang')).toBe('ja');
      expect(doc.querySelectorAll('h1').length).toBe(1);
    });

    it('UT-25 secret キー・旧形式のキーが含まれない', () => {
      expect(html).not.toContain('sb_secret_');
      expect(html).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/);
    });

    it('UT-26 すべての <img> に alt と width・height がある', () => {
      for (const img of Array.from(doc.querySelectorAll('img'))) {
        expect(img.hasAttribute('alt'), img.outerHTML).toBe(true);
        expect(img.getAttribute('width'), img.outerHTML).toMatch(/^\d+$/);
        expect(img.getAttribute('height'), img.outerHTML).toMatch(/^\d+$/);
      }
      for (const img of Array.from(doc.querySelectorAll('main img:not(.lb-img)'))) {
        expect(img.getAttribute('alt'), img.outerHTML).not.toBe('');
      }
    });

    it('UT-27 自サイト内のリンクに末尾スラッシュがない（トップの / を除く）', () => {
      for (const a of Array.from(doc.querySelectorAll('a[href^="/"]'))) {
        const href = a.getAttribute('href') ?? '';
        if (href === '/') continue;
        expect(href, href).not.toMatch(/\/(\?|#|$)/);
        expect(href, href).not.toMatch(/\.html(\?|#|$)/);
      }
    });

    it('UT-28 インラインのスクリプト・スタイルがない', () =>
      expect(findInlineViolations(html)).toEqual([]));

    it('UT-23 JSON-LD は JSON として正しい', () => {
      for (const s of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
        expect(() => JSON.parse(s.textContent ?? '')).not.toThrow();
      }
    });

    it('検索エンジン向けの指定（UT-29・03 §11.5）', () => {
      const robots = meta(doc, 'meta[name="robots"]');
      if (siteEnv === 'preview') expect(robots).toBe('noindex, nofollow');
      else if (NOINDEX_PAGES.has(path)) expect(robots).toBe('noindex');
      else expect(robots).toBeNull();
    });
  });

  it('UT-21 記事の詳細は1枚目の写真（カバー）、カバーのない記事は共通画像', () => {
    const details = pages.filter((p) => /^\/(news|activities)\/\d+$/.test(p.path));
    expect(details.length > 0).toBe(hasPosts);
    for (const p of details) {
      const cover = p.doc.querySelector('img.cover')?.getAttribute('src');
      const og = meta(p.doc, 'meta[property="og:image"]');
      expect(og).toBe(cover ? `${ORIGIN}${cover}` : `${ORIGIN}/og-default.jpg`);
    }
  });

  it('UT-23 トップに Organization、場所のある行事に Event', () => {
    const types = (p: (typeof pages)[number]) =>
      Array.from(p.doc.querySelectorAll('script[type="application/ld+json"]')).map(
        (s) => (JSON.parse(s.textContent ?? '{}') as { '@type': string })['@type'],
      );
    expect(types(pageAt('/'))).toEqual(['Organization']);
    const events = pages.filter((p) => types(p).includes('Event'));
    expect(events.length > 0).toBe(hasEventWithPlace);
    for (const p of events) expect(p.doc.querySelector('.evbox')).not.toBeNull();
  });

  it('UT-22 sitemap に公開ページが載り、/contact/thanks と 404 は載らない。URL に末尾スラッシュ・.html がない', () => {
    expect(read('sitemap-index.xml')).toContain(`${ORIGIN}/sitemap-0.xml`);
    const urls = [...read('sitemap-0.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? '');
    const expected = pages
      .filter((p) => !NOINDEX_PAGES.has(p.path))
      .map((p) => `${ORIGIN}${p.path === '/' ? '/' : p.path}`);
    expect(urls.sort()).toEqual(expected.sort());
    for (const url of urls) if (url !== `${ORIGIN}/`) expect(url).not.toMatch(/(\/|\.html)$/);
  });

  it('UT-22 robots.txt（本番だけ Allow と sitemap）', () => {
    const robots = read('robots.txt');
    if (siteEnv === 'production') {
      expect(robots).toBe(`User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap-index.xml\n`);
    } else {
      expect(robots).toBe('User-agent: *\nDisallow: /\n');
    }
  });

  it('UT-27 カテゴリのページがある', () => {
    for (const kind of ['news', 'event', 'recruit'])
      expect(existsSync(join(DIST, 'news', 'category', `${kind}.html`))).toBe(true);
  });

  it('/privacy の制定日・最終改定日は privacy.ts の定数', () => {
    const p = pageAt('/privacy');
    const dates = Array.from(p.doc.querySelectorAll('.dates time')).map((t) =>
      t.getAttribute('datetime'),
    );
    expect(dates).toEqual([PRIVACY_ESTABLISHED_ON, PRIVACY_VERSION]);
  });

  it('問い合わせフォーム：プレビューでは送れない（UT-29・07 EP-15、D-20）', () => {
    const { doc } = pageAt('/contact');
    const form = doc.querySelector<HTMLFormElement>('[data-contact-form]');
    expect(form).not.toBeNull();
    const button = form?.querySelector('button[type="submit"]');
    const notice = doc.querySelector('.state-note:not(noscript .state-note)');
    if (siteEnv === 'preview') {
      expect(form?.dataset['preview']).toBe('true');
      expect(button?.hasAttribute('disabled')).toBe(true);
      expect(notice?.textContent).toBe('プレビュー環境では送信できません。');
    } else {
      expect(form?.dataset['preview']).toBe('false');
      expect(button?.hasAttribute('disabled')).toBe(false);
      expect(notice).toBeNull();
    }
    // 送り先は PUBLIC_SUPABASE_URL の submit-inquiry。版は privacy.ts の定数
    expect(form?.dataset['endpoint']).toBe(
      `${parseEnv(process.env).supabaseUrl.replace(/\/$/, '')}/functions/v1/submit-inquiry`,
    );
    expect(form?.dataset['privacyVersion']).toBe(PRIVACY_VERSION);
  });

  it('Turnstile は /contact のスクリプトだけが読み込む（03 §14）', () => {
    const scripts = readdirSync(join(DIST, '_astro')).filter((f) => f.endsWith('.js'));
    const loaders = scripts.filter((f) =>
      read(join('_astro', f)).includes('challenges.cloudflare.com'),
    );
    expect(loaders).toHaveLength(1);
    for (const p of pages) {
      const usesLoader = Array.from(p.doc.querySelectorAll('script[src]')).some((s) =>
        (s.getAttribute('src') ?? '').includes(loaders[0] ?? '?'),
      );
      expect(usesLoader, p.path).toBe(p.path === '/contact');
    }
  });

  it('アクセス計測：404 以外の全ページが送り先と環境を持ち、404 は計測を読み込まない（UT-29、03 §9）', () => {
    const endpoint = `${parseEnv(process.env).supabaseUrl.replace(/\/$/, '')}/functions/v1/track`;
    for (const p of pages) {
      const root = p.doc.documentElement;
      // プレビューでは環境が preview になり、ブラウザ側の判定で送らない（D-20）
      expect(root.dataset['siteEnv'], p.path).toBe(siteEnv);
      if (p.path === '/404') expect(root.dataset['trackEndpoint']).toBeUndefined();
      else expect(root.dataset['trackEndpoint'], p.path).toBe(endpoint);
    }
  });

  it('SNS のリンクはフッターにだけある（D-65）', () => {
    for (const p of pages) {
      const lists = Array.from(p.doc.querySelectorAll('ul[aria-label="公式SNS"]'));
      // SNS の URL が1つもなければ、リンクの並び自体を出さない
      expect(lists.length, p.path).toBe(hasSns ? 1 : 0);
      if (hasSns) expect(lists[0]?.closest('footer'), p.path).not.toBeNull();
    }
  });

  it('_headers：セキュリティヘッダーと Supabase のオリジン（03 §12.1）', () => {
    const headers = read('_headers');
    const origin = new URL(parseEnv(process.env).supabaseUrl).origin;
    expect(headers).toContain(`connect-src 'self' ${origin}`);
    for (const name of [
      'Content-Security-Policy',
      'X-Frame-Options: DENY',
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: strict-origin-when-cross-origin',
      'Permissions-Policy',
      'Strict-Transport-Security',
    ])
      expect(headers).toContain(name);
  });

  it('個人の氏名を出さない：役員紹介の区画がない（D-41）', () => {
    for (const p of pages) expect(p.html).not.toContain('役員紹介');
  });

  it('写真は .data/photos.json の件数だけ配置されている', () => {
    const photos = JSON.parse(
      readFileSync(join(ROOT, '.data', 'photos.json'), 'utf8'),
    ) as unknown[];
    const dirs = readdirSync(join(DIST, 'photos'));
    expect(dirs.length).toBe(photos.length);
    expect(relative(DIST, join(DIST, 'photos'))).toBe('photos');
  });
});
