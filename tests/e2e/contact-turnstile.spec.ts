// 本物の Turnstile（公式のテスト用キー）でトークンが得られ、送信できるか（07 EP-09）
// 時計を固定すると Turnstile が時刻の誤り（200100）で失敗するため、fixtures.ts の test は使わない
import { expect, test } from '@playwright/test';
import { DUMMY_TOKEN } from './fixtures.ts';

test('問い合わせ：本物の Turnstile（テスト用キー）で送信できる', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', '外部のサービスを読むので PC の Chrome の1件だけ');
  let token: unknown = null;
  await page.route('**/functions/v1/submit-inquiry', async (route) => {
    token = (route.request().postDataJSON() as Record<string, unknown>)['turnstile_token'];
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.goto('/contact?kind=other');
  const form = page.locator('[data-contact-form]');
  await form.getByLabel(/^お名前/).fill('宜野湾 太郎');
  await form.getByLabel(/^メールアドレス/).fill('taro@example.com');
  await form.getByLabel(/^お問い合わせ内容/).fill('テスト');
  await form.getByRole('checkbox').check();
  // 確認が終わるまで待ってから送る
  await expect(form.locator('input[name="cf-turnstile-response"]')).toHaveValue(DUMMY_TOKEN, {
    timeout: 30_000,
  });
  await form.getByRole('button', { name: '送信する' }).click();
  await expect(page).toHaveURL(/\/contact\/thanks$/);
  expect(token).toBe(DUMMY_TOKEN);
});
