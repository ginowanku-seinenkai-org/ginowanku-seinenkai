// .data/ を読んで検証し SiteData を作る（03 §3.6）。build 時だけ使い、Supabase に接続しない
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { RenderContext } from './content/types.ts';
import { validateBody } from './content/validate-body.ts';
import { photoSrc } from './posts.ts';
import { SITE_ORIGIN } from './seo.ts';
import { isEmptyBody } from './plain-text.ts';
import {
  metaSchema,
  publicPageSchema,
  publicPhotoSchema,
  publicPostPhotoSchema,
  publicPostSchema,
  publicSiteSettingsSchema,
  type PublicPage,
  type PublicPhoto,
  type PublicPost,
  type PublicPostPhoto,
  type PublicSiteSettings,
} from './view-schemas.ts';

export interface SiteData {
  source: 'supabase' | 'fixture';
  /** meta.json の today（日本時間 'YYYY-MM-DD'） */
  today: string;
  /** published_on 降順、id 降順 */
  posts: PublicPost[];
  /** sort_order 昇順 */
  postPhotos: Map<number, PublicPostPhoto[]>;
  /** songs は本文が空なら null（ページもナビも作らない。03 S13、D-81） */
  pages: Record<'about' | 'join', PublicPage> & { songs: PublicPage | null };
  settings: PublicSiteSettings;
  photos: Map<string, PublicPhoto>;
}

const HINT = '先に `pnpm fetch-data`（固定データなら `pnpm build:fixture`）を実行してください';

async function readJson(dir: string, name: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(join(dir, name), 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`.data/${name} を読めません。${HINT}`, { cause: error });
  }
}

export function comparePosts(a: PublicPost, b: PublicPost): number {
  if (a.published_on !== b.published_on) return a.published_on < b.published_on ? 1 : -1;
  return b.id - a.id;
}

export async function readSiteData(root: string = process.cwd()): Promise<SiteData> {
  const dir = join(root, '.data');
  const meta = metaSchema.parse(await readJson(dir, 'meta.json'));
  const posts = z
    .array(publicPostSchema)
    .parse(await readJson(dir, 'posts.json'))
    .sort(comparePosts);
  const postPhotoRows = z
    .array(publicPostPhotoSchema)
    .parse(await readJson(dir, 'post-photos.json'));
  const pageRows = z.array(publicPageSchema).parse(await readJson(dir, 'pages.json'));
  const settings = publicSiteSettingsSchema.parse(await readJson(dir, 'site-settings.json'));
  const photoRows = z.array(publicPhotoSchema).parse(await readJson(dir, 'photos.json'));

  const about = pageRows.find((p) => p.key === 'about');
  const joinPage = pageRows.find((p) => p.key === 'join');
  if (about === undefined || joinPage === undefined)
    throw new Error('.data/pages.json に about と join がありません');
  // 曲目一覧は行がなくても失敗しない（DB に行を足す前の反映のため。D-81）
  const songsRow = pageRows.find((p) => p.key === 'songs');
  const songs = songsRow && !isEmptyBody(songsRow.body) ? songsRow : null;

  const postPhotos = new Map<number, PublicPostPhoto[]>();
  for (const row of [...postPhotoRows].sort(
    (a, b) => a.post_id - b.post_id || a.sort_order - b.sort_order,
  )) {
    const list = postPhotos.get(row.post_id) ?? [];
    list.push(row);
    postPhotos.set(row.post_id, list);
  }
  const photos = new Map(photoRows.map((p) => [p.id, p]));

  // 写真ファイルの欠けたページを出さない（03 §3.6）
  const missing: string[] = [];
  for (const photo of photoRows) {
    for (const file of ['full.jpg', 'thumb.jpg']) {
      try {
        await access(join(root, 'public', 'photos', photo.id, file));
      } catch {
        missing.push(`${photo.id}/${file}`);
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `public/photos/ に写真ファイルがありません：${missing.join('、')}。先に \`pnpm fetch-photos\` を実行してください`,
    );
  }

  // 本文の確認（03 §5.2）。違反は警告だけで、ビルドは止めない
  const bodies: [string, unknown][] = [
    ...posts.map((p): [string, unknown] => [`記事${p.id}の本文`, p.body]),
    [`固定ページ about の本文`, about.body],
    [`固定ページ join の本文`, joinPage.body],
    ...(songs ? [[`固定ページ songs の本文`, songs.body] as [string, unknown]] : []),
    ['サイト設定の依頼の流れ', settings.contact_flow],
  ];
  for (const [label, body] of bodies) {
    const result = validateBody(body);
    if (!result.valid) {
      const detail = result.errors
        .map((e) => `${e.code}${e.name ? `(${e.name})` : ''}${e.path ? ` @${e.path}` : ''}`)
        .join('、');
      console.warn(`[validateBody] ${label}：${detail}`);
    }
  }

  return {
    source: meta.source,
    today: meta.today,
    posts,
    postPhotos,
    pages: { about, join: joinPage, songs },
    settings,
    photos,
  };
}

let loading: Promise<SiteData> | undefined;

/** 1回のビルドで1回だけ読む（03 §3.6） */
export function loadSiteData(): Promise<SiteData> {
  loading ??= readSiteData();
  return loading;
}

/** renderBody() に渡す ctx（03 §5.1）。写真が公開用ビューに無ければ警告を出して null を返す（ビルドは止めない） */
export function renderContext(data: SiteData, label: string): RenderContext {
  return {
    siteOrigin: SITE_ORIGIN,
    resolvePhoto(photoId) {
      const photo = data.photos.get(photoId);
      if (photo === undefined) {
        console.warn(`[renderBody] ${label}の写真${photoId}が公開用ビューにありません`);
        return null;
      }
      return {
        src: photoSrc(photo, 'full'),
        thumbSrc: photoSrc(photo, 'thumb'),
        width: photo.width,
        height: photo.height,
        thumbWidth: photo.thumb_width,
        thumbHeight: photo.thumb_height,
        alt: photo.alt,
      };
    },
  };
}
