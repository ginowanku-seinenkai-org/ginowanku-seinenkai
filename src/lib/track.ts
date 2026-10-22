// アクセス計測の判定と送る内容（03 §9、D-24・D-31）。DOM の値を引数で受け取り、単体テストする（03 §16）
import type { SiteEnv } from './env.ts';

/** 本番のホスト名。これ以外では計測しない */
export const SITE_HOST = 'ginowanku-seinenkai.com';
// 送るパスとホスト名の長さの上限
const MAX_PATH = 200;
const MAX_HOST = 100;

/** 計測するかの判定に使う値（DOM・環境から読んだもの） */
export interface TrackContext {
  siteEnv: SiteEnv | string;
  hostname: string;
  webdriver: boolean | undefined;
  globalPrivacyControl: boolean | undefined;
  doNotTrack: string | null | undefined;
}

/**
 * 計測を送るかを決める（03 §9.3）。404 ページはスクリプト自体を読み込まない
 * @param ctx 環境・ホスト名・自動操作か・GPC・DNT
 * @returns 本番のホストで、自動操作でなく、GPC・DNT が無効なら true
 */
export function shouldTrack(ctx: TrackContext): boolean {
  if (ctx.siteEnv !== 'production') return false;
  if (ctx.hostname !== SITE_HOST) return false;
  if (ctx.webdriver === true) return false;
  if (ctx.globalPrivacyControl === true || ctx.doNotTrack === '1') return false;
  return true;
}

/**
 * 送るパスを作る。末尾の .html と（/ 以外の）末尾の / を除く。クエリ・ハッシュは含めない
 * @param pathname location.pathname
 * @returns 送るパス。長すぎるときは null
 */
export function trackPath(pathname: string): string | null {
  let path = pathname.replace(/\.html$/, '');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  path = path || '/';
  return path.length > MAX_PATH ? null : path;
}

/**
 * 流入元のホスト名を決める（03 §9.1 の表）
 * @param referrer document.referrer
 * @returns ホスト名（小文字）。自サイトは '(internal)'。無い・読めない・http(s) 以外・長すぎるときは null
 */
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

/** 計測で送る内容 */
export interface TrackPayload {
  path: string;
  referrer_host: string | null;
}

/**
 * 計測で送る内容を作る
 * @param pathname location.pathname
 * @param referrer document.referrer
 * @returns 送る内容。パスが長すぎるときは null（計測しない）
 */
export function buildTrackPayload(pathname: string, referrer: string): TrackPayload | null {
  const path = trackPath(pathname);
  if (path === null) return null;
  return { path, referrer_host: referrerHost(referrer) };
}
