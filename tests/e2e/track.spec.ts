// アクセス計測（07 §6.2：EP-12・EP-14、03 §9）
// 計測は本番の環境・本番のホスト名でだけ送るため、build:fixture の出力を ginowanku-seinenkai.com として配信し、
// HTML の data-site-env を production に置き換えて確かめる。track への送信は page.route で受け止め、本物は呼ばない
import type { Page, Request } from '@playwright/test';
import { expect, test } from './fixtures.ts';

const SITE = 'https://ginowanku-seinenkai.com';
const LOCAL = 'http://127.0.0.1:4329';
const TRACK_URL = 'https://supabase.test/functions/v1/track';

async function serveAsProduction(page: Page) {
  await page.route(`${SITE}/**`, async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${LOCAL}${url.pathname}${url.search}` });
    const type = response.headers()['content-type'] ?? '';
    if (!type.includes('text/html')) return route.fulfill({ response });
    // 本番と同じく https の送り先にする（http の 127.0.0.1 は WebKit が混在コンテンツとして止めるため）
    const html = (await response.text())
      .replace('data-site-env="local"', 'data-site-env="production"')
      .replace(/data-track-endpoint="[^"]*"/, `data-track-endpoint="${TRACK_URL}"`);
    return route.fulfill({ response, body: html });
  });
}

async function captureTrack(page: Page) {
  // sendBeacon は route で受け止められないブラウザがあるため、送信そのものを request で数える
  const sent: { body: Record<string, unknown>; request: Request }[] = [];
  page.on('request', (request) => {
    if (!request.url().endsWith('/functions/v1/track')) return;
    sent.push({
      body: JSON.parse(request.postData() ?? '{}') as Record<string, unknown>,
      request,
    });
  });
  await page.route('**/functions/v1/track', (route) => route.fulfill({ status: 204 }));
  return sent;
}

/** 自動操作のブラウザでないように見せる（navigator.webdriver を false に） */
async function notWebdriver(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', {
      get: () => false,
      configurable: true,
    });
    Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
  });
}

test('EP-12 アクセス計測：1ページ1回、パスと流入元のホスト名だけを送る', async ({ page }) => {
  await serveAsProduction(page);
  await notWebdriver(page);
  const sent = await captureTrack(page);

  // 直接開いた：流入元は null。クエリは送らない
  await page.goto(`${SITE}/news?utm_source=x`);
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]?.body).toEqual({ path: '/news', referrer_host: null });
  // CORS の事前確認を起こさない形（text/plain、apikey・Authorization なし）
  const headers = sent[0]?.request.headers() ?? {};
  expect(headers['content-type']).toContain('text/plain');
  expect(headers['apikey']).toBeUndefined();
  expect(headers['authorization']).toBeUndefined();

  // サイト内のリンクから移った：(internal)。スマホではヘッダーのメニューが閉じているため、フッターのリンクを使う
  await page.locator('footer').getByRole('link', { name: 'プライバシーポリシー' }).click();
  await expect(page).toHaveURL(`${SITE}/privacy`);
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]?.body).toEqual({ path: '/privacy', referrer_host: '(internal)' });

  // 外部のページから来た：ホスト名だけ
  await page.goto(`${SITE}/about`, { referer: 'https://www.instagram.com/p/abc?x=1' });
  await expect.poll(() => sent.length).toBe(3);
  expect(sent[2]?.body).toEqual({ path: '/about', referrer_host: 'www.instagram.com' });

  // 少し待っても、1ページで2回送らない
  await page.waitForTimeout(500);
  expect(sent).toHaveLength(3);
});

test.describe('EP-14 アクセス計測：送らない', () => {
  const cases: [string, (page: Page) => Promise<void>, string][] = [
    ['webdriver が true のまま', async () => {}, '/'],
    [
      'GPC が true',
      async (page) => {
        await notWebdriver(page);
        await page.addInitScript(() => {
          Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true });
        });
      },
      '/',
    ],
    [
      'DNT が 1',
      async (page) => {
        await notWebdriver(page);
        await page.addInitScript(() => {
          Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: () => '1' });
        });
      },
      '/',
    ],
    ['404 ページ', notWebdriver, '/no-such-page'],
  ];
  for (const [name, prepare, path] of cases) {
    test(name, async ({ page }) => {
      await serveAsProduction(page);
      await prepare(page);
      const sent = await captureTrack(page);
      await page.goto(`${SITE}${path}`);
      await page.waitForTimeout(800);
      expect(sent).toHaveLength(0);
    });
  }

  test('本番以外の環境・本番以外のホスト名', async ({ page }) => {
    await notWebdriver(page);
    const sent = await captureTrack(page);
    // ローカルの配信（環境は local、ホスト名は 127.0.0.1）
    await page.goto('/');
    await page.waitForTimeout(800);
    expect(sent).toHaveLength(0);
  });
});
