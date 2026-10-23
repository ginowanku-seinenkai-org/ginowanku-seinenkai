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

// HTML でエスケープする文字と置き換え先
const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * 文字と属性値に使えるように、& < > " ' をエスケープする
 * @param value エスケープする文字列
 * @returns エスケープした文字列
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/**
 * 本文（TipTap の JSON）を HTML にする（00 §2.1・§2.2、03 §5.3）
 * 許可した要素だけを出し、知らないノードや形の違う値は出さない。途中で例外が起きても空文字を返す
 * @param doc 本文（形は分からないものとして扱う）
 * @param ctx 写真の解決と自サイトのオリジン
 * @returns `<div class="content-body">` で囲んだ HTML。doc でなければ空文字
 */
export function renderBody(doc: unknown, ctx: RenderContext): string {
  try {
    if (own(doc, 'type') !== 'doc') return '';
    return `<div class="content-body">${renderChildren(own(doc, 'content'), ctx, 1)}</div>`;
  } catch {
    return '';
  }
}

/**
 * 子ノードの配列を順に HTML にする
 * @param content ノードの content
 * @param ctx 写真の解決と自サイトのオリジン
 * @param depth 子ノードの入れ子の深さ。MAX_DEPTH を超えたら出さない
 * @returns つなげた HTML。配列でなければ空文字
 */
function renderChildren(content: unknown, ctx: RenderContext, depth: number): string {
  if (!Array.isArray(content) || depth > MAX_DEPTH) return '';
  let html = '';
  for (const node of content) html += renderNode(node, ctx, depth);
  return html;
}

/**
 * ノード1つを HTML にする
 * @param node 変換するノード
 * @param ctx 写真の解決と自サイトのオリジン
 * @param depth このノードの入れ子の深さ
 * @returns ノードの HTML。出さないノードは空文字
 */
function renderNode(node: unknown, ctx: RenderContext, depth: number): string {
  const type = own(node, 'type');
  const content = own(node, 'content');
  /**
   * このノードの子を HTML にする（深さを1つ増やす）
   * @returns 子の HTML
   */
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

/**
 * 段落が空かを調べる。中身が空、または空白の文字だけの段落は出さない
 * @param content 段落の content
 * @returns 出さない段落なら true
 */
function isBlankParagraph(content: unknown): boolean {
  if (!Array.isArray(content)) return true;
  return content.every((child) => {
    if (own(child, 'type') !== 'text') return false;
    const text = own(child, 'text');
    return typeof text !== 'string' || text.trim() === '';
  });
}

/**
 * 文字のノードをエスケープし、太字とリンクの飾りを付ける
 * @param node 文字のノード
 * @param ctx 自サイトのオリジン（リンクの判定に使う）
 * @returns 文字の HTML。text が文字列でなければ空文字
 */
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

/**
 * 文字をリンクで包む。外部のリンクは新しいタブで開き、noopener noreferrer を付ける
 * @param inner 包む HTML（エスケープ済み）
 * @param href リンク先。http・https の URL 以外ならリンクにしない
 * @param ctx 自サイトのオリジン（内部リンクの判定に使う）
 * @returns リンクの HTML。リンクにしないときは inner のまま
 */
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

/**
 * 写真のノードを `<figure>` にする。説明文があれば `<figcaption>` を付ける
 * @param attrs 写真のノードの attrs（photoId・caption）
 * @param ctx 写真の ID から表示用の値を返す関数
 * @returns 写真の HTML。ID の形が違う、または写真が見つからなければ空文字
 */
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

/**
 * 埋め込みの読み上げ名（title）を決める。空なら既定の名前、長ければ切り詰める
 * @param title ノードの title
 * @param fallback title が空のときの名前
 * @returns 読み上げ名（エスケープ前）
 */
function embedLabel(title: unknown, fallback: string): string {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  return trimmed === '' ? fallback : truncateChars(trimmed, MAX_YOUTUBE_TITLE);
}

/**
 * TikTok・Instagram の埋め込み（D-70）：iframe と、元の投稿へのリンクを `<figure>` にまとめる
 * @param name サービス名（class の `sns-<name>` に使う）
 * @param src iframe の URL（形を確かめた ID から作ったもの）
 * @param label iframe の読み上げ名（エスケープ前）
 * @param width iframe の幅
 * @param height iframe の高さ
 * @param href 元の投稿の URL（形を確かめた ID から作ったもの）
 * @param linkText 元の投稿へのリンクの文字
 * @returns 埋め込みの HTML
 */
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

/**
 * TikTok のノードを埋め込みにする（D-70）
 * @param attrs TikTok のノードの attrs（videoId・author・title）
 * @returns 埋め込みの HTML。番号かアカウント名の形が違えば空文字
 */
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

/**
 * Instagram のノードを埋め込みにする（D-70）
 * @param attrs Instagram のノードの attrs（kind・postId・title）
 * @returns 埋め込みの HTML。種類か ID の形が違えば空文字
 */
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

/**
 * YouTube のノードを youtube-nocookie.com の iframe にする（D-52）
 * @param attrs YouTube のノードの attrs（videoId・title）
 * @returns iframe の HTML。動画 ID の形が違えば空文字
 */
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
