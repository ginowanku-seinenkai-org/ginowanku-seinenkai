// 公開用ビューの行の Zod スキーマと型（03 §3.4、01 §5）。fetch-data.ts と data.ts の両方で使う
// スキーマにない列は捨てる（Zod の既定）
import { z } from 'zod';

// 列の形（UUID、日付 YYYY-MM-DD、日時、1以上の整数）
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timestamp = z.string().min(1);
const positiveInt = z.number().int().min(1);

/** 記事の種類 */
export const postKindSchema = z.enum(['news', 'event', 'recruit', 'activity']);
/** 記事の種類 */
export type PostKind = z.infer<typeof postKindSchema>;
/** お知らせ系の種類（活動記録以外） */
export type NewsKind = Exclude<PostKind, 'activity'>;
/** お知らせ系の種類の並び */
export const NEWS_KINDS: readonly NewsKind[] = ['news', 'event', 'recruit'];

/** v_public_posts の行（公開中の記事） */
export const publicPostSchema = z.object({
  id: z.number().int().positive(),
  kind: postKindSchema,
  title: z.string(),
  body: z.unknown(),
  cover_photo_id: uuid.nullable(),
  event_starts_at: timestamp.nullable(),
  event_ends_at: timestamp.nullable(),
  event_all_day: z.boolean(),
  event_time_tbd: z.boolean(), // 時間未定（D-68）
  event_place: z.string().nullable(),
  published_on: ymd,
  updated_at: timestamp,
});
/** 公開中の記事 */
export type PublicPost = z.infer<typeof publicPostSchema>;

/** v_public_post_photos の行（記事の写真と並び順） */
export const publicPostPhotoSchema = z.object({
  post_id: z.number().int().positive(),
  photo_id: uuid,
  sort_order: z.number().int().min(0),
});
/** 記事の写真と並び順 */
export type PublicPostPhoto = z.infer<typeof publicPostPhotoSchema>;

/** v_public_pages の行（固定ページ） */
export const publicPageSchema = z.object({
  key: z.enum(['about', 'join', 'songs']),
  title: z.string(),
  lead: z.string().nullable(),
  body: z.unknown(),
  cover_photo_id: uuid.nullable(),
  updated_at: timestamp,
});
/** 固定ページ */
export type PublicPage = z.infer<typeof publicPageSchema>;

/** v_public_site_settings の行（サイト設定） */
export const publicSiteSettingsSchema = z.object({
  /** SNS で共有したときの共通の画像（D-85） */
  og_photo_id: uuid.nullable(),
  instagram_url: z.string().nullable(),
  tiktok_url: z.string().nullable(),
  join_age_label: z.string(),
});
/** サイト設定 */
export type PublicSiteSettings = z.infer<typeof publicSiteSettingsSchema>;

/** v_public_photos の行（公開してよい写真）。パスの形と長辺の上限も確かめる */
export const publicPhotoSchema = z
  .object({
    id: uuid,
    full_path: z.string(),
    thumb_path: z.string(),
    width: positiveInt,
    height: positiveInt,
    thumb_width: positiveInt,
    thumb_height: positiveInt,
    alt: z.string(),
  })
  .refine((p) => p.full_path === `${p.id}/full.jpg` && p.thumb_path === `${p.id}/thumb.jpg`, {
    message: 'full_path・thumb_path が {id}/full.jpg・{id}/thumb.jpg と一致しません',
  })
  .refine(
    (p) => Math.max(p.width, p.height) <= 1600 && Math.max(p.thumb_width, p.thumb_height) <= 480,
    {
      message: '写真の長辺が上限（1,600px・480px）を超えています',
    },
  );
/** 公開してよい写真 */
export type PublicPhoto = z.infer<typeof publicPhotoSchema>;

/** 取得したデータの情報（取得元・取得日時・今日の日付） */
export const metaSchema = z.object({
  source: z.enum(['supabase', 'fixture']),
  fetched_at: timestamp,
  today: ymd,
});
/** 取得したデータの情報 */
export type DataMeta = z.infer<typeof metaSchema>;

/** ビューごとの取得する列（select('*') は使わない。03 §3.2） */
export const VIEW_COLUMNS = {
  v_public_posts:
    'id,kind,title,body,cover_photo_id,event_starts_at,event_ends_at,event_all_day,event_time_tbd,event_place,published_on,updated_at',
  v_public_post_photos: 'post_id,photo_id,sort_order',
  v_public_pages: 'key,title,lead,body,cover_photo_id,updated_at',
  v_public_site_settings: 'instagram_url,tiktok_url,join_age_label,og_photo_id',
  v_public_photos: 'id,full_path,thumb_path,width,height,thumb_width,thumb_height,alt',
} as const;

/**
 * ページ分けで読むときの並び（行が一意に決まる列）。並びがないと、ページの境目で行が重なったり抜けたりしうる
 * サイト設定は1行だけなので並べない
 */
export const VIEW_ORDER: Record<keyof typeof VIEW_COLUMNS, readonly string[]> = {
  v_public_posts: ['id'],
  v_public_post_photos: ['post_id', 'sort_order', 'photo_id'],
  v_public_pages: ['key'],
  v_public_site_settings: [],
  v_public_photos: ['id'],
};
