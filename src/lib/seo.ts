// title・description・OGP・JSON-LD の生成（03 §11）
import { bodyToPlainText } from './plain-text.ts';
import { DESCRIPTIONS, SITE_NAME } from './messages.ts';
import { eventDatetime } from './date.ts';
import type { PublicPhoto, PublicPost, PublicSiteSettings } from './view-schemas.ts';

export const SITE_ORIGIN = 'https://ginowanku-seinenkai.com';
const DEFAULT_OG_IMAGE = {
  url: `${SITE_ORIGIN}/og-default.jpg`,
  width: 1200,
  height: 630,
  alt: SITE_NAME,
};
const DESCRIPTION_LENGTH = 120;

export interface MetaInput {
  /** ページの名前（トップは null） */
  name: string | null;
  /** 一覧の2ページ目以降のページ番号 */
  page?: number;
  description?: string;
  path: string;
  ogType?: 'website' | 'article';
  image?: PublicPhoto | null;
  /** canonical を出さない（404） */
  noCanonical?: boolean;
}

export interface PageMeta {
  title: string;
  description: string | null;
  canonical: string | null;
  ogType: 'website' | 'article';
  ogTitle: string;
  ogUrl: string;
  ogImage: { url: string; width: number; height: number; alt: string };
}

/** canonical などに使う絶対 URL（末尾スラッシュなし、.html なし。トップは /） */
export function absoluteUrl(path: string): string {
  const clean = path.replace(/\.html$/, '').replace(/\/+$/, '');
  return `${SITE_ORIGIN}${clean === '' ? '/' : clean}`;
}

/**
 * ページに自分の画像がないとき（共通の画像のまま）は、サイト設定の共通の画像に替える（03 §11、D-85）
 */
export function withSiteOgImage(meta: PageMeta, photo: PublicPhoto | undefined): PageMeta {
  if (!photo || meta.ogImage.url !== DEFAULT_OG_IMAGE.url) return meta;
  return {
    ...meta,
    ogImage: {
      url: `${SITE_ORIGIN}/photos/${photo.id}/full.jpg`,
      width: photo.width,
      height: photo.height,
      alt: photo.alt,
    },
  };
}

export function buildMeta(input: MetaInput): PageMeta {
  const name =
    input.name === null
      ? null
      : input.page !== undefined && input.page > 1
        ? `${input.name}（${input.page}ページ目）`
        : input.name;
  const title = name === null ? `${SITE_NAME}｜沖縄県宜野湾市` : `${name}｜${SITE_NAME}`;
  const url = absoluteUrl(input.path);
  const image = input.image
    ? {
        url: `${SITE_ORIGIN}/photos/${input.image.id}/full.jpg`,
        width: input.image.width,
        height: input.image.height,
        alt: input.image.alt,
      }
    : DEFAULT_OG_IMAGE;
  return {
    title,
    description: input.description ?? null,
    canonical: input.noCanonical ? null : url,
    ogType: input.ogType ?? 'website',
    ogTitle: name ?? SITE_NAME,
    ogUrl: url,
    ogImage: image,
  };
}

/** 本文の先頭120文字（超えたら「…」）。空なら fallback（03 §11.1） */
export function descriptionFromBody(body: unknown, fallback: string): string {
  const text = bodyToPlainText(body);
  if (text === '') return fallback;
  const chars = Array.from(text);
  return chars.length > DESCRIPTION_LENGTH
    ? `${chars.slice(0, DESCRIPTION_LENGTH).join('')}…`
    : text;
}

/** JSON-LD を埋め込める文字列にする（< を < に置き換える。03 §11.6） */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function organizationJsonLd(settings: PublicSiteSettings): Record<string, unknown> {
  const sameAs = [settings.instagram_url, settings.facebook_url, settings.tiktok_url].filter(
    (u): u is string => u !== null,
  );
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: `${SITE_ORIGIN}/`,
    logo: `${SITE_ORIGIN}/logo.png`,
    email: 'info@ginowanku-seinenkai.com',
    address: {
      '@type': 'PostalAddress',
      addressLocality: '宜野湾市',
      addressRegion: '沖縄県',
      addressCountry: 'JP',
    },
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

/** 行事の詳細の Event。場所や開始日時がなければ null（03 §11.6） */
export function eventJsonLd(
  post: PublicPost,
  description: string,
  cover: PublicPhoto | null,
): Record<string, unknown> | null {
  if (post.kind !== 'event' || post.event_place === null || post.event_starts_at === null)
    return null;
  const noTime = post.event_all_day || post.event_time_tbd;
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: post.title,
    // 終日・時間未定は日付だけ（03 §12.1、D-68）
    startDate: eventDatetime(post.event_starts_at, noTime),
    ...(post.event_ends_at !== null ? { endDate: eventDatetime(post.event_ends_at, noTime) } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: post.event_place,
      address: { '@type': 'PostalAddress', streetAddress: post.event_place, addressCountry: 'JP' },
    },
    description,
    ...(cover !== null ? { image: `${SITE_ORIGIN}/photos/${cover.id}/full.jpg` } : {}),
    organizer: { '@type': 'Organization', name: SITE_NAME, url: `${SITE_ORIGIN}/` },
    performer: { '@type': 'PerformingGroup', name: SITE_NAME },
    url: absoluteUrl(`/news/${post.id}`),
  };
}

export { DESCRIPTIONS };
