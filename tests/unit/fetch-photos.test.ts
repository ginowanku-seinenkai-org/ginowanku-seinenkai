// fetch-photos（03 §4。Storage は差し替え）
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkJpeg, fetchPhotos, type PhotoDownloader } from '../../scripts/fetch-photos.ts';
import { JPEG, tempDir } from './helpers.ts';

const A = 'aaaaaaaa-0000-4000-8000-000000000000';
const B = 'bbbbbbbb-0000-4000-8000-000000000000';

async function setup(ids: string[]) {
  const root = await tempDir();
  await mkdir(join(root, '.data'), { recursive: true });
  await writeFile(join(root, '.data', 'photo-ids.txt'), ids.map((id) => `${id}\n`).join(''));
  return root;
}

function downloader(paths: string[] = [], body: Uint8Array = JPEG): PhotoDownloader {
  return {
    async download(path) {
      paths.push(path);
      return body;
    },
  };
}

const quiet = { log: () => {}, sleep: async () => {} };

describe('fetchPhotos', () => {
  it('キャッシュに無い写真だけを取り込み、public/photos/ には一覧の写真だけを置く', async () => {
    const root = await setup([A, B]);
    await mkdir(join(root, '.cache', 'photos', A), { recursive: true });
    await writeFile(join(root, '.cache', 'photos', A, 'full.jpg'), JPEG);
    await writeFile(join(root, '.cache', 'photos', A, 'thumb.jpg'), JPEG);
    await mkdir(join(root, '.cache', 'photos', 'cccccccc-0000-4000-8000-000000000000'), {
      recursive: true,
    });
    await mkdir(join(root, 'public', 'photos', 'old'), { recursive: true });

    const paths: string[] = [];
    await fetchPhotos({ downloader: downloader(paths), root, ...quiet });

    expect(paths.sort()).toEqual([`${B}/full.jpg`, `${B}/thumb.jpg`]);
    expect((await readdir(join(root, '.cache', 'photos'))).sort()).toEqual([A, B]);
    expect((await readdir(join(root, 'public', 'photos'))).sort()).toEqual([A, B]);
    expect((await readdir(join(root, 'public', 'photos', B))).sort()).toEqual([
      'full.jpg',
      'thumb.jpg',
    ]);
  });

  it('photo-ids.txt が無ければ案内を出して失敗する', async () => {
    await expect(
      fetchPhotos({ downloader: downloader(), root: await tempDir(), ...quiet }),
    ).rejects.toThrow('pnpm fetch-data');
  });

  it('JPEG でないものは失敗し、キャッシュにもファイルを残さない', async () => {
    const root = await setup([A]);
    await expect(
      fetchPhotos({
        downloader: downloader([], new Uint8Array([0x89, 0x50, 0x4e])),
        root,
        ...quiet,
      }),
    ).rejects.toThrow('JPEG ではありません');
    expect(await readdir(join(root, '.cache', 'photos', A))).toEqual([]);
  });

  it('失敗は3回まで再試行する', async () => {
    const root = await setup([A]);
    let count = 0;
    const flaky: PhotoDownloader = {
      async download() {
        count += 1;
        if (count <= 3) throw new Error('通信エラー');
        return JPEG;
      },
    };
    await fetchPhotos({ downloader: flaky, root, ...quiet });
    expect(count).toBe(5);
  });

  it('checkJpeg：2,000,000バイトを超えると失敗', () => {
    const big = new Uint8Array(2_000_001);
    big.set([0xff, 0xd8, 0xff]);
    expect(() => checkJpeg('x', big)).toThrow('2000000');
    expect(() => checkJpeg('x', JPEG)).not.toThrow();
  });
});
