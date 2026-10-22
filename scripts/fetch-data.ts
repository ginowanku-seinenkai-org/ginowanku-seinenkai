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

// 1回に読む行数（ページ分けで全件を読む）
const PAGE = 1000;

/** fetch-data が使う Supabase の機能だけ（テストで差し替える） */
export interface ViewReader {
  /**
   * ビューの行を範囲を指定して読む
   * @param view ビューの名前
   * @param from 最初の行の番号（0から）
   * @param to 最後の行の番号（含む）
   * @returns 読んだ行（形はまだ確かめていない）
   */
  read(view: keyof typeof VIEW_COLUMNS, from: number, to: number): Promise<unknown[]>;
}

/** DB が返したエラー。code があれば再試行しない */
export class QueryError extends Error {
  /**
   * DB のエラーを作る
   * @param message エラーの文（ビューの名前と DB の文）
   * @param code DB のエラーコード。無ければ undefined（通信エラーとして再試行する）
   */
  constructor(
    message: string,
    readonly code: string | undefined,
  ) {
    super(message);
  }
}

/**
 * Supabase の公開用ビューを読む ViewReader を作る。セッションは保存しない
 * @param url Supabase の URL
 * @param key publishable キー
 * @returns ViewReader
 */
export function supabaseViewReader(url: string, key: string): ViewReader {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    /** VIEW_COLUMNS の列だけを、VIEW_ORDER の並びで読む。DB のエラーは QueryError にする */
    async read(view, from, to) {
      let query = client.from(view).select(VIEW_COLUMNS[view]);
      for (const column of VIEW_ORDER[view]) query = query.order(column, { ascending: true });
      const { data, error } = await query.range(from, to);
      if (error) throw new QueryError(`${view}：${error.message}`, error.code || undefined);
      return data ?? [];
    },
  };
}

/**
 * 再試行するエラーかを決める。権限エラーなど DB が返したエラーは再試行しない。通信エラー（コードなし）だけ再試行する
 * @param error 起きたエラー
 * @returns 再試行するなら true
 */
const isNetworkError = (error: unknown) =>
  !(error instanceof QueryError) || error.code === undefined;

/**
 * ビューの全行を PAGE 行ずつ読む。通信エラーは withRetry() で再試行する
 * @param reader ビューを読む関数
 * @param view ビューの名前
 * @param sleep 待つ関数（テストで差し替える）
 * @returns 全行（形はまだ確かめていない）
 */
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

/** fetchData() の引数。reader 以外はテストで差し替える */
export interface FetchDataOptions {
  reader: ViewReader;
  root?: string;
  now?: Date;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

/**
 * 公開用ビューを読んで検証し、.data/ に JSON で保存する（03 §3.5）。写真の ID の一覧は photo-ids.txt に書く
 * 一時ディレクトリに書いてから入れ替える
 * @param options ビューを読む関数、リポジトリのルート、今の日時、待つ関数、ログの出し先
 * @throws 読めない、列の形が違う、about・join が無い、サイト設定がちょうど1行でないとき
 */
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
  /**
   * 一時ディレクトリに JSON を書く
   * @param name ファイル名
   * @param value 書く値
   */
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
