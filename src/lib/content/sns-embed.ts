// parseTikTokUrl()・parseInstagramUrl()：投稿の URL から埋め込みの属性を取り出す（00 §2.2、D-70、07 RB-52a）
// 公開サイトと管理画面で同じ内容（正は公開サイト。00 §2.2）。公開サイトでは使わない（03 §5.1）

import { INSTAGRAM_ID_PATTERN, TIKTOK_AUTHOR_PATTERN, TIKTOK_ID_PATTERN } from './validate-body.ts';

/**
 * 文字列を http・https の URL として読む
 * @param input 利用者が貼り付けた URL（前後の空白は無視する）
 * @returns 読めた URL。読めない、または http・https 以外なら null
 */
function parseUrl(input: string): URL | null {
  try {
    const url = new URL(input.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

// TikTok の投稿として受け付けるホスト名
const TIKTOK_HOSTS = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com']);

/**
 * TikTok の投稿の URL から埋め込みの属性を取り出す（D-70）
 * 形は `https://www.tiktok.com/@アカウント名/video/番号`（`photo` も可）。短縮 URL（vt.tiktok.com など）は null
 * @param input 利用者が貼り付けた URL
 * @returns 投稿の番号とアカウント名。形が違うときは null
 */
export function parseTikTokUrl(input: string): { videoId: string; author: string } | null {
  const url = parseUrl(input);
  if (!url || !TIKTOK_HOSTS.has(url.hostname)) return null;
  const [, handle, type, id] = url.pathname.split('/');
  if (!handle?.startsWith('@') || (type !== 'video' && type !== 'photo') || !id) return null;
  const author = handle.slice(1);
  return TIKTOK_ID_PATTERN.test(id) && TIKTOK_AUTHOR_PATTERN.test(author)
    ? { videoId: id, author }
    : null;
}

// Instagram の投稿として受け付けるホスト名
const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com']);

/**
 * Instagram の投稿の URL から埋め込みの属性を取り出す（D-70）
 * 形は `/p/ID`、`/reel/ID`、`/reels/ID`、`/アカウント名/p/ID`、`/アカウント名/reel/ID`（`reels` は `reel` にそろえる）
 * @param input 利用者が貼り付けた URL
 * @returns 投稿の種類（p・reel）と ID。形が違うときは null
 */
export function parseInstagramUrl(input: string): { kind: 'p' | 'reel'; postId: string } | null {
  const url = parseUrl(input);
  if (!url || !INSTAGRAM_HOSTS.has(url.hostname)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const at = parts.findIndex((p) => p === 'p' || p === 'reel' || p === 'reels');
  // 種類は先頭か2番目（アカウント名の後ろ）だけ
  if (at < 0 || at > 1) return null;
  const postId = parts[at + 1];
  if (!postId || !INSTAGRAM_ID_PATTERN.test(postId)) return null;
  return { kind: parts[at] === 'p' ? 'p' : 'reel', postId };
}
