// 公開サイトの画面（07 §6.2：EP-01〜EP-06、EP-13、EP-20）。フォームは feature/inquiry-form、計測は feature/analytics で足す
import { expect, expectNoA11yViolations, test } from './fixtures.ts';

// nav：ナビで今のページを示す項目（aria-current="page"）。無ければ確かめない
const PAGES: { path: string; title: string; nav?: string }[] = [
  { path: '/', title: '宜野湾区青年会｜沖縄県宜野湾市' },
  {
    path: '/about',
    title: '宜野湾区青年会について｜宜野湾区青年会',
    nav: '宜野湾区青年会について',
  },
  { path: '/officers', title: '役員紹介｜宜野湾区青年会', nav: '役員紹介' },
  { path: '/songs', title: '曲目一覧｜宜野湾区青年会', nav: '曲目一覧' },
  { path: '/news', title: 'お知らせ・演舞｜宜野湾区青年会', nav: 'お知らせ・演舞' },
  {
    path: '/news/page/2',
    title: 'お知らせ・演舞（2ページ目）｜宜野湾区青年会',
    nav: 'お知らせ・演舞',
  },
  {
    path: '/news/category/event',
    title: '演舞｜お知らせ・演舞｜宜野湾区青年会',
    nav: 'お知らせ・演舞',
  },
  { path: '/news/15', title: '夏まつりでエイサー演舞｜宜野湾区青年会', nav: 'お知らせ・演舞' },
  // 中止の演舞（13 §6.2）
  { path: '/news/22', title: '秋の地域まつりでの演舞｜宜野湾区青年会', nav: 'お知らせ・演舞' },
  { path: '/activities', title: '活動記録｜宜野湾区青年会' },
  { path: '/activities/19', title: '夏まつりの演舞｜宜野湾区青年会' },
  { path: '/join', title: 'メンバー募集｜宜野湾区青年会', nav: 'メンバー募集' },
  { path: '/contact', title: '演舞依頼・お問い合わせ｜宜野湾区青年会' },
  { path: '/contact/thanks', title: '送信完了｜宜野湾区青年会' },
  { path: '/privacy', title: 'プライバシーポリシー｜宜野湾区青年会' },
  { path: '/site-policy', title: 'このサイトについて｜宜野湾区青年会' },
];

test.describe('EP-01 全ページの表示', () => {
  for (const { path, title, nav } of PAGES) {
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
      if (nav !== undefined)
        await expect(page.locator('#site-nav a[aria-current="page"]')).toHaveText(nav);
      // フッターの SNS（固定データは Instagram があり、TikTok は null。Facebook は出さない。D-116）
      const footer = page.locator('footer.ftr');
      await expect(footer.getByRole('link', { name: /Instagram/ })).toHaveAttribute(
        'href',
        'https://www.instagram.com/example',
      );
      await expect(footer.getByRole('link', { name: /Facebook/ })).toHaveCount(0);
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
    await expect(
      page.locator('main').getByRole('link', { name: 'お知らせ・演舞' }),
    ).toHaveAttribute('href', '/news');
    await expectNoA11yViolations(page);
    // ページ自体の 404 の記録だけは期待どおり
    expect(consoleErrors.filter((e) => !e.includes('status of 404'))).toEqual([]);
  });
});

test('EP-02 トップ：お知らせ、次の演舞、募集・依頼への導線（メインの帯はない。D-83）', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.hero')).toHaveCount(0);
  await expect(page.locator('.news li')).toHaveCount(5);
  await expect(page.getByRole('heading', { level: 2, name: '次の演舞' })).toBeVisible();
  // 今日の演舞は終了していない。昨日の演舞と中止の演舞は出ない
  const upcoming = page.locator('[data-upcoming-list] li:visible');
  await expect(upcoming).toHaveCount(3);
  await expect(upcoming.first()).toContainText('夏まつりでエイサー演舞');
  await expect(page.getByRole('link', { name: 'メンバー募集' }).last()).toHaveAttribute(
    'href',
    '/join',
  );
  await expect(page.getByText('対象：高校生以上').first()).toBeVisible();
});

