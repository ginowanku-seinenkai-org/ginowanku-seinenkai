// data.ts（03 §3.6）
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { readSiteData } from '../../src/lib/data.ts';
import { JPEG, PHOTO_ID, rows, tempDir } from './helpers.ts';

async function writeData(root: string, overrides: Record<string, unknown> = {}) {
  const dir = join(root, '.data');
  await mkdir(dir, { recursive: true });
  const files: Record<string, unknown> = {
    'meta.json': { source: 'fixture', fetched_at: '2026-10-10T00:00:00Z', today: '2026-10-10' },
    'posts.json': [
      rows.post,
      { ...rows.post, id: 2, published_on: '2026-10-02' },
      { ...rows.post, id: 3 },
    ],
    'post-photos.json': [
      { post_id: 1, photo_id: PHOTO_ID, sort_order: 1 },
      { post_id: 1, photo_id: PHOTO_ID, sort_order: 0 },
    ],
    'pages.json': [rows.page('about'), rows.page('join')],
    'site-settings.json': rows.settings,
    'officers.json': [
      rows.officer(2, '副会長', '宜野湾 二郎'),
      rows.officer(1, '会長', '宜野湾 一郎', PHOTO_ID, 'よろしくお願いします。'),
    ],
    'photos.json': [rows.photo()],
    ...overrides,
  };
  for (const [name, value] of Object.entries(files))
    await writeFile(join(dir, name), JSON.stringify(value));
}

async function writePhotos(root: string, files = ['full.jpg', 'thumb.jpg']) {
  await mkdir(join(root, 'public', 'photos', PHOTO_ID), { recursive: true });
  for (const f of files) await writeFile(join(root, 'public', 'photos', PHOTO_ID, f), JPEG);
}

describe('readSiteData', () => {
  it('検証して並べ替えた SiteData を作る', async () => {
    const root = await tempDir();
    await writeData(root);
    await writePhotos(root);
    const data = await readSiteData(root);
    expect(data.today).toBe('2026-10-10');
    expect(data.posts.map((p) => p.id)).toEqual([2, 3, 1]);
    expect(data.postPhotos.get(1)?.map((r) => r.sort_order)).toEqual([0, 1]);
    expect(data.photos.get(PHOTO_ID)?.alt).toBe('写真');
  });

  it('役員は sort_order の昇順に並べ、写真の ID・ひと言を持つ。年度の表示はサイト設定から読む（D-121、D-122、D-124、D-125）', async () => {
    const root = await tempDir();
    await writeData(root, {
      'site-settings.json': { ...rows.settings, officer_term_label: '令和8年度' },
    });
    await writePhotos(root);
    const data = await readSiteData(root);
    expect(data.officers.map((o) => [o.role, o.name, o.photo_id, o.message])).toEqual([
      ['会長', '宜野湾 一郎', PHOTO_ID, 'よろしくお願いします。'],
      ['副会長', '宜野湾 二郎', null, null],
    ]);
    expect(data.settings.officer_term_label).toBe('令和8年度');
  });

  it('役員が0人でも読める。officers.json が無ければ失敗する（D-121）', async () => {
    const root = await tempDir();
    await writeData(root, { 'officers.json': [] });
    await writePhotos(root);
    expect((await readSiteData(root)).officers).toEqual([]);

    const missing = await tempDir();
    await writeData(missing);
    await writePhotos(missing);
    await rm(join(missing, '.data', 'officers.json'));
    await expect(readSiteData(missing)).rejects.toThrow('officers.json');
  });

  it('曲目一覧は、行がない・本文が空なら null、本文があれば出す（03 S13、D-81）', async () => {
    const withBody = (key: 'songs') => ({
      ...rows.page(key),
      body: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '曲' }] }],
      },
    });
    for (const [pages, expected] of [
      [[rows.page('about'), rows.page('join')], null],
      [[rows.page('about'), rows.page('join'), rows.page('songs')], null],
      [[rows.page('about'), rows.page('join'), withBody('songs')], 'songs'],
    ] as const) {
      const root = await tempDir();
      await writeData(root, { 'pages.json': pages });
      await writePhotos(root);
      expect((await readSiteData(root)).pages.songs?.key ?? null).toBe(expected);
    }
  });

  it('.data/ が無ければ準備のコマンドを案内する', async () => {
    await expect(readSiteData(await tempDir())).rejects.toThrow('pnpm fetch-data');
  });

  it('写真ファイルが欠けていれば失敗する', async () => {
    const root = await tempDir();
    await writeData(root);
    await writePhotos(root, ['full.jpg']);
    await expect(readSiteData(root)).rejects.toThrow(`${PHOTO_ID}/thumb.jpg`);
  });

  it('本文に許可外の要素があっても止めずに警告を出す（03 §5.2）', async () => {
    const root = await tempDir();
    await writeData(root, {
      'posts.json': [{ ...rows.post, body: { type: 'doc', content: [{ type: 'script' }] } }],
    });
    await writePhotos(root);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await readSiteData(root);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('記事1の本文'));
    warn.mockRestore();
  });
});
