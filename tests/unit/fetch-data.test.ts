// fetch-data（03 §3.5、§3.3。Supabase は差し替え）
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QueryError, fetchData, type ViewReader } from '../../scripts/fetch-data.ts';
import { PHOTO_ID, rows, tempDir } from './helpers.ts';

type View = Parameters<ViewReader['read']>[0];

function reader(data: Partial<Record<View, unknown[]>>, calls: string[] = []): ViewReader {
  const all: Record<View, unknown[]> = {
    v_public_posts: [rows.post],
    v_public_post_photos: [],
    v_public_pages: [rows.page('about'), rows.page('join')],
    v_public_site_settings: [rows.settings],
    v_public_officers: [
      rows.officer(2, '副会長', '宜野湾 二郎'),
      rows.officer(1, '会長', '宜野湾 一郎', PHOTO_ID, 'よろしくお願いします。'),
    ],
    v_public_photos: [rows.photo()],
    ...data,
  };
  return {
    async read(view, from, to) {
      calls.push(`${view}:${from}-${to}`);
      return all[view].slice(from, to + 1);
    },
  };
}

const noSleep = async () => {};

describe('fetchData', () => {
  it('.data/ に8つのファイルを書き、photo-ids.txt は昇順・各行 LF', async () => {
    const root = await tempDir();
    const ids = [
      'ffffffff-0000-4000-8000-000000000000',
      PHOTO_ID,
      'aaaaaaaa-0000-4000-8000-000000000000',
    ];
    await fetchData({
      reader: reader({ v_public_photos: ids.map((id) => rows.photo(id)) }),
      root,
      now: new Date('2026-10-09T15:00:00Z'),
      log: () => {},
    });
    expect((await readdir(join(root, '.data'))).sort()).toEqual([
      'meta.json',
      'officers.json',
      'pages.json',
      'photo-ids.txt',
      'photos.json',
      'post-photos.json',
      'posts.json',
      'site-settings.json',
    ]);
    expect(await readFile(join(root, '.data', 'photo-ids.txt'), 'utf8')).toBe(
      [...ids]
        .sort()
        .map((id) => `${id}\n`)
        .join(''),
    );
    expect(JSON.parse(await readFile(join(root, '.data', 'meta.json'), 'utf8'))).toEqual({
      source: 'supabase',
      fetched_at: '2026-10-09T15:00:00.000Z',
      today: '2026-10-10',
    });
    // 役員は sort_order の昇順で、写真の ID・ひと言を持つ（D-121、D-122、D-124、D-125）
    const officers = JSON.parse(await readFile(join(root, '.data', 'officers.json'), 'utf8')) as {
      sort_order: number;
      photo_id: string | null;
      message: string | null;
    }[];
    expect(officers.map((o) => [o.sort_order, o.photo_id, o.message])).toEqual([
      [1, PHOTO_ID, 'よろしくお願いします。'],
      [2, null, null],
    ]);
  });

  it('1,000件ずつ繰り返し、1,000件未満で終える', async () => {
    const root = await tempDir();
    const calls: string[] = [];
    const posts = Array.from({ length: 2000 }, (_, i) => ({ ...rows.post, id: i + 1 }));
    await fetchData({ reader: reader({ v_public_posts: posts }, calls), root, log: () => {} });
    expect(calls.filter((c) => c.startsWith('v_public_posts'))).toEqual([
      'v_public_posts:0-999',
      'v_public_posts:1000-1999',
      'v_public_posts:2000-2999',
    ]);
  });

  it('通信エラーは3回まで再試行し、DB のエラー（コードあり）は再試行しない', async () => {
    let failures = 0;
    const flaky: ViewReader = {
      async read(view, from, to) {
        if (view === 'v_public_posts' && failures < 2) {
          failures += 1;
          throw new TypeError('fetch failed');
        }
        return reader({}).read(view, from, to);
      },
    };
    await fetchData({ reader: flaky, root: await tempDir(), sleep: noSleep, log: () => {} });
    expect(failures).toBe(2);

    let calls = 0;
    const denied: ViewReader = {
      async read() {
        calls += 1;
        throw new QueryError('permission denied', '42501');
      },
    };
    await expect(
      fetchData({ reader: denied, root: await tempDir(), sleep: noSleep, log: () => {} }),
    ).rejects.toThrow('permission denied');
    expect(calls).toBe(1);
  });

  it('about・join が無い、設定がちょうど1行でないと失敗し、.data/ を作らない', async () => {
    const root = await tempDir();
    await expect(
      fetchData({ reader: reader({ v_public_pages: [rows.page('about')] }), root, log: () => {} }),
    ).rejects.toThrow('about と join');
    await expect(
      fetchData({ reader: reader({ v_public_site_settings: [] }), root, log: () => {} }),
    ).rejects.toThrow('ちょうど1行');
    await expect(readdir(join(root, '.data'))).rejects.toThrow();
  });

  it('ビューの行が型に合わなければ失敗する（写真のパスの形）', async () => {
    const bad = { ...rows.photo(), full_path: 'x/full.jpg' };
    await expect(
      fetchData({
        reader: reader({ v_public_photos: [bad] }),
        root: await tempDir(),
        log: () => {},
      }),
    ).rejects.toThrow();
  });
});
