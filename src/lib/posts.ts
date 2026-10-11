// 並び替え、ページ分割、URL、終了判定（03 §3.7、§6.3、§7）
import type { SiteData } from './data.ts';
import { jstDate } from './date.ts';
import type { NewsKind, PublicPhoto, PublicPost } from './view-schemas.ts';

export const PAGE_SIZE = 12;

export function postUrl(post: Pick<PublicPost, 'id' | 'kind'>): string {
  return post.kind === 'activity' ? `/activities/${post.id}` : `/news/${post.id}`;
}

/** 行事の終了日（日本時間）。行事以外・開始日時がないものは null */
export function eventEndDate(post: PublicPost): string | null {
  if (post.kind !== 'event') return null;
  const end = post.event_ends_at ?? post.event_starts_at;
  return end === null ? null : jstDate(end);
}

/** 01 §3.2 の判定：終了日が今日より前なら終了 */
export function isEnded(post: PublicPost, today: string): boolean {
  const end = eventEndDate(post);
  return end !== null && end < today;
}

function byStartAsc(a: PublicPost, b: PublicPost): number {
  return (a.event_starts_at ?? '').localeCompare(b.event_starts_at ?? '') || a.id - b.id;
}

/** お知らせ系の一覧（03 §6.3）。行事のカテゴリは、終了していないものを開始の早い順 → 終了したものを開始の遅い順 */
export function newsPosts(data: SiteData, kind?: NewsKind): PublicPost[] {
  const items = data.posts.filter((p) =>
    kind === undefined ? p.kind !== 'activity' : p.kind === kind,
  );
  if (kind !== 'event') return items;
  const upcoming = items.filter((p) => !isEnded(p, data.today)).sort(byStartAsc);
  const ended = items.filter((p) => isEnded(p, data.today)).sort((a, b) => byStartAsc(b, a));
  return [...upcoming, ...ended];
}

export function activityPosts(data: SiteData): PublicPost[] {
  return data.posts.filter((p) => p.kind === 'activity');
}

export function upcomingEvents(data: SiteData, limit: number): PublicPost[] {
  return data.posts
    .filter((p) => p.kind === 'event' && !isEnded(p, data.today))
    .sort(byStartAsc)
    .slice(0, limit);
}

export interface Page<T> {
  items: T[];
  currentPage: number;
  lastPage: number;
}

/** ページ分割。1件もなくても1ページ目（空）を返す */
export function paginate<T>(items: T[], size: number = PAGE_SIZE): Page<T>[] {
  const lastPage = Math.max(1, Math.ceil(items.length / size));
  return Array.from({ length: lastPage }, (_, i) => ({
    items: items.slice(i * size, (i + 1) * size),
    currentPage: i + 1,
    lastPage,
  }));
}

/** 一覧のページの URL（1ページ目は /page/1 を作らない。03 §6.1） */
export function pageUrl(base: string, page: number): string {
  return page === 1 ? base : `${base}/page/${page}`;
}

export function photoSrc(photo: Pick<PublicPhoto, 'id'>, size: 'full' | 'thumb'): string {
  return `/photos/${photo.id}/${size}.jpg`;
}

export const KIND_LABELS: Record<PublicPost['kind'], string> = {
  news: 'お知らせ',
  event: '行事',
  recruit: '募集',
  activity: '活動記録',
};
