// 公開用ビューを読み .data/ に保存する（03 §3.5）。Supabase に接続するのはここと fetch-photos.ts だけ
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { todayJst } from '../src/lib/date.ts';
import { getEnv } from '../src/lib/env.ts';
import {
  VIEW_COLUMNS,
  VIEW_ORDER,
  publicPageSchema,
  publicPhotoSchema,
  publicPostPhotoSchema,
  publicPostSchema,
  publicSiteSettingsSchema,
} from '../src/lib/view-schemas.ts';
import { isMain, withRetry } from './retry.ts';

const PAGE = 1000;

/** fetch-data が使う Supabase の機能だけ（テストで差し替える） */
export interface ViewReader {
  read(view: keyof typeof VIEW_COLUMNS, from: number, to: number): Promise<unknown[]>;
}

export class QueryError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
  ) {
    super(message);
  }
}

export function supabaseViewReader(url: string, key: string): ViewReader {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async read(view, from, to) {
      let query = client.from(view).select(VIEW_COLUMNS[view]);
      for (const column of VIEW_ORDER[view]) query = query.order(column, { ascending: true });
      const { data, error } = await query.range(from, to);
      if (error) throw new QueryError(`${view}：${error.message}`, error.code || undefined);
      return data ?? [];
    },
  };
}

/** 権限エラーなど DB が返したエラーは再試行しない。通信エラー（コードなし）だけ再試行する */
const isNetworkError = (error: unknown) =>
  !(error instanceof QueryError) || error.code === undefined;

async function readAll(
  reader: ViewReader,
  view: keyof typeof VIEW_COLUMNS,
  sleep?: (ms: number) => Promise<void>,
) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await withRetry(
      () => reader.read(view, from, from + PAGE - 1),
      isNetworkError,
      sleep,
    );
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

export interface FetchDataOptions {
  reader: ViewReader;
  root?: string;
  now?: Date;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

export async function fetchData({
  reader,
  root = process.cwd(),
  now = new Date(),
  sleep,
  log = console.log,
}: FetchDataOptions) {
  const posts = z
    .array(publicPostSchema)
    .parse(await readAll(reader, 'v_public_posts', sleep))
    .sort((a, b) =>
      a.published_on === b.published_on ? b.id - a.id : a.published_on < b.published_on ? 1 : -1,
    );
  const postPhotos = z
    .array(publicPostPhotoSchema)
    .parse(await readAll(reader, 'v_public_post_photos', sleep))
    .sort((a, b) => a.post_id - b.post_id || a.sort_order - b.sort_order);
  const pages = z.array(publicPageSchema).parse(await readAll(reader, 'v_public_pages', sleep));
  const settingsRows = z
    .array(publicSiteSettingsSchema)
    .parse(await readAll(reader, 'v_public_site_settings', sleep));
  const photos = z
    .array(publicPhotoSchema)
    .parse(await readAll(reader, 'v_public_photos', sleep))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  if (!pages.some((p) => p.key === 'about') || !pages.some((p) => p.key === 'join')) {
    throw new Error('v_public_pages に about と join がありません');
  }
  const [settings] = settingsRows;
  if (settingsRows.length !== 1 || settings === undefined) {
    throw new Error(
      `v_public_site_settings がちょうど1行ではありません（${settingsRows.length}行）`,
    );
  }

  // 一時ディレクトリに書いてから入れ替える（途中で止まっても中途半端な .data/ を残さない）
  const tmp = join(root, '.data.tmp');
  const dest = join(root, '.data');
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const write = (name: string, value: unknown) =>
    writeFile(join(tmp, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await write('posts.json', posts);
  await write('post-photos.json', postPhotos);
  await write('pages.json', pages);
  await write('site-settings.json', settings);
  await write('photos.json', photos);
  await writeFile(join(tmp, 'photo-ids.txt'), photos.map((p) => `${p.id}\n`).join(''), 'utf8');
  await write('meta.json', {
    source: 'supabase',
    fetched_at: now.toISOString(),
    today: todayJst(now),
  });
  await rm(dest, { recursive: true, force: true });
  await rename(tmp, dest);

  log(
    `fetch-data：記事 ${posts.length}件、ギャラリー ${postPhotos.length}件、固定ページ ${pages.length}件、写真 ${photos.length}件`,
  );
}

if (isMain(import.meta.url)) {
  const env = getEnv();
  fetchData({ reader: supabaseViewReader(env.supabaseUrl, env.supabasePublishableKey) }).catch(
    (error: unknown) => {
      console.error('fetch-data に失敗しました：', error);
      process.exit(1);
    },
  );
}
