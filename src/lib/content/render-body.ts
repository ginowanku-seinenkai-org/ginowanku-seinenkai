// renderBody()：本文（TipTap の JSON）を HTML にする（00 §2.1・§2.2、03 §5.3、D-52）
// 許可した要素だけを決まった形で出し、文字と属性値はすべてエスケープする。例外を投げない。
// 公開サイトと管理画面で同じ内容（正は公開サイト。00 §2.2）

import type { RenderContext } from './types.ts';
import {
  MAX_DEPTH,
  MAX_PHOTO_CAPTION,
  INSTAGRAM_ID_PATTERN,
  INSTAGRAM_KINDS,
  MAX_YOUTUBE_TITLE,
  PHOTO_ID_PATTERN,
  TIKTOK_AUTHOR_PATTERN,
  TIKTOK_ID_PATTERN,
  VIDEO_ID_PATTERN,
  own,
  truncateChars,
} from './validate-body.ts';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

export function renderBody(doc: unknown, ctx: RenderContext): string {
  try {
    if (own(doc, 'type') !== 'doc') return '';
    return `<div class="content-body">${renderChildren(own(doc, 'content'), ctx, 1)}</div>`;
  } catch {
    return '';
  }
}

function renderChildren(content: unknown, ctx: RenderContext, depth: number): string {
  if (!Array.isArray(content) || depth > MAX_DEPTH) return '';
  let html = '';
  for (const node of content) html += renderNode(node, ctx, depth);
  return html;
}

function renderNode(node: unknown, ctx: RenderContext, depth: number): string {
  const type = own(node, 'type');
  const content = own(node, 'content');
  const children = () => renderChildren(content, ctx, depth + 1);

  switch (type) {
    case 'paragraph':
      return isBlankParagraph(content) ? '' : `<p>${children()}</p>`;
    case 'heading': {
      const tag = own(own(node, 'attrs'), 'level') === 2 ? 'h2' : 'h3';
      return `<${tag}>${children()}</${tag}>`;
    }
    case 'bulletList':
      return `<ul>${children()}</ul>`;
    case 'orderedList':
      return `<ol>${children()}</ol>`;
    case 'listItem':
      return `<li>${children()}</li>`;
    case 'hardBreak':
      return '<br>';
    case 'text':
      return renderText(node, ctx);
    case 'photo':
      return renderPhoto(own(node, 'attrs'), ctx);
    case 'youtube':
      return renderYouTube(own(node, 'attrs'));
    case 'tiktok':
      return renderTikTok(own(node, 'attrs'));
    case 'instagram':
      return renderInstagram(own(node, 'attrs'));
    default:
      // 未知のノード：content が配列なら子だけを出し、なければ何も出さない
      return Array.isArray(content) ? children() : '';
  }
}

// 中身が空、または空白の文字だけの段落は出さない
function isBlankParagraph(content: unknown): boolean {
  if (!Array.isArray(content)) return true;
  return content.every((child) => {
    if (own(child, 'type') !== 'text') return false;
    const text = own(child, 'text');
    return typeof text !== 'string' || text.trim() === '';
  });
}

function renderText(node: unknown, ctx: RenderContext): string {
  const text = own(node, 'text');
  if (typeof text !== 'string') return '';
  let html = escapeHtml(text);

  const marks = own(node, 'marks');
  if (!Array.isArray(marks)) return html;
  const bold = marks.some((m) => own(m, 'type') === 'bold');
  const link = marks.find((m) => own(m, 'type') === 'link');

  // 外側から <strong>、<a> の順に包む（03 §5.3）
  if (link !== undefined) html = wrapLink(html, own(own(link, 'attrs'), 'href'), ctx);
  if (bold) html = `<strong>${html}</strong>`;
  return html;
}

