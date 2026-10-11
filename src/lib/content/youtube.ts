// parseYouTubeId()：YouTube の各形式の URL から動画 ID を取り出す（00 §2.2、07 RB-52）
// 公開サイトと管理画面で同じ内容（正は公開サイト。00 §2.2）。公開サイトでは使わない（03 §5.1）

import { VIDEO_ID_PATTERN } from './validate-body.ts';

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);

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