test('EP-03 お知らせ一覧：カテゴリ、演舞の並び、終了の表示、ページ送り', async ({ page }) => {
  await page.goto('/news');
  await expect(page.locator('h1')).toHaveText('お知らせ・演舞');
  await expect(page.getByRole('navigation', { name: 'ページ送り' })).toBeVisible();
  const tabs = page.getByRole('navigation', { name: '種類で絞り込み' }).getByRole('link');
  await expect(tabs).toHaveText(['すべて', 'お知らせ', '演舞', '募集']);
  await tabs.filter({ hasText: '演舞' }).click();
  await expect(page).toHaveURL(/\/news\/category\/event$/);
  await expect(page.locator('h1')).toHaveText('お知らせ・演舞：演舞');
  const crumbs = page.getByRole('navigation', { name: 'パンくずリスト' });
  await expect(crumbs.getByRole('link', { name: 'お知らせ・演舞' })).toHaveAttribute(
    'href',
    '/news',
  );
  await expect(crumbs.locator('[aria-current="page"]')).toHaveText('演舞');
  // 終わっていない・中止でない演舞を開始の早い順 → 終わったものと中止を開始の遅い順（13 §6.2）
  const titles = await page.locator('.card .ttl').allTextContents();
  expect(titles).toEqual([
    '夏まつりでエイサー演舞',
    '秋の演舞会',
    '文化祭への出演',
    '秋の地域まつりでの演舞',
    '地域清掃と演舞',
    '旧盆の道じゅねー',
  ]);
  const ended = page.locator('.card.is-ended .ttl');
  await expect(ended).toHaveText(['地域清掃と演舞', '旧盆の道じゅねー']);
  await expect(page.locator('.card.is-ended .badge-ended').first()).toBeVisible();
  await expect(page.locator('.card .kind').first()).toHaveText('演舞');
  for (const kind of ['news', 'recruit']) {
    expect((await page.goto(`/news/category/${kind}`))?.status()).toBe(200);
  }
});

test('EP-20 中止の演舞：一覧に「中止」の印、詳細に中止の文、トップの「次の演舞」に出ない（13 §6.2）', async ({
  page,
}) => {
  const title = '秋の地域まつりでの演舞';
  // トップ：「次の演舞」に出ず、「お知らせ」では演舞日時の後ろに「（中止）」
  await page.goto('/');
  await expect(page.locator('[data-upcoming-list]')).not.toContainText(title);
  const item = page.locator('ul.news > li').filter({ hasText: title });
  await expect(item.locator('.news-ev')).toHaveText(
    '演舞日時 2026年10月25日（日）17:00〜19:00（中止）',
  );
  await expect(page.locator('ul.news .news-ev').filter({ hasText: '（中止）' })).toHaveCount(1);

  // 一覧：「終了」の代わりに「中止」の印。写真だけを薄くする
  await page.goto('/news/category/event');
  const card = page.locator('.card').filter({ hasText: title });
  await expect(card.locator('.badge-cancelled')).toHaveText('中止');
  await expect(card.locator('.badge-cancelled')).toBeVisible();
  await expect(card.locator('.badge-ended')).toHaveCount(0);
  await expect(card).not.toHaveAttribute('data-event-end', /.*/);
  await expect(card.locator('.thumb')).toHaveCSS('opacity', '0.5');
  await expect(card.locator('.ttl')).toHaveCSS('opacity', '1');
  await expect(page.locator('.card .badge-cancelled')).toHaveCount(1);

  // 詳細：日時と場所の下に中止の文。終了の文は出ない
  await card.locator('.ttl').click();
  await expect(page).toHaveURL(/\/news\/22$/);
  const evbox = page.locator('.evbox');
  await expect(evbox.locator('.done')).toHaveText('この演舞は中止になりました');
  await expect(evbox.locator('.done')).toBeVisible();
  await expect(evbox).not.toContainText('この演舞は終了しました');
  await expect(evbox).not.toContainText('終了');
  await expect(page.getByRole('link', { name: 'お知らせ・演舞の一覧へ' })).toHaveAttribute(
    'href',
    '/news',
  );
  await expectNoA11yViolations(page);
});

