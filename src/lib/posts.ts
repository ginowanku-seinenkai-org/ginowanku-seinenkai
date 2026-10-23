// 並び替え、ページ分割、URL、終了判定（03 §3.7、§6.3、§7）
import type { SiteData } from './data.ts';
import { jstDate } from './date.ts';
import type { NewsKind, PublicPhoto, PublicPost } from './view-schemas.ts';

/** 一覧の1ページの件数 */
export const PAGE_SIZE = 12;

/**
 * 記事の URL を作る。活動記録は /activities/、ほかは /news/ の下
 * @param post 記事の ID と種類
 * @returns 記事のパス
 */
export function postUrl(post: Pick<PublicPost, 'id' | 'kind'>): string {
  return post.kind === 'activity' ? `/activities/${post.id}` : `/news/${post.id}`;
}

/**
 * 行事の終了日（日本時間）を求める。終了日時が無ければ開始日時の日付
 * @param post 記事
 * @returns 'YYYY-MM-DD'。行事以外・開始日時がないものは null
 */
export function eventEndDate(post: PublicPost): string | null {
  if (post.kind !== 'event') return null;
  const end = post.event_ends_at ?? post.event_starts_at;
  return end === null ? null : jstDate(end);
}

/**
 * 行事が終了したかを判定する（01 §3.2）。終了日が今日より前なら終了
 * @param post 記事
 * @param today 今日（日本時間 'YYYY-MM-DD'）
 * @returns 終了していれば true。行事以外は false
 */
export function isEnded(post: PublicPost, today: string): boolean {
  const end = eventEndDate(post);
  return end !== null && end < today;
}

/**
 * 開始日時の早い順に並べる比較関数。同じなら ID の小さい順
 * @param a 比べる記事
 * @param b 比べる記事
 * @returns sort に渡す比較の値
 */
function byStartAsc(a: PublicPost, b: PublicPost): number {
  return (a.event_starts_at ?? '').localeCompare(b.event_starts_at ?? '') || a.id - b.id;
}

/**
 * お知らせ系の一覧の記事を選ぶ（03 §6.3）。行事のカテゴリは、終了していないものを開始の早い順 → 終了したものを開始の遅い順
 * @param data サイトのデータ
 * @param kind カテゴリ。省略すると活動記録以外のすべて（データの並びのまま）
 * @returns 一覧に出す記事
 */
export function newsPosts(data: SiteData, kind?: NewsKind): PublicPost[] {
  const items = data.posts.filter((p) =>
    kind === undefined ? p.kind !== 'activity' : p.kind === kind,
  );
  if (kind !== 'event') return items;
  const upcoming = items.filter((p) => !isEnded(p, data.today)).sort(byStartAsc);
  const ended = items.filter((p) => isEnded(p, data.today)).sort((a, b) => byStartAsc(b, a));
  return [...upcoming, ...ended];
}

/**
 * 活動記録の一覧の記事を選ぶ（データの並びのまま）
 * @param data サイトのデータ
 * @returns 活動記録の記事
 */
export function activityPosts(data: SiteData): PublicPost[] {
  return data.posts.filter((p) => p.kind === 'activity');
}

/**
 * 終了していない行事を、開始の早い順に選ぶ
 * @param data サイトのデータ
 * @param limit 最大の件数
 * @returns 行事の記事
 */
export function upcomingEvents(data: SiteData, limit: number): PublicPost[] {
  return data.posts
    .filter((p) => p.kind === 'event' && !isEnded(p, data.today))
    .sort(byStartAsc)
    .slice(0, limit);
}

/** 一覧の1ページ分 */
export interface Page<T> {
  items: T[];
  currentPage: number;
  lastPage: number;
}

/**
 * 一覧をページに分ける。1件もなくても1ページ目（空）を返す
 * @param items 一覧の項目
 * @param size 1ページの件数
 * @returns ページの配列（1ページ目から）
 */
export function paginate<T>(items: T[], size: number = PAGE_SIZE): Page<T>[] {
  const lastPage = Math.max(1, Math.ceil(items.length / size));
  return Array.from({ length: lastPage }, (_, i) => ({
    items: items.slice(i * size, (i + 1) * size),
    currentPage: i + 1,
    lastPage,
  }));
}

/**
 * 一覧のページの URL を作る（1ページ目は /page/1 を作らない。03 §6.1）
 * @param base 一覧の1ページ目のパス
 * @param page ページ番号（1から）
 * @returns ページのパス
 */
export function pageUrl(base: string, page: number): string {
  return page === 1 ? base : `${base}/page/${page}`;
}

/**
 * 写真のファイルのパスを作る（fetch-photos.ts が public/photos/ に置いたもの）
 * @param photo 写真の ID
 * @param size full（大きい写真）か thumb（小さい写真）
 * @returns 写真のパス
 */
export function photoSrc(photo: Pick<PublicPhoto, 'id'>, size: 'full' | 'thumb'): string {
  return `/photos/${photo.id}/${size}.jpg`;
}

/** 記事の種類の表示名 */
export const KIND_LABELS: Record<PublicPost['kind'], string> = {
  news: 'お知らせ',
  event: '行事',
  recruit: '募集',
  activity: '活動記録',
};
