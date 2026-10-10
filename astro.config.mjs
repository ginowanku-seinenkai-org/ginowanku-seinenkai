import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const EXCLUDE = ['/contact/thanks', '/404'];

export default defineConfig({
  site: 'https://ginowanku-seinenkai.com',
  output: 'static',
  trailingSlash: 'never',
  outDir: './dist',
  build: {
    format: 'file', // /about → about.html
    inlineStylesheets: 'never', // CSS をインラインにしない（CSP）
    assets: '_astro',
  },
  prefetch: false,
  vite: {
    build: { assetsInlineLimit: 0 }, // 小さいスクリプトのインライン化を防ぐ（要確認、§12.3 で検査）
  },
  integrations: [
    sitemap({
      filter: (page) => !EXCLUDE.some((p) => new URL(page).pathname.replace(/\.html$/, '') === p),
      serialize: (item) => ({ ...item, url: item.url.replace(/\.html$/, '') }),
    }),
  ],
});