test('EP-20 中止の演舞は、開始日を過ぎてもブラウザで「終了」にしない（13 §6.2）', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-30T12:00:00+09:00'));
  await page.goto('/news/category/event');
  const card = page.locator('.card').filter({ hasText: '秋の地域まつりでの演舞' });
  await expect(card).not.toHaveClass(/is-ended/);
  await expect(card.locator('.badge-ended')).toHaveCount(0);
  await expect(card.locator('.badge-cancelled')).toBeVisible();
  // 確定の演舞はブラウザでも「終了」になる（03 §7）
  const confirmed = page.locator('.card').filter({ hasText: '秋の演舞会' });
  await expect(confirmed).toHaveClass(/is-ended/);
  await page.goto('/news/22');
  await expect(page.locator('.evbox .done')).toHaveText('この演舞は中止になりました');
  await expect(page.locator('.evbox')).not.toContainText('終了');
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

test('EP-05a 曲目一覧：本文があればナビの「宜野湾区青年会について」の次に出る（D-81）。役員紹介はその次（D-121）', async ({
  page,
}) => {
  await page.goto('/songs');
  await expect(page.locator('.content-body h2')).toHaveText('仲順流り');
  // スマホ幅ではナビがメニューの中に隠れているため、表示に関係なく並びを読む
  const links = page.locator('#site-nav a');
  expect((await links.allTextContents()).slice(0, 4)).toEqual([
    'トップ',
    '宜野湾区青年会について',
    '曲目一覧',
    '役員紹介',
  ]);
  await expect(links.nth(2)).toHaveAttribute('aria-current', 'page');
});

test('EP-05 宜野湾区青年会について：本文があり、役員の氏名は出さない（D-121）', async ({
  page,
}) => {
  await page.goto('/about');
  await expect(page.locator('.content-body h2')).toHaveText('宜野湾区青年会とは');
  await expect(page.getByText('宜野湾 一郎')).toHaveCount(0);
});

test('EP-05b 役員紹介：年度のリードと、役職・氏名・写真のカードを並び順で出す（D-121、D-122）', async ({
  page,
}) => {
  await page.goto('/officers');
  await expect(page.locator('.phead .lead')).toHaveText('令和8年度の役員です。');
  const cards = page.locator('ul.officer-cards > li');
  await expect(cards.locator('.officer-role')).toHaveText(['会長', '副会長', '書記', '会計']);
  await expect(cards.locator('.officer-name')).toHaveText([
    '宜野湾 一郎',
    '宜野湾 二郎',
    '宜野湾 花子',
    '宜野湾 三郎',
  ]);
  // ひと言は会長と書記だけ（D-124）
  await expect(cards.locator('.officer-message')).toHaveText([
    'みんなで楽しくエイサーを踊りましょう！',
    'よろしくお願いします。',
  ]);
  await expect(cards.nth(0).locator('.officer-message')).toHaveCount(1);
  await expect(cards.nth(2).locator('.officer-message')).toHaveCount(1);
  // 写真は会長と書記だけ。代替テキストは空（氏名を書かない）。写真のない役員は氏名の最初の1文字の枠
  const photos = page.locator('main img.officer-photo');
  await expect(photos).toHaveCount(2);
  for (const alt of await photos.evaluateAll((imgs) => imgs.map((i) => i.getAttribute('alt'))))
    expect(alt).toBe('');
  await expect(cards.nth(0).locator('img.officer-photo')).toHaveCount(1);
  await expect(cards.nth(2).locator('img.officer-photo')).toHaveCount(1);
  const initials = page.locator('.officer-initial');
  await expect(initials).toHaveText(['宜', '宜']);
  for (const i of [0, 1]) await expect(initials.nth(i)).toHaveAttribute('aria-hidden', 'true');
  // フッターからも行ける
  await expect(page.locator('footer.ftr').getByRole('link', { name: '役員紹介' })).toHaveAttribute(
    'href',
    '/officers',
  );
});

test('EP-05c 役員紹介の並び：スマホは2列で横スクロールなし、PC は4列。写真は正方形（D-122）', async ({
  page,
}) => {
  /**
   * カードの写真（または枠）の位置と大きさを読む
   * @returns 各カードの写真の左端・上端・幅・高さ
   */
  const boxes = () =>
    page.locator('ul.officer-cards > li .officer-photo').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: r.width, h: r.height };
      }),
    );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/officers');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const phone = await boxes();
  expect(phone).toHaveLength(4);
  // 1行目に2つ、2行目に2つ
  expect(phone[0]?.y).toBe(phone[1]?.y);
  expect(phone[2]?.y).toBe(phone[3]?.y);
  expect(phone[2]?.y).toBeGreaterThan(phone[0]?.y ?? 0);
  for (const b of phone) expect(Math.abs(b.w - b.h)).toBeLessThanOrEqual(1);
  // 写真は読み込めている
  for (const img of await page.locator('img.officer-photo').all()) {
    await img.scrollIntoViewIfNeeded();
    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  }
  await expectNoA11yViolations(page);

  // ひと言が上限の長さ（60文字）で、区切りのない英数字でも、カードからはみ出さない（D-124）
  await page.evaluate(() => {
    const message = document.querySelector('.officer-message');
    if (message) message.textContent = 'W'.repeat(60);
  });
  const fits = await page
    .locator('ul.officer-cards > li')
    .first()
    .evaluate((card) => {
      const outer = card.getBoundingClientRect();
      return Array.from(card.children).every((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.left >= outer.left - 0.5 &&
          r.right <= outer.right + 0.5 &&
          el.scrollWidth <= el.clientWidth
        );
      });
    });
  expect(fits).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);

  await page.setViewportSize({ width: 1200, height: 900 });
  const pc = await boxes();
  expect(new Set(pc.map((b) => b.y)).size).toBe(1);
  for (const b of pc) expect(Math.abs(b.w - b.h)).toBeLessThanOrEqual(1);
});

