// robots.txt（03 §11.4）。本番だけ検索に載せ、プレビュー・ローカルは Disallow
import type { APIRoute } from 'astro';
import { getEnv } from '../lib/env.ts';
import { SITE_ORIGIN } from '../lib/seo.ts';

export const GET: APIRoute = () => {
  const body =
    getEnv().siteEnv === 'production'
      ? `User-agent: *\nAllow: /\nSitemap: ${SITE_ORIGIN}/sitemap-index.xml\n`
      : 'User-agent: *\nDisallow: /\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
