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
  publicOfficerSchema,
  publicPageSchema,
  publicPhotoSchema,
  publicPostPhotoSchema,
  publicPostSchema,
  publicSiteSettingsSchema,
  type PublicOfficer,
  type PublicPage,
  type PublicPhoto,
  type PublicPost,
  type PublicPostPhoto,
  type PublicSiteSettings,
} from './view-schemas.ts';

/** ビルドで使う公開用のデータ一式（.data/ を検証したもの） */
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
  /** 役員の役職・氏名・写真。sort_order 昇順（D-121、D-122） */
  officers: PublicOfficer[];
  photos: Map<string, PublicPhoto>;
}

// 読めないときに添える案内
const HINT = '先に `pnpm fetch-data`（固定データなら `pnpm build:fixture`）を実行してください';

/**
 * .data/ の JSON ファイルを読む
 * @param dir .data/ のパス
 * @param name ファイル名
 * @returns 読んだ値（形はまだ確かめていない）
 * @throws ファイルが無い、または JSON として読めないとき
 */
async function readJson(dir: string, name: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(join(dir, name), 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`.data/${name} を読めません。${HINT}`, { cause: error });
  }
}

/**
 * 記事を新しい順に並べる比較関数：published_on の降順、同じなら id の降順
 * @param a 比べる記事
 * @param b 比べる記事
 * @returns sort に渡す比較の値
 */
export function comparePosts(a: PublicPost, b: PublicPost): number {
  if (a.published_on !== b.published_on) return a.published_on < b.published_on ? 1 : -1;
  return b.id - a.id;
}

/**
 * 役員を表示の順に並べる比較関数：sort_order の昇順（D-121）
 * @param a 比べる役員
 * @param b 比べる役員
 * @returns sort に渡す比較の値
 */
export function compareOfficers(a: PublicOfficer, b: PublicOfficer): number {
  return a.sort_order - b.sort_order;
}

/**
 * 役員の写真を探す（D-122）
 * @param officer 役員
 * @param photos 公開してよい写真（ID → 写真）
 * @returns 写真。photo_id が null か、公開用ビューに無ければ undefined
 */
export function officerPhoto(
  officer: PublicOfficer,
  photos: Map<string, PublicPhoto>,
): PublicPhoto | undefined {
  return officer.photo_id === null ? undefined : photos.get(officer.photo_id);
}

/**
 * 写真のない役員の枠に出す文字を作る：氏名の最初の1文字（D-122）。サロゲートペアの漢字も1文字として扱う
 * @param name 役員の氏名
 * @returns 最初の1文字。氏名が空なら空文字
 */
export function officerInitial(name: string): string {
  return Array.from(name.trim())[0] ?? '';
}

/**
 * .data/ を読んで検証し、SiteData を作る（03 §3.6）。本文の決まりの違反は警告だけ出す
 * @param root リポジトリのルート（.data/ と public/photos/ の親）
 * @returns 検証したデータ
 * @throws ファイルが読めない、列の形が違う、about・join が無い、写真ファイルが欠けているとき
 */
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
  const officers = z
    .array(publicOfficerSchema)
    .parse(await readJson(dir, 'officers.json'))
    .sort(compareOfficers);
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
    officers,
    photos,
  };
}

// 読み込み中・読み込み済みのデータ（1回だけ読むため）
let loading: Promise<SiteData> | undefined;

/**
 * サイトのデータを読む。1回のビルドで1回だけ読む（03 §3.6）
 * @returns 検証したデータ
 * @throws readSiteData() と同じ
 */
export function loadSiteData(): Promise<SiteData> {
  loading ??= readSiteData();
  return loading;
}

/**
 * renderBody() に渡す ctx を作る（03 §5.1）。写真が公開用ビューに無ければ警告を出して null を返す（ビルドは止めない）
 * @param data サイトのデータ
 * @param label 警告に出す、どの本文か（例：記事12の本文）
 * @returns renderBody() の ctx
 */
export function renderContext(data: SiteData, label: string): RenderContext {
  return {
    siteOrigin: SITE_ORIGIN,
    /**
     * 写真の ID から、本文の写真の出力に使う値を返す
     * @param photoId 写真の ID
     * @returns 表示用の値。公開用ビューに無ければ null
     */
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
