// 固定データを .data/ と public/photos/ に置く（build:fixture。03 §2.3、D-21）
// ネットワークと環境変数を使わない。ローカルで fetch-data した内容は上書きされる
import { cp, mkdir, rm } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

// リポジトリのルート
const root = resolve(import.meta.dirname, '..');

// コピーする固定データ（コピー元 → コピー先）
const copies = [
  { from: 'tests/fixtures/data', to: '.data' },
  { from: 'tests/fixtures/photos', to: 'public/photos' },
] as const;

for (const { from, to } of copies) {
  const dest = resolve(root, to);
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  await cp(resolve(root, from), dest, {
    recursive: true,
    // 空のフォルダを Git に残すための .gitkeep はコピーしない
    filter: (src) => basename(src) !== '.gitkeep',
  });
  console.log(`${from} → ${to}`);
}
