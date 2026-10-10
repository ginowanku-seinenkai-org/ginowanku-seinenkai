// 画面操作テスト（07 §6.1・§6.2）。build:fixture の dist を配信して確かめる
import { defineConfig, devices } from '@playwright/test';

const PORT = 4329;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
    { name: 'chrome', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm exec tsx tests/e2e/static-server.ts',
    url: `http://127.0.0.1:${PORT}/`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env['CI'],
  },
});
