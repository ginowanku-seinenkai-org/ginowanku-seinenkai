// アクセス計測の判定と送る内容（03 §9、D-24・D-31）。DOM の値を引数で受け取り、単体テストする（03 §16）
import type { SiteEnv } from './env.ts';

export const SITE_HOST = 'ginowanku-seinenkai.com';
const MAX_PATH = 200;
const MAX_HOST = 100;

export interface TrackContext {
  siteEnv: SiteEnv | string;
  hostname: string;
  webdriver: boolean | undefined;
  globalPrivacyControl: boolean | undefined;
  doNotTrack: string | null | undefined;
}

/** 送るか（03 §9.3）。404 ページはスクリプト自体を読み込まない */
export function shouldTrack(ctx: TrackContext): boolean {
  if (ctx.siteEnv !== 'production') return false;
  if (ctx.hostname !== SITE_HOST) return false;
  if (ctx.webdriver === true) return false;
  if (ctx.globalPrivacyControl === true || ctx.doNotTrack === '1') return false;
  return true;
}

/** パス：末尾の .html と（/ 以外の）末尾の / を除く。クエリ・ハッシュは含めない */
export function trackPath(pathname: string): string | null {
  let path = pathname.replace(/\.html$/, '');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  path = path || '/';
  return path.length > MAX_PATH ? null : path;
}

/** 流入元のホスト名（03 §9.1 の表） */
export function referrerHost(referrer: string): string | null {
  if (!referrer) return null;
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (host === SITE_HOST || host.endsWith(`.${SITE_HOST}`)) return '(internal)';
  return host.length > MAX_HOST ? null : host;
}

export interface TrackPayload {
  path: string;
  referrer_host: string | null;
}

/** 送る内容。パスが長すぎるときは null（計測しない） */
export function buildTrackPayload(pathname: string, referrer: string): TrackPayload | null {
  const path = trackPath(pathname);
  if (path === null) return null;
  return { path, referrer_host: referrerHost(referrer) };
}
