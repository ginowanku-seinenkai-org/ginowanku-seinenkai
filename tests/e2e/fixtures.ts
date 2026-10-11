// 画面操作テストの共通部品（07 §6.1）：時計を固定データの日付に合わせ、コンソールのエラーを集める
import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';

/** tests/fixtures/data/meta.json の today（日本時間の昼） */
export const FIXTURE_NOW = new Date('2026-10-10T12:00:00+09:00');

export const test = base.extend<{ consoleErrors: string[] }>({
  // すべてのテストで時計を固定データの日付に合わせる（auto）
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.clock.setFixedTime(FIXTURE_NOW);
      // Turnstile は外部のサービスなので、既定では代わりの部品を返す（実物は contact.spec.ts の1件だけ）
      await page.route(TURNSTILE_SCRIPT, (route) =>
        route.fulfill({ contentType: 'text/javascript', body: TURNSTILE_STUB }),
      );
      await use(errors);
    },
    { auto: true },
  ],
});

export { expect };

export const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js**';
/** Turnstile のテスト用キーが返すダミーのトークン（07 §5.1） */
export const DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

/**
 * Turnstile の代わり。window.__tsMode が 'error' なら読み込み失敗、'wait' なら確認が終わらない。
 * それ以外はすぐにダミーのトークンを渡す。reset の回数を window.__tsResets に数える
 */
const TURNSTILE_STUB = `
(() => {
  let options = null;
  const issue = () => {
    const mode = window.__tsMode || 'pass';
    if (mode === 'pass') setTimeout(() => options.callback(${JSON.stringify(DUMMY_TOKEN)}), 0);
    if (mode === 'error') setTimeout(() => options['error-callback'](), 0);
  };
  window.__tsResets = 0;
  window.turnstile = {
    render(el, o) {
      options = o;
      window.__tsOptions = { sitekey: o.sitekey, action: o.action, language: o.language };
      el.textContent = '確認（テスト用の代わりの部品）';
      issue();
      return 'stub';
    },
    reset() {
      window.__tsResets += 1;
      issue();
    },
  };
})();
`;

/** axe（WCAG 2.0／2.1 の A・AA）の違反が0件（07 §6.1、NF-03） */
export async function expectNoA11yViolations(page: Page) {
  // YouTube の埋め込みの中身は外部のサービスの部品なので検査しない
  const result = await new AxeBuilder({ page })
    .exclude('iframe')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}
