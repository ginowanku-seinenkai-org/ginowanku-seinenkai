// .data/photo-ids.txt の写真を .cache/photos/ 経由で取り込み、public/photos/ に置く（03 §4）
import { access, cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../src/lib/env.ts';
import { isMain, withRetry } from './retry.ts';

const FILES = ['full.jpg', 'thumb.jpg'] as const;
const MAX_BYTES = 2_000_000;
const CONCURRENCY = 4;

/** fetch-photos が使う Storage の機能だけ（テストで差し替える） */
export interface PhotoDownloader {
  download(path: string): Promise<Uint8Array>;
}

export function supabasePhotoDownloader(url: string, key: string): PhotoDownloader {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async download(path) {
      const { data, error } = await client.storage.from('photos').download(path);
      if (error || data === null)
        throw new Error(`${path}：${error?.message ?? 'データがありません'}`);
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/** JPEG の印（FF D8 FF）と容量を確かめる */
export function checkJpeg(path: string, bytes: Uint8Array): void {
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new Error(`${path}：JPEG ではありません`);
  }
  if (bytes.length > MAX_BYTES)
    throw new Error(`${path}：${MAX_BYTES}バイトを超えています（${bytes.length}バイト）`);
}

export interface FetchPhotosOptions {
  downloader: PhotoDownloader;
  root?: string;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

export async function fetchPhotos({
  downloader,
  root = process.cwd(),
  sleep,
  log = console.log,
}: FetchPhotosOptions) {
  let list: string;
  try {
    list = await readFile(join(root, '.data', 'photo-ids.txt'), 'utf8');
  } catch {
    throw new Error('.data/photo-ids.txt がありません。先に `pnpm fetch-data` を実行してください');
  }
  const ids = list.split('\n').filter((line) => line !== '');
  const cacheDir = join(root, '.cache', 'photos');
  await mkdir(cacheDir, { recursive: true });

  let downloaded = 0;
  let cached = 0;
  const failures: string[] = [];
  const queue = [...ids];
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      const dir = join(cacheDir, id);
      const present = await Promise.all(FILES.map((f) => exists(join(dir, f))));
      if (present.every(Boolean)) {
        cached += 1;
        continue;
      }
      try {
        await mkdir(dir, { recursive: true });
        for (const file of FILES) {
          const path = `${id}/${file}`;
          const bytes = await withRetry(
            () => downloader.download(path),
            () => true,
            sleep,
          );
          checkJpeg(path, bytes);
          const tmp = join(dir, `${file}.tmp`);
          await writeFile(tmp, bytes);
          await rename(tmp, join(dir, file));
        }
        downloaded += 1;
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // 一覧にない写真をキャッシュから消す（03 §4.3）
  const keep = new Set(ids);
  let removed = 0;
  for (const name of await readdir(cacheDir)) {
    if (!keep.has(name)) {
      await rm(join(cacheDir, name), { recursive: true, force: true });
      removed += 1;
    }
  }

  log(
    `fetch-photos：取得 ${downloaded}件、キャッシュから ${cached}件、キャッシュから削除 ${removed}件`,
  );
  if (failures.length > 0) throw new Error(`写真の取得に失敗しました：\n${failures.join('\n')}`);

  // public/photos/ を空にしてから、一覧にある写真だけを置く
  const publicDir = join(root, 'public', 'photos');
  await rm(publicDir, { recursive: true, force: true });
  await mkdir(publicDir, { recursive: true });
  for (const id of ids) await cp(join(cacheDir, id), join(publicDir, id), { recursive: true });
}

if (isMain(import.meta.url)) {
  const env = getEnv();
  fetchPhotos({
    downloader: supabasePhotoDownloader(env.supabaseUrl, env.supabasePublishableKey),
  }).catch((error: unknown) => {
    console.error('fetch-photos に失敗しました：', error);
    process.exit(1);
  });
}