function wrapLink(inner: string, href: unknown, ctx: RenderContext): string {
  if (typeof href !== 'string') return inner;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return inner;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return inner;
  const escaped = escapeHtml(url.href);
  if (url.origin === ctx.siteOrigin) return `<a href="${escaped}">${inner}</a>`;
  return `<a href="${escaped}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
}

function renderPhoto(attrs: unknown, ctx: RenderContext): string {
  const photoId = own(attrs, 'photoId');
  if (typeof photoId !== 'string' || !PHOTO_ID_PATTERN.test(photoId)) return '';
  const photo = ctx.resolvePhoto(photoId);
  if (photo === null) return '';

  const src = escapeHtml(photo.src);
  const thumbSrc = escapeHtml(photo.thumbSrc);
  const img =
    `<img src="${src}" srcset="${thumbSrc} ${photo.thumbWidth}w, ${src} ${photo.width}w"` +
    ` sizes="(min-width: 768px) 720px, 100vw" width="${photo.width}" height="${photo.height}"` +
    ` alt="${escapeHtml(photo.alt)}" loading="lazy" decoding="async">`;

  const caption = own(attrs, 'caption');
  const trimmed = typeof caption === 'string' ? caption.trim() : '';
  const figcaption =
    trimmed === ''
      ? ''
      : `<figcaption>${escapeHtml(truncateChars(trimmed, MAX_PHOTO_CAPTION))}</figcaption>`;
  return `<figure>${img}${figcaption}</figure>`;
}

/** 埋め込みの読み上げ名（title。空なら既定の名前、長ければ切り詰める） */
function embedLabel(title: unknown, fallback: string): string {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  return trimmed === '' ? fallback : truncateChars(trimmed, MAX_YOUTUBE_TITLE);
}

/** TikTok・Instagram の埋め込み（D-70）：iframe と、元の投稿へのリンク */
function snsFigure(
  name: string,
  src: string,
  label: string,
  width: number,
  height: number,
  href: string,
  linkText: string,
): string {
  return (
    `<figure class="sns-embed sns-${name}">` +
    `<iframe src="${src}" title="${escapeHtml(label)}" width="${width}" height="${height}" loading="lazy"` +
    ` referrerpolicy="strict-origin-when-cross-origin" allow="fullscreen" allowfullscreen></iframe>` +
    `<figcaption><a href="${href}" target="_blank" rel="noopener noreferrer">${linkText}</a></figcaption>` +
    `</figure>`
  );
}

function renderTikTok(attrs: unknown): string {
  const videoId = own(attrs, 'videoId');
  const author = own(attrs, 'author');
  if (typeof videoId !== 'string' || !TIKTOK_ID_PATTERN.test(videoId)) return '';
  if (typeof author !== 'string' || !TIKTOK_AUTHOR_PATTERN.test(author)) return '';
  return snsFigure(
    'tiktok',
    `https://www.tiktok.com/player/v1/${videoId}?rel=0`,
    embedLabel(own(attrs, 'title'), 'TikTok動画'),
    325,
    578,
    `https://www.tiktok.com/@${author}/video/${videoId}`,
    'TikTokで見る',
  );
}

function renderInstagram(attrs: unknown): string {
  const kind = own(attrs, 'kind');
  const postId = own(attrs, 'postId');
  if (typeof kind !== 'string' || !INSTAGRAM_KINDS.includes(kind)) return '';
  if (typeof postId !== 'string' || !INSTAGRAM_ID_PATTERN.test(postId)) return '';
  return snsFigure(
    'instagram',
    `https://www.instagram.com/${kind}/${postId}/embed/`,
    embedLabel(own(attrs, 'title'), 'Instagramの投稿'),
    400,
    600,
    `https://www.instagram.com/${kind}/${postId}/`,
    'Instagramで見る',
  );
}

function renderYouTube(attrs: unknown): string {
  const videoId = own(attrs, 'videoId');
  if (typeof videoId !== 'string' || !VIDEO_ID_PATTERN.test(videoId)) return '';
  const title = own(attrs, 'title');
  const trimmed = typeof title === 'string' ? title.trim() : '';
  const label = trimmed === '' ? 'YouTube動画' : truncateChars(trimmed, MAX_YOUTUBE_TITLE);
  return (
    `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}" title="${escapeHtml(label)}"` +
    ` width="560" height="315" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"` +
    ` allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`
  );
}
