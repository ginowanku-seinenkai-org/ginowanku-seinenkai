// 公開サイトの画面（07 §6.2：EP-01〜EP-06、EP-13）。フォームは feature/inquiry-form、計測は feature/analytics で足す
import { expect, expectNoA11yViolations, test } from './fixtures.ts';

const PAGES = [
  { path: '/', title: '宜野湾区青年会｜沖縄県宜野湾市' },
  { path: '/about', title: '青年会について｜宜野湾区青年会' },
  { path: '/news', title: 'お知らせ・行事｜宜野湾区青年会' },
  { path: '/news/page/2', title: 'お知らせ・行事（2ページ目）｜宜野湾区青年会' },
  { path: '/news/category/event', title: '行事｜お知らせ・行事｜宜野湾区青年会' },
  { path: '/news/15', title: '夏まつりでエイサー演舞｜宜野湾区青年会' },
  { path: '/activities', title: '活動記録｜宜野湾区青年会' },
  { path: '/activities/19', title: '夏まつりの演舞｜宜野湾区青年会' },
  { path: '/join', title: 'メンバー募集｜宜野湾区青年会' },
  { path: '/contact', title: '演舞依頼・お問い合わせ｜宜野湾区青年会' },
  { path: '/contact/thanks', title: '送信完了｜宜野湾区青年会' },
  { path: '/privacy', title: 'プライバシーポリシー｜宜野湾区青年会' },
];

test.describe('EP-01 全ページの表示', () => {
  for (const { path, title } of PAGES) {
    test(path, async ({ page, consoleErrors }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle(title);
      await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('header.hdr')).toBeVisible();
      await expect(page.locator('footer.ftr')).toBeVisible();
      if (path !== '/')
        await expect(page.getByRole('navigation', { name: 'パンくずリスト' })).toBeVisible();
      // フッターの SNS（固定データは Instagram・Facebook があり、TikTok は null）
      const footer = page.locator('footer.ftr');
      await expect(footer.getByRole('link', { name: /Instagram/ })).toHaveAttribute(
        'href',
        'https://www.instagram.com/example',
      );
      await expect(footer.getByRole('link', { name: /Facebook/ })).toBeVisible();
      await expect(footer.getByRole('link', { name: /TikTok/ })).toHaveCount(0);
      await expectNoA11yViolations(page);
      expect(consoleErrors).toEqual([]);
    });
  }

  test('存在しない URL は 404', async ({ page, consoleErrors }) => {
    const response = await page.goto('/no-such-page');
    expect(response?.status()).toBe(404);
    await expect(page).toHaveTitle('ページが見つかりません｜宜野湾区青年会');
    await expect(page.locator('h1')).toHaveCount(1);
    await expectNoA11yViolations(page);
    // ページ自体の 404 の記録だけは期待どおり
    expect(consoleErrors.filter((e) => !e.includes('status of 404'))).toEqual([]);
  });
});

test('EP-02 トップ：メイン写真、お知らせ、次の行事、募集・依頼への導線', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hero-photo')).toHaveAttribute('alt', '道じゅねーの行列');
  await expect(page.locator('.news li')).toHaveCount(5);
  // 今日の行事は終了していない。昨日の行事は出ない
  const upcoming = page.locator('[data-upcoming-list] li:visible');
  await expect(upcoming).toHaveCount(3);
  await expect(upcoming.first()).toContainText('夏まつりでエイサー演舞');
  await expect(page.getByRole('link', { name: 'メンバー募集' }).last()).toHaveAttribute(
    'href',
    '/join',
  );
  await expect(page.getByText('対象：高校生以上').first()).toBeVisible();
});

test('EP-03 お知らせ一覧：カテゴリ、行事の並び、終了の表示、ページ送り', async ({ page }) => {
  await page.goto('/news');
  await expect(page.getByRole('navigation', { name: 'ページ送り' })).toBeVisible();
  await page
    .getByRole('navigation', { name: '種類で絞り込み' })
    .getByRole('link', { name: '行事' })
    .click();
  await expect(page).toHaveURL(/\/news\/category\/event$/);
  const titles = await page.locator('.card .ttl').allTextContents();
  expect(titles).toEqual([
    '夏まつりでエイサー演舞',
    '秋の演舞会',
    '文化祭への出演',
    '地域清掃と演舞',
    '旧盆の道じゅねー',
  ]);
  const ended = page.locator('.card.is-ended .ttl');
  await expect(ended).toHaveText(['地域清掃と演舞', '旧盆の道じゅねー']);
  await expect(page.locator('.card.is-ended .badge-ended').first()).toBeVisible();
  for (const kind of ['news', 'recruit']) {
    expect((await page.goto(`/news/category/${kind}`))?.status()).toBe(200);
  }
});

test('EP-04 活動記録の詳細：ギャラリーと YouTube', async ({ page }) => {
  await page.goto('/activities/19');
  const thumbs = page.locator('.gallery img');
  await expect(thumbs).toHaveCount(5);
  for (const alt of await thumbs.evaluateAll((imgs) => imgs.map((i) => i.getAttribute('alt'))))
    expect(alt).toBeTruthy();
  const iframe = page.locator('.content-body iframe');
  await expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE');
  await expect(iframe).toHaveAttribute('title', '夏まつりの演舞（動画）');
});

test('EP-04 ギャラリーの拡大表示（前へ・次へ・Esc で閉じてフォーカスを戻す）', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'キーボード操作は PC の Chrome で確かめる');
  await page.goto('/activities/19');
  const first = page.locator('.gallery a').first();
  await first.click();
  const dialog = page.getByRole('dialog', { name: '写真の拡大表示' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.lb-cap')).toContainText('（1／5）');
  await page.keyboard.press('ArrowRight');
  await expect(dialog.locator('.lb-cap')).toContainText('（2／5）');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(first).toBeFocused();
});

test('EP-05 青年会について：本文があり、役員紹介の区画がない', async ({ page }) => {
  await page.goto('/about');
  await expect(page.locator('.content-body h2')).toHaveText('宜野湾区青年会とは');
  await expect(page.getByText('役員紹介')).toHaveCount(0);
});

test('EP-06 メンバー募集：対象年齢の表示（F-19）', async ({ page }) => {
  await page.goto('/join');
  await expect(page.locator('.target-lg')).toHaveText('対象：高校生以上');
  await expect(page.getByRole('link', { name: '入会について問い合わせる' })).toHaveAttribute(
    'href',
    '/contact?kind=join',
  );
});

test('EP-13 スマホ表示：横スクロールが出ない、メニューが開閉できる', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'iPhone のプロジェクトで確かめる');
  for (const path of ['/', '/news', '/activities/19', '/privacy']) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  const button = page.getByRole('button', { name: 'メニュー' });
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('navigation', { name: 'メインメニュー' })).toBeHidden();
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(
    page
      .getByRole('navigation', { name: 'メインメニュー' })
      .getByRole('link', { name: '活動記録' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(button).toBeFocused();
});
