// 本文から文字だけを取り出す（03 §5.5。公開サイトだけ）
import { own } from './content/validate-body.ts';

const BLOCKS = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'hardBreak',
]);

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

/** text を順に連結する。ブロックの区切りは空白1つ、写真・動画は無視、連続する空白は1つにまとめる */
export function bodyToPlainText(doc: unknown): string {
  if (own(doc, 'type') !== 'doc') return '';
  const out: string[] = [];
  collect(doc, out, 0);
  return out.join('').replace(/\s+/g, ' ').trim();
}

function hasContent(node: unknown, depth: number): boolean {
  if (depth > 20) return false;
  const type = own(node, 'type');
  if (type === 'photo' || type === 'youtube') return true;
  if (type === 'text') {
    const text = own(node, 'text');
    return typeof text === 'string' && text.trim() !== '';
  }
  const content = own(node, 'content');
  return Array.isArray(content) && content.some((child) => hasContent(child, depth + 1));
}

/** 文字が無く、写真・動画も無ければ true */
export function isEmptyBody(doc: unknown): boolean {
  return own(doc, 'type') !== 'doc' || !hasContent(doc, 0);
}
