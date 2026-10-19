// 問い合わせフォーム（07 §6.2：EP-07〜EP-11a、EP-16）。送信は page.route で差し替え、本物の関数は呼ばない
import type { Page, Route } from '@playwright/test';
import { DUMMY_TOKEN, expect, expectNoA11yViolations, FIXTURE_NOW, test } from './fixtures.ts';

const SUBMIT = '**/functions/v1/submit-inquiry';
const form = (page: Page) => page.locator('[data-contact-form]');
const field = (page: Page, label: string | RegExp) => form(page).getByLabel(label);
const summary = (page: Page) => form(page).locator('[data-summary]');
const errorOf = (page: Page, name: string) => form(page).locator(`#f-${name}-e`);

async function fillPerformance(page: Page) {
  await page.getByRole('radio', { name: '演舞依頼' }).check();
  await field(page, /^団体名/).fill('〇〇自治会');
  await field(page, /^担当者名/).fill('  宜野湾 太郎  ');
  await field(page, /^メールアドレス/).fill('taro@example.com');
  await field(page, /^電話番号/).fill('０９０－１２３４－５６７８');
  await field(page, /^希望日時/).fill('11月23日の夕方');
  await field(page, /^場所/).fill('〇〇公園');
  await field(page, /^イベント内容/).fill('地域の秋祭り');
  await form(page).getByRole('checkbox').check();
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const failure = (code: string, extra: Record<string, unknown> = {}) => ({
  ok: false,
  error: { code, message: code, ...extra },
  request_id: 'r',
});

test('EP-07 問い合わせ：F-21 の文言と自動返信の注意がフォームと完了画面にある', async ({
  page,
}) => {
  await page.goto('/contact');
  await expect(page.getByText('1週間以内に返信します。返信がない場合は')).toBeVisible();
  await expect(page.getByText(/自動返信メールが届かない場合があります/)).toBeVisible();
  await expect(form(page).getByRole('button', { name: '送信する' })).toBeEnabled();
  await page.goto('/contact/thanks');
  await expect(page.getByText(/内容を確認のうえ、1週間以内にご連絡します。/)).toBeVisible();
  await expect(page.getByText(/届かない場合があります/)).toBeVisible();
  // 受付番号がない・形が違うときは出さない（D-93）
  await expect(page.getByText(/受付番号：/)).toBeHidden();
  await page.goto('/contact/thanks?ref=%3Cb%3Ex%3C%2Fb%3E');
  await expect(page.getByText(/受付番号：/)).toBeHidden();
});

test('EP-08 問い合わせ：種類の切り替え', async ({ page }) => {
  await page.goto('/contact');
  // 種類を選ぶまでは共通項目以外を出さない
  await expect(field(page, /^メールアドレス/)).toBeHidden();

  await page.getByRole('radio', { name: '演舞依頼' }).check();
  const org = form(page).locator('[data-field="organization"]');
  await expect(org.locator('[data-badge]')).toHaveText('必須');
  await expect(org.locator('[data-hint]')).toHaveText(
    '個人でのご依頼の場合は「個人」と入力してください。',
  );
  await expect(field(page, /^担当者名/)).toBeVisible();
  await expect(field(page, /^希望日時/)).toBeVisible();
  await expect(field(page, /^備考/)).toBeVisible();
  await expect(field(page, /^年齢/)).toBeHidden();

  await page.getByRole('radio', { name: 'その他' }).check();
  await expect(org.locator('[data-badge]')).toHaveText('任意');
  await expect(org.locator('[data-hint]')).toHaveText(
    '団体としてのお問い合わせの場合に入力してください。',
  );
  await expect(field(page, /^お名前/)).toBeVisible();
  await expect(field(page, /^お問い合わせ内容/)).toBeVisible();
  await expect(form(page).locator('[data-field="message"] [data-badge]')).toHaveText('必須');
  await expect(field(page, /^希望日時/)).toBeHidden();

  await page.getByRole('radio', { name: '入会希望' }).check();
  await expect(field(page, /^団体名/)).toBeHidden();
  await expect(form(page).getByText('入会の対象は高校生以上です。').first()).toBeVisible();
  await field(page, /^年齢/).fill('16');
  await expect(
    form(page).getByText('保護者の方にもご確認のうえ、送信してください。'),
  ).toBeVisible();
  await field(page, /^年齢/).fill('20');
  await expect(form(page).getByText('保護者の方にもご確認のうえ、送信してください。')).toBeHidden();

  // ?kind= で初期の種類を選ぶ
  await page.goto('/contact?kind=join');
  await expect(page.getByRole('radio', { name: '入会希望' })).toBeChecked();
  await expect(field(page, /^年齢/)).toBeVisible();
});

test('EP-09 問い合わせ：送信成功（入力どおりの本文を送り、完了画面に移る）', async ({ page }) => {
  let sent: Record<string, unknown> | null = null;
  let headers: Record<string, string> = {};
  await page.route(SUBMIT, async (route) => {
    sent = route.request().postDataJSON() as Record<string, unknown>;
    headers = route.request().headers();
    await json(route, 200, { ok: true, ref_code: 'K7Q-3M9' });
  });
  await page.goto('/contact');
  await fillPerformance(page);
  // Turnstile は action=inquiry・日本語で描画する（03 §8.5）
  expect(
    await page.evaluate(() => (window as unknown as { __tsOptions?: unknown }).__tsOptions),
  ).toEqual({ sitekey: '1x00000000000000000000AA', action: 'inquiry', language: 'ja' });
  await form(page).getByRole('button', { name: '送信する' }).click();
  // 受付番号だけを URL で渡し、完了画面に出す（D-93）
  await expect(page).toHaveURL(/\/contact\/thanks\?ref=K7Q-3M9$/);
  await expect(page.getByText('受付番号：K7Q-3M9')).toBeVisible();
  expect(sent).toEqual({
    kind: 'performance',
    organization: '〇〇自治会',
    name: '宜野湾 太郎',
    email: 'taro@example.com',
    phone: '090-1234-5678',
    preferred_datetime: '11月23日の夕方',
    venue: '〇〇公園',
    event_summary: '地域の秋祭り',
    privacy_agreed: true,
    privacy_version: '2026-11-01',
    turnstile_token: DUMMY_TOKEN,
  });
  // apikey・Authorization は送らない（D-34）
  expect(headers['apikey']).toBeUndefined();
  expect(headers['authorization']).toBeUndefined();
});

test('EP-09 問い合わせ：その他で団体名を入れたとき・入会希望の年齢', async ({ page }) => {
  const bodies: Record<string, unknown>[] = [];
  await page.route(SUBMIT, async (route) => {
    bodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await json(route, 200, { ok: true });
  });
  await page.goto('/contact?kind=other');
  await field(page, /^団体名/).fill('〇〇会');
  await field(page, /^お名前/).fill('宜野湾 花子');
  await field(page, /^メールアドレス/).fill('hanako@example.com');
  await field(page, /^お問い合わせ内容/).fill('衣装について');
  await form(page).getByRole('checkbox').check();
  await form(page).getByRole('button', { name: '送信する' }).click();
  await expect(page).toHaveURL(/\/contact\/thanks$/);

  await page.goto('/contact?kind=join');
  await field(page, /^お名前/).fill('宜野湾 次郎');
  await field(page, /^年齢/).fill('１７');
  await field(page, /^メールアドレス/).fill('jiro@example.com');
  await form(page).getByRole('checkbox').check();
  await form(page).getByRole('button', { name: '送信する' }).click();
  await expect(page).toHaveURL(/\/contact\/thanks$/);

  expect(bodies[0]).toMatchObject({
    kind: 'other',
    organization: '〇〇会',
    message: '衣装について',
  });
  expect(bodies[1]).toMatchObject({ kind: 'join', age: 17 });
  expect(bodies[1]).not.toHaveProperty('organization');
});

test('問い合わせ：画面での入力チェック（まとめに移り、直すと消える）', async ({ page }) => {
  let requests = 0;
  await page.route(SUBMIT, async (route) => {
    requests += 1;
    await json(route, 200, { ok: true });
  });
  await page.goto('/contact');
  await form(page).getByRole('button', { name: '送信する' }).click();
  await expect(summary(page)).toBeFocused();
  await expect(summary(page).getByRole('heading')).toHaveText('入力内容を確認してください。');
  await expect(errorOf(page, 'kind')).toHaveText('お問い合わせの種類を選んでください。');

  await page.getByRole('radio', { name: '入会希望' }).check();
  await field(page, /^年齢/).fill('14');
  await field(page, /^メールアドレス/).fill('jiro@');
  await form(page).getByRole('button', { name: '送信する' }).click();
  await expect(errorOf(page, 'name')).toHaveText('お名前を入力してください。');
  await expect(errorOf(page, 'age')).toHaveText(
    '年齢は15から99までの数字で入力してください。入会の対象は高校生以上です。',
  );
  await expect(errorOf(page, 'email')).toHaveText(
    'メールアドレスの形式が正しくありません。例：example@example.com',
  );
  await expect(errorOf(page, 'privacy_agreed')).toHaveText(
    '送信するには、プライバシーポリシーへの同意が必要です。',
  );
  await expect(field(page, /^メールアドレス/)).toHaveAttribute('aria-invalid', 'true');
  await expect(summary(page).getByRole('link')).toHaveCount(4);
  await expectNoA11yViolations(page);

  // まとめのリンクで項目へ移る。直すとその場で消える
  await summary(page)
    .getByRole('link', { name: /メールアドレスの形式/ })
    .click();
  await expect(field(page, /^メールアドレス/)).toBeFocused();
  await field(page, /^メールアドレス/).fill('jiro@example.com');
  await expect(errorOf(page, 'email')).toBeHidden();
  await expect(field(page, /^メールアドレス/)).not.toHaveAttribute('aria-invalid', 'true');
  expect(requests).toBe(0);
});

test('EP-10 問い合わせ：Turnstile の失敗', async ({ page }) => {
  let requests = 0;
  await page.route(SUBMIT, async (route) => {
    requests += 1;
    await json(route, 200, { ok: true });
  });
  await page.addInitScript(() => {
    (window as unknown as { __tsMode: string }).__tsMode = 'error';
  });
  await page.goto('/contact');
  await expect(errorOf(page, 'turnstile')).toHaveText(
    '「人間であることの確認」を読み込めませんでした。ページを再読み込みしてください。',
  );
  await fillPerformance(page);
  await form(page).getByRole('button', { name: '送信する' }).click();
  await expect(errorOf(page, 'turnstile')).toHaveText(
    '「人間であることの確認」が終わるまでお待ちください。表示されない場合は、ページを再読み込みしてください。',
  );
  expect(requests).toBe(0);
});

test('EP-11 問い合わせ：サーバーのエラー（入力を残し、token を取り直す）', async ({ page }) => {
  const responses: [number, unknown][] = [
    [
      400,
      failure('invalid_input', {
        fields: { email: 'invalid_format', turnstile_token: 'required' },
      }),
    ],
    [403, failure('turnstile_failed')],
    [429, failure('rate_limited')],
    [429, failure('busy')],
    [500, 'not json'],
  ];
  await page.route(SUBMIT, async (route) => {
    const [status, body] = responses.shift() ?? [200, { ok: true }];
    if (typeof body === 'string') await route.fulfill({ status, body });
    else await json(route, status, body);
  });
  await page.goto('/contact');
  await fillPerformance(page);
  const send = () => form(page).getByRole('button', { name: '送信する' }).click();
  const heading = summary(page).getByRole('heading');

  await send();
  await expect(heading).toHaveText('入力内容を確認してください');
  await expect(summary(page)).toBeFocused();
  await expect(errorOf(page, 'email')).toHaveText(
    'メールアドレスの形式が正しくありません。例：example@example.com',
  );
  // 画面にない項目（turnstile_token）は項目の下に出さない
  await expect(summary(page).getByRole('link')).toHaveCount(1);
  await expect(field(page, /^担当者名/)).toHaveValue('  宜野湾 太郎  ');

  await send();
  await expect(heading).toHaveText('確認に失敗しました');
  await send();
  await expect(heading).toHaveText('しばらく時間をおいてお試しください');
  await expect(summary(page).getByRole('link', { name: 'InstagramのDM' })).toHaveAttribute(
    'href',
    'https://www.instagram.com/example',
  );
  await send();
  await expect(heading).toHaveText('ただいま混み合っています');
  await send();
  await expect(heading).toHaveText('送信できませんでした');
  await expect(summary(page)).toContainText('お問い合わせを受け付けできませんでした。');
  expect(await page.evaluate(() => (window as unknown as { __tsResets: number }).__tsResets)).toBe(
    5,
  );
  await expect(form(page).getByRole('button', { name: '送信する' })).toBeEnabled();
});

test('EP-11 問い合わせ：通信エラー', async ({ page }) => {
  await page.route(SUBMIT, (route) => route.abort('failed'));
  await page.goto('/contact');
  await fillPerformance(page);
  await form(page).getByRole('button', { name: '送信する' }).click();
  await expect(summary(page).getByRole('heading')).toHaveText('送信できませんでした');
  await expect(summary(page)).toContainText('通信できませんでした。');
});

test('EP-11a 問い合わせ：応答が遅い（10秒で案内、70秒で打ち切り）', async ({ page }) => {
  await page.clock.install({ time: FIXTURE_NOW });
  await page.route(SUBMIT, () => {
    // 応答を返さない
  });
  await page.goto('/contact');
  await fillPerformance(page);
  const button = form(page).getByRole('button', { name: /送信/ });
  await button.click();
  await expect(button).toHaveText('送信しています…');
  await expect(button).toBeDisabled();
  await expect(form(page)).toHaveAttribute('aria-busy', 'true');
  await expect(form(page).getByRole('status')).toHaveText('送信しています。');
  await page.clock.runFor(10_000);
  await expect(form(page).getByRole('status')).toHaveText(
    '時間がかかっています。画面を閉じずに、そのままお待ちください。',
  );
  // 二重送信しない
  await button.click({ force: true });
  await page.clock.runFor(60_000);
  await expect(summary(page).getByRole('heading')).toHaveText('応答がありませんでした');
  await expect(button).toHaveText('送信する');
  await expect(button).toBeEnabled();
});

test('EP-16 Instagram が未設定のとき：エラーの「InstagramのDM」はリンクにしない', async ({
  page,
}) => {
  await page.route(SUBMIT, (route) => json(route, 429, failure('busy')));
  await page.goto('/contact');
  // 固定データには Instagram があるため、フォームに渡す値だけ空にして確かめる
  await form(page).evaluate((el) => {
    (el as HTMLElement).dataset['instagramUrl'] = '';
  });
  await fillPerformance(page);
  await form(page).getByRole('button', { name: '送信する' }).click();
  await expect(summary(page)).toContainText('InstagramのDMでご連絡ください。');
  await expect(summary(page).getByRole('link', { name: 'InstagramのDM' })).toHaveCount(0);
});