test('EP-05d 役員紹介：ダークの表示でも読みやすい（D-86、D-122）', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/officers');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expectNoA11yViolations(page);
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
  for (const path of ['/', '/news', '/activities/19', '/officers', '/privacy']) {
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

test('EP-17 表示の明るさ：押すとダークになり、読み込み直しても続く（D-86）', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'light');
  const button = page.getByRole('button', { name: 'ダークモード' });
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await button.click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expectNoA11yViolations(page);
  await page.getByRole('button', { name: 'ダークモード' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
});

test('EP-17 表示の明るさ：端末の設定がダークなら最初からダーク（D-86）', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/about');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'ダークモード' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expectNoA11yViolations(page);
});

test('EP-18 言葉の切り替え：英語を選んだときだけ Google の部品を読み込む（D-88）', async ({
  page,
  context,
}) => {
  // Google には出さない。部品の代わりに、呼ばれたことだけを記録する
  const loaded: string[] = [];
  await page.route(/https:\/\/translate\.google\.com\//, (route) => {
    loaded.push(route.request().url());
    return route.fulfill({
      contentType: 'text/javascript',
      body: "window.google={translate:{TranslateElement:function(o,id){document.documentElement.dataset.mockTranslate=o.includedLanguages+'/'+id}}};window.ginowankuTranslateInit();",
    });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'English' })).toBeVisible();
  expect(loaded).toEqual([]);

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('button', { name: '日本語' })).toBeVisible();
  expect((await context.cookies()).find((c) => c.name === 'googtrans')?.value).toBe('/ja/en');
  await expect(page.locator('html')).toHaveAttribute('data-mock-translate', 'en/google-translate');
  expect(loaded).toHaveLength(1);
  await expectNoA11yViolations(page);

  await page.getByRole('button', { name: '日本語' }).click();
  await expect(page.getByRole('button', { name: 'English' })).toBeVisible();
  expect((await context.cookies()).find((c) => c.name === 'googtrans')).toBeUndefined();
  expect(loaded).toHaveLength(1);
});
