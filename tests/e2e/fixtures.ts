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
      await use(errors);
    },
    { auto: true },
  ],
});

export { expect };

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
