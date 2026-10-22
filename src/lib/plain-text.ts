// 本文から文字だけを取り出す（03 §5.5。公開サイトだけ）
import { own } from './content/validate-body.ts';

// 前後に区切りの空白を入れるノード
const BLOCKS = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'hardBreak',
]);

/**
 * ノードの文字を順に out へ集める。ブロックの前後には空白を入れ、写真・動画は飛ばす
 * @param node 集めるノード
 * @param out 文字を足していく配列
 * @param depth 入れ子の深さ。20 を超えたら読まない
 */
function collect(node: unknown, out: string[], depth: number): void {
  if (depth > 20) return;
  const type = own(node, 'type');
  if (type === 'photo' || type === 'youtube') return;
  if (type === 'text') {
    const text = own(node, 'text');
    if (typeof text === 'string') out.push(text);
    return;
  }
  if (typeof type === 'string' && BLOCKS.has(type)) out.push(' ');
  const content = own(node, 'content');
  if (Array.isArray(content)) for (const child of content) collect(child, out, depth + 1);
  if (typeof type === 'string' && BLOCKS.has(type)) out.push(' ');
}

/**
 * 本文の text を順に連結する。ブロックの区切りは空白1つ、写真・動画は無視、連続する空白は1つにまとめる
 * @param doc 本文（TipTap の JSON）
 * @returns 本文の文字だけ。doc でなければ空文字
 */
export function bodyToPlainText(doc: unknown): string {
  if (own(doc, 'type') !== 'doc') return '';
  const out: string[] = [];
  collect(doc, out, 0);
  return out.join('').replace(/\s+/g, ' ').trim();
}

/**
 * ノードに、空白以外の文字か写真・動画・SNS の埋め込みがあるかを調べる
 * @param node 調べるノード
 * @param depth 入れ子の深さ。20 を超えたら無いものとする
 * @returns 中身があれば true
 */
function hasContent(node: unknown, depth: number): boolean {
  if (depth > 20) return false;
  const type = own(node, 'type');
  if (type === 'photo' || type === 'youtube' || type === 'tiktok' || type === 'instagram')
    return true;
  if (type === 'text') {
    const text = own(node, 'text');
    return typeof text === 'string' && text.trim() !== '';
  }
  const content = own(node, 'content');
  return Array.isArray(content) && content.some((child) => hasContent(child, depth + 1));
}

/**
 * 本文が空かを調べる。文字が無く、写真・動画も無ければ空
 * @param doc 本文（TipTap の JSON）
 * @returns 空なら true（doc でないときも true）
 */
export function isEmptyBody(doc: unknown): boolean {
  return own(doc, 'type') !== 'doc' || !hasContent(doc, 0);
}
