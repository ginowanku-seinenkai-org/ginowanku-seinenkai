// @vitest-environment jsdom
// ビルド出力の検査（07 UT-20〜UT-29、03 §2.3）。build か build:fixture のあとに、ビルドと同じ PUBLIC_SITE_ENV で実行する
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findInlineViolations } from '../../scripts/postbuild.ts';
import { jstDate } from '../../src/lib/date.ts';
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
  id: number;
  kind: string;
  event_starts_at: string | null;
  event_place: string | null;
  event_status?: string | null;
}[];
const dataSettings = data('site-settings.json') as Record<string, unknown>;
// 役員（D-121、D-122、D-124、D-125）。並び順は sort_order の昇順
const dataOfficers = (
  data('officers.json') as {
    role: string;
    name: string;
    sort_order: number;
    photo_id: string | null;
    message: string | null;
  }[]
)
  .slice()
  .sort((a, b) => a.sort_order - b.sort_order);
const dataPhotoIds = new Set((data('photos.json') as { id: string }[]).map((p) => p.id));
const hasPosts = dataPosts.length > 0;
// 中止の演舞の記事（13 §6.2）
const cancelledIds = new Set(
  dataPosts.filter((p) => p.kind === 'event' && p.event_status === 'cancelled').map((p) => p.id),
);
const hasEventWithPlace = dataPosts.some(
  (p) => p.kind === 'event' && p.event_starts_at !== null && p.event_place !== null,
);
const hasSns = ['instagram_url', 'tiktok_url'].some((k) => Boolean(dataSettings[k]));
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
      // 役員の写真は装飾として alt="" を明示する（すぐ隣に役職と氏名がある。D-122）
      for (const img of Array.from(
        doc.querySelectorAll('main img:not(.lb-img):not(.officer-photo)'),
      )) {
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

  // サイト設定の共通の画像（D-85）。無ければ共通の画像ファイル
  const siteOg =
    typeof dataSettings['og_photo_id'] === 'string'
      ? `${ORIGIN}/photos/${dataSettings['og_photo_id']}/full.jpg`
      : `${ORIGIN}/og-default.jpg`;

  it('UT-21 記事の詳細は1枚目の写真（カバー）、カバーのない記事はサイト設定の共通の画像（D-85）', () => {
    const details = pages.filter((p) => /^\/(news|activities)\/\d+$/.test(p.path));
    expect(details.length > 0).toBe(hasPosts);
    for (const p of details) {
      const cover = p.doc.querySelector('img.cover')?.getAttribute('src');
      const og = meta(p.doc, 'meta[property="og:image"]');
      expect(og).toBe(cover ? `${ORIGIN}${cover}` : siteOg);
    }
  });

  it('UT-21 トップ・一覧はサイト設定の共通の画像（D-85）', () => {
    for (const path of ['/', '/news', '/contact']) {
      const p = pages.find((x) => x.path === path);
      expect(p, path).toBeDefined();
      if (p) expect(meta(p.doc, 'meta[property="og:image"]'), path).toBe(siteOg);
    }
  });

  it('UT-23 トップに Organization、場所のある演舞に Event。中止なら EventCancelled（13 §6.2）', () => {
    const jsonLds = (p: (typeof pages)[number]) =>
      Array.from(p.doc.querySelectorAll('script[type="application/ld+json"]')).map(
        (s) => JSON.parse(s.textContent ?? '{}') as { '@type': string; eventStatus?: string },
      );
    expect(jsonLds(pageAt('/')).map((j) => j['@type'])).toEqual(['Organization']);
    const events = pages.filter((p) => jsonLds(p).some((j) => j['@type'] === 'Event'));
    expect(events.length > 0).toBe(hasEventWithPlace);
    for (const p of events) {
      expect(p.doc.querySelector('.evbox')).not.toBeNull();
      const cancelled = cancelledIds.has(Number(p.path.replace('/news/', '')));
      expect(jsonLds(p).find((j) => j['@type'] === 'Event')?.eventStatus, p.path).toBe(
        cancelled ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
      );
    }
  });

  it('UT-20 説明文の固定文（13 §6.1）', () => {
    const description = (path: string) => meta(pageAt(path).doc, 'meta[name="description"]');
    expect(description('/')).toBe(
      '沖縄県宜野湾市の宜野湾区青年会の公式サイトです。エイサーの演舞の予定、メンバー募集、演舞依頼の受付をご案内します。',
    );
    expect(description('/news')).toBe('宜野湾区青年会のお知らせ、演舞の予定、募集の一覧です。');
    expect(description('/news/category/event')).toBe('宜野湾区青年会の演舞の予定の一覧です。');
    expect(description('/activities')).toBe(
      '宜野湾区青年会のエイサーの演舞や地域の催しなど、活動の記録です。',
    );
  });

  it('中止の演舞：「中止」の印、中止の文、トップの「次回演舞」に出ない、「（中止）」を添える（13 §6.2）', () => {
    const newsListPages = pages.filter((p) =>
      /^\/news(\/category\/event)?(\/page\/\d+)?$/.test(p.path),
    );
    for (const id of cancelledIds) {
      // 一覧のカード：「中止」の印。「終了」の印と再判定の属性はない
      const cards = newsListPages.flatMap((p) =>
        Array.from(p.doc.querySelectorAll(`.card:has(a.ttl[href="/news/${id}"])`)),
      );
      expect(cards.length, `${id}`).toBeGreaterThan(0);
      for (const card of cards) {
        expect(card.classList.contains('is-cancelled')).toBe(true);
        expect(card.classList.contains('is-ended')).toBe(false);
        expect(card.querySelector('.badge-cancelled')?.textContent?.trim()).toBe('中止');
        expect(card.querySelector('.badge-ended')).toBeNull();
        expect(card.hasAttribute('data-event-end')).toBe(false);
      }
      // 詳細：日時と場所の下に中止の文。終了の文と再判定の属性はない
      const { doc } = pageAt(`/news/${id}`);
      const evbox = doc.querySelector('.evbox');
      expect(evbox?.hasAttribute('data-event-end')).toBe(false);
      expect(evbox?.querySelector('.done')?.textContent?.trim()).toBe('この演舞は中止になりました');
      expect(evbox?.textContent).not.toContain('この演舞は終了しました');
      // トップ：「次回演舞」に出ない。「お知らせ」では演舞日時の後ろに「（中止）」
      const top = pageAt('/').doc;
      expect(top.querySelector(`[data-upcoming-list] a[href="/news/${id}"]`)).toBeNull();
      const li = top.querySelector(`ul.news > li:has(a[href="/news/${id}"])`);
      if (li !== null) expect(li.querySelector('.news-ev')?.textContent).toMatch(/（中止）$/);
    }
    // 確定の演舞には「（中止）」も「中止」の印も付かない
    for (const li of Array.from(pageAt('/').doc.querySelectorAll('ul.news > li'))) {
      const id = Number(li.querySelector('a')?.getAttribute('href')?.replace('/news/', ''));
      if (!cancelledIds.has(id)) expect(li.textContent).not.toContain('（中止）');
    }
    for (const p of newsListPages)
      for (const card of Array.from(p.doc.querySelectorAll('.card.is-cancelled'))) {
        const id = Number(card.querySelector('a.ttl')?.getAttribute('href')?.replace('/news/', ''));
        expect(cancelledIds.has(id), p.path).toBe(true);
      }
  });

  it('演舞のカレンダー：次回演舞の下に、ビルドした月の表と演舞の日の印を出す（03 S01、D-128）', () => {
    const { doc, html } = pageAt('/');
    const section = doc.querySelector('section[aria-labelledby="upcoming-heading"]');
    expect(section?.querySelector('h2')?.textContent?.trim()).toBe('次回演舞');
    const cal = section?.querySelector<HTMLElement>(':scope > [data-calendar]');
    expect(cal).not.toBeNull();
    // 次回演舞の一覧・空の文言のあと
    expect(section?.querySelector(':scope > [data-upcoming-empty] ~ [data-calendar]')).toBe(cal);
    const heading = cal?.querySelector('h3');
    expect(heading?.querySelector('.visually-hidden')?.textContent?.trim()).toBe(
      '演舞のカレンダー',
    );
    const today = (data('meta.json') as { today: string }).today;
    const month = today.slice(0, 7);
    expect(cal?.querySelector('[data-cal-month]')?.textContent).toBe(
      `${Number(month.slice(0, 4))}年${Number(month.slice(5))}月`,
    );
    // 印：その月に始まる演舞の数（1日3つまで）
    const counts = new Map<string, number>();
    for (const p of dataPosts)
      if (p.kind === 'event' && p.event_starts_at !== null) {
        const day = jstDate(p.event_starts_at);
        if (day.startsWith(month)) counts.set(day, (counts.get(day) ?? 0) + 1);
      }
    const cells = Array.from(cal?.querySelectorAll<HTMLElement>('td[data-date]') ?? []);
    expect(cells.length).toBe(
      new Date(Date.UTC(+month.slice(0, 4), +month.slice(5), 0)).getUTCDate(),
    );
    for (const td of cells) {
      const n = counts.get(td.dataset['date'] ?? '') ?? 0;
      expect(td.querySelectorAll('.cal-dot').length, td.dataset['date']).toBe(Math.min(n, 3));
      expect(td.querySelector('.visually-hidden')?.textContent).toMatch(
        n === 0 ? /、演舞なし$/ : new RegExp(`、演舞${n}件$`),
      );
    }
    // JavaScript がなくても読める表（押せる部品は置かない）。前後の月のボタンと日の一覧は隠しておく
    expect(cal?.querySelectorAll('td button').length).toBe(0);
    for (const sel of ['[data-cal-prev]', '[data-cal-next]', '[data-cal-day]'])
      expect(cal?.querySelector(sel)?.hasAttribute('hidden'), sel).toBe(true);
    // データは data-events に JSON で埋め込む（インラインのスクリプトは使わない。UT-28）
    expect(html).not.toMatch(/<script\b[^>]*type="application\/json"/i);
    const events = JSON.parse(cal?.dataset['events'] ?? 'null') as {
      url: string;
      cancelled: boolean;
    }[];
    const expected = dataPosts.filter((p) => p.kind === 'event' && p.event_starts_at !== null);
    expect(events.map((e) => e.url).sort()).toEqual(expected.map((p) => `/news/${p.id}`).sort());
    for (const e of events)
      expect(e.cancelled, e.url).toBe(cancelledIds.has(Number(e.url.replace('/news/', ''))));
  });

  it('場所の名前の前に 📍 を付け、読み上げない（D-129）。JSON-LD には付けない', () => {
    const withPlace = dataPosts.filter((p) => p.kind === 'event' && p.event_place !== null);
    // 記事の詳細の「場所」：ラベルはそのまま、値の先頭に 📍
    for (const p of withPlace) {
      const { doc } = pageAt(`/news/${p.id}`);
      const dt = Array.from(doc.querySelectorAll('.evbox dt')).find(
        (d) => d.textContent === '場所',
      );
      const dd = dt?.nextElementSibling;
      expect(dd?.firstElementChild?.outerHTML, `${p.id}`).toBe(
        '<span class="pin" aria-hidden="true">📍</span>',
      );
      expect(dd?.textContent?.trim()).toBe(`📍${p.event_place}`);
      expect(doc.querySelector('script[type="application/ld+json"]')?.textContent).not.toContain(
        '📍',
      );
    }
    // トップの次回演舞：場所のある演舞は 📍＋場所
    const top = pageAt('/').doc;
    for (const a of Array.from(top.querySelectorAll('[data-upcoming-list] a.ev'))) {
      const id = Number(a.getAttribute('href')?.replace('/news/', ''));
      const place = withPlace.find((p) => p.id === id)?.event_place;
      const pin = a.querySelector('.ev-meta .pin');
      if (place === undefined) expect(pin, `${id}`).toBeNull();
      else expect(pin?.parentElement?.textContent).toBe(`📍${place}`);
    }
    // 埋め込みのデータには付けない（ブラウザで付ける）
    expect(top.querySelector('[data-calendar]')?.getAttribute('data-events')).not.toContain('📍');
    // どのページでも 📍 は読み上げない部品の中にだけある
    for (const p of pages) {
      for (const pin of Array.from(p.doc.querySelectorAll('.pin'))) {
        expect(pin.getAttribute('aria-hidden'), p.path).toBe('true');
        expect(pin.textContent).toBe('📍');
      }
      const body = p.doc.body.cloneNode(true) as HTMLElement;
      for (const pin of Array.from(body.querySelectorAll('.pin'))) pin.remove();
      expect(body.textContent, p.path).not.toContain('📍');
    }
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

  it('日付の名前：記事の詳細は「掲載日」、トップのお知らせの演舞は「演舞日時」を添える（D-120）', () => {
    for (const p of pages.filter((x) => /^\/(news|activities)\/\d+$/.test(x.path)))
      expect(p.doc.querySelector('.phead .meta')?.textContent, p.path).toContain('掲載日');
    const items = Array.from(pageAt('/').doc.querySelectorAll('ul.news > li'));
    for (const li of items) {
      const isEvent = li.querySelector('.kind')?.textContent?.includes('演舞') ?? false;
      expect(li.querySelector('.news-ev') !== null, li.textContent ?? '').toBe(isEvent);
      if (isEvent) expect(li.querySelector('.news-ev')?.textContent).toContain('演舞日時');
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

  /**
   * 役員紹介の各役員の枠を並び順で読む（D-132）。先頭は .officer-top（文は .officer-top-body）、2人目からは一覧の li
   * @param doc 役員紹介のページ
   * @returns 役員ごとの、枠（写真を含む）と文の入れ物
   */
  const officerBlocks = (doc: Document) => {
    const top = doc.querySelector('.officer-top');
    const body = top?.querySelector(':scope > .officer-top-body');
    const rest = Array.from(doc.querySelectorAll('ul.officer-cards > li.officer-card'));
    return [
      ...(top && body ? [{ block: top, text: body }] : []),
      ...rest.map((li) => ({ block: li, text: li })),
    ];
  };

  it('役員紹介：先頭の1人を大きく、2人目からを「役員」の一覧に並び順で出し、年度があればリードに添える（D-121、D-122、D-132）', () => {
    const { doc } = pageAt('/officers');
    expect(
      officerBlocks(doc).map(({ text }) => [
        text.querySelector(':scope > p.officer-role')?.textContent?.trim(),
        text.querySelector(':scope > p.officer-name')?.textContent?.trim(),
      ]),
    ).toEqual(dataOfficers.map((o) => [o.role, o.name]));
    expect(doc.querySelectorAll('.officer-top').length).toBe(dataOfficers.length === 0 ? 0 : 1);
    // 2人目からがいるときだけ、見出し「役員」と一覧を出す
    const heading = doc.querySelector('h2.officer-heading');
    expect(heading?.textContent?.trim() ?? null).toBe(dataOfficers.length >= 2 ? '役員' : null);
    expect(doc.querySelectorAll('ul.officer-cards').length).toBe(dataOfficers.length >= 2 ? 1 : 0);
    const lead = doc.querySelector('.phead .lead')?.textContent?.trim() ?? null;
    const label = dataSettings['officer_term_label'];
    expect(lead).toBe(typeof label === 'string' ? `${label}の役員です。` : null);
    if (dataOfficers.length === 0)
      expect(doc.querySelector('.empty')?.textContent).toBe('役員の紹介は準備中です。');
  });

  it('役員紹介の写真：写真があれば幅・高さと空の alt の画像、無ければ氏名の最初の1文字の枠（D-122）', () => {
    const { doc } = pageAt('/officers');
    const blocks = officerBlocks(doc);
    expect(blocks.length).toBe(dataOfficers.length);
    dataOfficers.forEach((officer, i) => {
      const card = blocks[i]?.block;
      if (card === undefined) throw new Error(`${officer.role} のカードがありません`);
      // 写真か枠のどちらかが1つ、役職より前にある
      expect(card.firstElementChild?.classList.contains('officer-photo'), officer.role).toBe(true);
      expect(card.querySelectorAll('.officer-photo').length, officer.role).toBe(1);
      const img = card.querySelector('img.officer-photo');
      if (officer.photo_id !== null && dataPhotoIds.has(officer.photo_id)) {
        expect(img, officer.role).not.toBeNull();
        expect(img?.getAttribute('src')).toBe(`/photos/${officer.photo_id}/thumb.jpg`);
        expect(img?.getAttribute('srcset')).toContain(`/photos/${officer.photo_id}/full.jpg`);
        expect(img?.getAttribute('width')).toMatch(/^\d+$/);
        expect(img?.getAttribute('height')).toMatch(/^\d+$/);
        expect(img?.getAttribute('alt')).toBe('');
      } else {
        expect(img, officer.role).toBeNull();
        const box = card.querySelector('div.officer-photo.officer-initial');
        expect(box?.getAttribute('aria-hidden'), officer.role).toBe('true');
        expect(box?.textContent?.trim()).toBe(Array.from(officer.name.trim())[0] ?? '');
      }
    });
    // 代替テキストに氏名を書かない
    for (const img of Array.from(doc.querySelectorAll('img')))
      for (const o of dataOfficers) expect(img.getAttribute('alt') ?? '').not.toContain(o.name);
  });

  it('役員紹介のひと言：あるときだけ、その役員の氏名の後に出す（D-124、D-125、D-132）', () => {
    const { doc } = pageAt('/officers');
    const blocks = officerBlocks(doc);
    expect(blocks.length).toBe(dataOfficers.length);
    dataOfficers.forEach((officer, i) => {
      const block = blocks[i];
      if (block === undefined) throw new Error(`${officer.role} のカードがありません`);
      const message = block.text.querySelectorAll(':scope > p.officer-message');
      expect(message.length, officer.role).toBe(officer.message === null ? 0 : 1);
      // 先頭のひと言の前の「“」は飾り（読み上げない）
      const quote = message[0]?.querySelector('.officer-quote');
      expect(quote === null || quote === undefined ? null : quote.getAttribute('aria-hidden')).toBe(
        i === 0 && officer.message !== null ? 'true' : null,
      );
      const said = Array.from(message[0]?.childNodes ?? [])
        .filter((n) => !(n.nodeType === 1 && (n as Element).classList.contains('officer-quote')))
        .map((n) => n.textContent)
        .join('')
        .trim();
      if (officer.message !== null) expect(said).toBe(officer.message);
      // 並びは 写真 → 役職 → 氏名 → ひと言（先頭は写真の隣の .officer-top-body の中）
      const order = Array.from(block.text.children)
        .slice(i === 0 ? 0 : 1)
        .map((el) => el.className);
      expect(order, officer.role).toEqual(
        [
          'officer-role',
          'officer-name',
          officer.message === null ? null : 'officer-message',
        ].filter((c) => c !== null),
      );
    });
  });

  it('役員の氏名は /officers にだけ出る（D-121）', () => {
    for (const p of pages) {
      if (p.path === '/officers') continue;
      for (const o of dataOfficers) expect(p.html, `${p.path}：${o.name}`).not.toContain(o.name);
    }
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
