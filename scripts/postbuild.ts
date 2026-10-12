// _headers の生成とビルド出力の検査（03 §12.3）
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { z } from 'zod';
import { getEnv } from '../src/lib/env.ts';
import { metaSchema } from '../src/lib/view-schemas.ts';
import { isMain } from './retry.ts';

/** Cloudflare Pages の上限2万件に余裕を持たせる（08 1-3） */
export const MAX_FILES = 18_000;
/** Turnstile の公式のテスト用サイトキー（本番の出力に含めない。07 UT-25） */
export const TURNSTILE_TEST_KEYS = [
  '1x00000000000000000000AA',
  '2x00000000000000000000AB',
  '1x00000000000000000000BB',
  '2x00000000000000000000BB',
  '3x00000000000000000000FF',
];

/** Cloudflare Pages の _headers の上限（08 1-3） */
export const MAX_HEADER_RULES = 100;
export const MAX_HEADER_LINE = 2000;

/** セキュリティヘッダー（03 §12.1）。CSP の connect-src に Supabase のオリジンを入れる */
export function buildHeaders(supabaseUrl: string): string {
  const supabaseOrigin = new URL(supabaseUrl).origin;
  const csp = [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    `connect-src 'self' ${supabaseOrigin}`,
    'frame-src https://challenges.cloudflare.com https://www.youtube-nocookie.com',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
  // Cache-Control は /* に書かない（同じヘッダーが複数の規則に当たると値がつながるため）
  return [
    '/*',
    `  Content-Security-Policy: ${csp}`,
    '  X-Frame-Options: DENY',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    '  Strict-Transport-Security: max-age=31536000',
    '',
    '/_astro/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    '/photos/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ].join('\n');
}

/** _headers の上限（規則100件、1行2,000文字）を超えていないか */
export function checkHeaders(text: string): string[] {
  const errors: string[] = [];
  const rules = text.split('\n').filter((line) => line.startsWith('/')).length;
  if (rules > MAX_HEADER_RULES)
    errors.push(`_headers の規則が ${rules} 件で、上限 ${MAX_HEADER_RULES} 件を超えています`);
  for (const line of text.split('\n'))
    if (line.length > MAX_HEADER_LINE)
      errors.push(`_headers に ${line.length} 文字の行があります（上限 ${MAX_HEADER_LINE}）`);
  return errors;
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

/** CSP 違反のもと：src の無い <script>（JSON-LD を除く）、<style>、style= 属性、on…= 属性 */
export function findInlineViolations(html: string): string[] {
  const found: string[] = [];
  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = match[1] ?? '';
    if (/\bsrc\s*=/i.test(attrs) || /type\s*=\s*"application\/ld\+json"/i.test(attrs)) continue;
    found.push(`インラインの <script${attrs}>`);
  }
  if (/<style\b/i.test(html)) found.push('<style> 要素');
  for (const match of html.matchAll(/<[a-z][^>]*?\s(style|on[a-z]+)\s*=/gi))
    found.push(`${match[1]}= 属性`);
  return found;
}

export interface PostbuildOptions {
  root?: string;
  siteEnv?: string;
  supabaseUrl?: string;
}

export async function postbuild({
  root = process.cwd(),
  siteEnv = getEnv().siteEnv,
  supabaseUrl = getEnv().supabaseUrl,
}: PostbuildOptions = {}) {
  const dist = join(root, 'dist');
  const errors: string[] = [];

  // 1. _headers を生成する（Supabase の URL を CSP に入れるため、ビルドのたびに作る）
  const headers = buildHeaders(supabaseUrl);
  errors.push(...checkHeaders(headers));
  await writeFile(join(dist, '_headers'), headers);

  const files = await listFiles(dist);

  for (const file of files.filter((f) => f.endsWith('.html'))) {
    const html = await readFile(file, 'utf8');
    for (const v of findInlineViolations(html)) errors.push(`${relative(dist, file)}：${v}`);
    if (siteEnv === 'production' && TURNSTILE_TEST_KEYS.some((key) => html.includes(key))) {
      errors.push(`${relative(dist, file)}：Turnstile のテスト用サイトキーが含まれています`);
    }
  }

  if (files.length > MAX_FILES)
    errors.push(`dist のファイル数が ${files.length} 件で、上限 ${MAX_FILES} 件を超えています`);

  const photos = z
    .array(z.object({ id: z.string() }))
    .parse(JSON.parse(await readFile(join(root, '.data', 'photos.json'), 'utf8')));
  const photoDirs = (
    await readdir(join(dist, 'photos'), { withFileTypes: true }).catch(() => [])
  ).filter((e) => e.isDirectory());
  if (photoDirs.length !== photos.length) {
    errors.push(
      `dist/photos の写真の数（${photoDirs.length}）が .data/photos.json の件数（${photos.length}）と一致しません`,
    );
  }

  if (siteEnv === 'production') {
    const meta = metaSchema.parse(
      JSON.parse(await readFile(join(root, '.data', 'meta.json'), 'utf8')),
    );
    if (meta.source !== 'supabase')
      errors.push('本番のビルドに固定データ（.data/meta.json の source が fixture）を使っています');
  }

  if (errors.length > 0)
    throw new Error(`ビルド出力の検査に失敗しました：\n${errors.map((e) => `- ${e}`).join('\n')}`);
  console.log(
    `postbuild：HTML とファイル数（${files.length}件）、写真の数（${photos.length}件）の検査に合格`,
  );
}

if (isMain(import.meta.url)) {
  postbuild().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
