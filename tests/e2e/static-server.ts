// 画面操作テスト・Lighthouse 用の配信（dist を Cloudflare Pages と同じ規則で返す）
//   /about → about.html、/ → index.html、無い URL → 404.html（ステータス404）
//   dist/_headers の `/*` のヘッダー（CSP など）も付け、CSP の違反を画面操作テストのコンソールの検査で見つける
import { createReadStream, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const DIST = join(process.cwd(), 'dist');
const PORT = Number(process.env['PORT'] ?? 4329);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

/** `/*` の項目のヘッダー。手元は http なので、HSTS と upgrade-insecure-requests は外す */
function commonHeaders(): Record<string, string> {
  let text = '';
  try {
    text = readFileSync(join(DIST, '_headers'), 'utf8');
  } catch {
    return {};
  }
  const headers: Record<string, string> = {};
  let inAll = false;
  for (const line of text.split('\n')) {
    if (!line.startsWith(' ') && line.trim()) {
      inAll = line.trim() === '/*';
      continue;
    }
    const m = inAll ? /^\s+([^:]+):\s*(.*)$/.exec(line) : null;
    if (!m?.[1] || m[2] === undefined) continue;
    const name = m[1].trim();
    if (name.toLowerCase() === 'strict-transport-security') continue;
    headers[name] =
      name.toLowerCase() === 'content-security-policy'
        ? m[2]
            .split(';')
            .map((d) => d.trim())
            .filter((d) => d && d !== 'upgrade-insecure-requests')
            .join('; ')
        : m[2];
  }
  return headers;
}

const COMMON = commonHeaders();

async function isFile(path: string) {
  return stat(path).then(
    (s) => s.isFile(),
    () => false,
  );
}

async function resolve(pathname: string): Promise<string | null> {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const base = join(DIST, clean);
  if (!base.startsWith(DIST)) return null;
  if (clean === '/' || clean === '') return join(DIST, 'index.html');
  for (const candidate of [base, `${base}.html`]) if (await isFile(candidate)) return candidate;
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const file = await resolve(url.pathname);
  const target = file ?? join(DIST, '404.html');
  res.writeHead(file ? 200 : 404, {
    ...COMMON,
    'Content-Type': TYPES[extname(target)] ?? 'application/octet-stream',
  });
  createReadStream(target).pipe(res);
}).listen(PORT, '127.0.0.1', () =>
  console.log(`dist を http://127.0.0.1:${PORT} で配信しています`),
);
