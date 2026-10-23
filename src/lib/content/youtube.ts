// parseYouTubeId()：YouTube の各形式の URL から動画 ID を取り出す（00 §2.2、07 RB-52）
// 公開サイトと管理画面で同じ内容（正は公開サイト。00 §2.2）。公開サイトでは使わない（03 §5.1）

import { VIDEO_ID_PATTERN } from './validate-body.ts';

// 動画 ID を探す YouTube のホスト名（youtu.be は別に扱う）
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);

/**
 * YouTube の URL（watch・shorts・embed・youtu.be）から動画 ID を取り出す（00 §2.2）
 * @param input 利用者が貼り付けた URL（前後の空白は無視する）
 * @returns 11文字の動画 ID。YouTube の URL でない、または ID の形が違うときは null
 */
export function parseYouTubeId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  let id: string | null = null;
  if (url.hostname === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (YOUTUBE_HOSTS.has(url.hostname)) {
    const [, first, second] = url.pathname.split('/');
    if (first === 'watch') {
      id = url.searchParams.get('v');
    } else if (first === 'shorts' || first === 'embed') {
      id = second ?? null;
    }
  }
  return id !== null && VIDEO_ID_PATTERN.test(id) ? id : null;
}
