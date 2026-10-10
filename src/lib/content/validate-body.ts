// 本文の決まりと validateBody()（00 §2.1・§2.2、03 §5.3、D-29、D-52）
// 保存前（管理画面）とビルド時（公開サイト）に使う。公開サイトと管理画面で同じ内容（正は公開サイト。00 §2.2）

/** validateBody() のサイズの上限：JSON.stringify(doc) の UTF-8 バイト数（D-29） */
export const MAX_BODY_BYTES = 100_000;
/** 入れ子の深さの上限。超えた部分は出力しない（03 §5.3） */
export const MAX_DEPTH = 20;
/** YouTube の題名の上限（文字数。00 §2.1、D-52） */
export const MAX_YOUTUBE_TITLE = 100;
/** 写真の説明文の上限（文字数。00 §2.1、D-52） */
export const MAX_PHOTO_CAPTION = 120;

export const PHOTO_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** 文字数（コードポイント単位） */
export function charLength(value: string): number {
  return Array.from(value).length;
}

/** 先頭から n 文字（コードポイント単位） */
export function truncateChars(value: string, n: number): string {
  return Array.from(value).slice(0, n).join('');
}

/** 自分自身のプロパティだけを読む（__proto__ などの影響を受けない。03 §5.3） */
export function own(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return Object.prototype.hasOwnProperty.call(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

export type BodyErrorCode =
  | 'not_doc'
  | 'unknown_node'
  | 'unknown_mark'
  | 'unknown_attribute'
  | 'invalid_structure'
  | 'too_deep'
  | 'title_too_long'
  | 'caption_too_long'
  | 'too_large';

export interface BodyError {
  /** 問題の場所（例：content[2].content[0]） */
  path: string;
  code: BodyErrorCode;
  /** unknown_node などのときの名前 */
  name?: string;
}

export interface ValidateBodyResult {
  valid: boolean;
  /** JSON.stringify(doc) の UTF-8 バイト数 */
  bytes: number;
  errors: BodyError[];
}

// ノードごとに許可するキーと attrs のキー（00 §2.1）
const NODE_KEYS: Record<string, { keys: readonly string[]; attrs: readonly string[] }> = {
  paragraph: { keys: ['type', 'content'], attrs: [] },
  heading: { keys: ['type', 'attrs', 'content'], attrs: ['level'] },
  bulletList: { keys: ['type', 'content'], attrs: [] },
  orderedList: { keys: ['type', 'content'], attrs: [] },
  listItem: { keys: ['type', 'content'], attrs: [] },
  hardBreak: { keys: ['type'], attrs: [] },
  text: { keys: ['type', 'text', 'marks'], attrs: [] },
  photo: { keys: ['type', 'attrs'], attrs: ['photoId', 'caption'] },
  youtube: { keys: ['type', 'attrs'], attrs: ['videoId', 'title'] },
};
const MARK_ATTRS: Record<string, readonly string[]> = { bold: [], link: ['href'] };

export function validateBody(doc: unknown): ValidateBodyResult {
  const errors: BodyError[] = [];
  let bytes = 0;
  try {
    bytes = new TextEncoder().encode(JSON.stringify(doc) ?? '').length;
  } catch {
    errors.push({ path: '', code: 'invalid_structure' });
  }
  if (bytes > MAX_BODY_BYTES) errors.push({ path: '', code: 'too_large' });

  if (own(doc, 'type') !== 'doc') {
    errors.push({ path: '', code: 'not_doc' });
    return { valid: false, bytes, errors };
  }
  for (const key of Object.keys(doc as object)) {
    if (key !== 'type' && key !== 'content')
      errors.push({ path: '', code: 'unknown_attribute', name: key });
  }
  checkChildren(own(doc, 'content'), '', 1, errors);
  return { valid: errors.length === 0, bytes, errors };
}

function checkChildren(content: unknown, path: string, depth: number, errors: BodyError[]): void {
  if (content === undefined) return;
  if (!Array.isArray(content)) {
    errors.push({ path, code: 'invalid_structure' });
    return;
  }
  content.forEach((child, i) => checkNode(child, `${path}content[${i}]`, depth, errors));
}

function checkNode(node: unknown, path: string, depth: number, errors: BodyError[]): void {
  if (depth > MAX_DEPTH) {
    errors.push({ path, code: 'too_deep' });
    return;
  }
  const type = own(node, 'type');
  const rule = typeof type === 'string' ? NODE_KEYS[type] : undefined;
  if (typeof type !== 'string' || rule === undefined) {
    errors.push({ path, code: 'unknown_node', name: typeof type === 'string' ? type : undefined });
    return;
  }
  for (const key of Object.keys(node as object)) {
    if (!rule.keys.includes(key)) errors.push({ path, code: 'unknown_attribute', name: key });
  }
  const attrs = own(node, 'attrs');
  if (attrs !== undefined && rule.keys.includes('attrs')) {
    if (typeof attrs !== 'object' || attrs === null || Array.isArray(attrs)) {
      errors.push({ path, code: 'invalid_structure' });
    } else {
      for (const key of Object.keys(attrs)) {
        if (!rule.attrs.includes(key)) errors.push({ path, code: 'unknown_attribute', name: key });
      }
    }
  }

  if (type === 'text') {
    if (typeof own(node, 'text') !== 'string') errors.push({ path, code: 'invalid_structure' });
    checkMarks(own(node, 'marks'), path, errors);
  }
  if (type === 'youtube') {
    const title = own(attrs, 'title');
    if (typeof title === 'string' && charLength(title.trim()) > MAX_YOUTUBE_TITLE) {
      errors.push({ path, code: 'title_too_long' });
    }
  }
  if (type === 'photo') {
    const caption = own(attrs, 'caption');
    if (typeof caption === 'string' && charLength(caption.trim()) > MAX_PHOTO_CAPTION) {
      errors.push({ path, code: 'caption_too_long' });
    }
  }
  if (rule.keys.includes('content'))
    checkChildren(own(node, 'content'), `${path}.`, depth + 1, errors);
}

function checkMarks(marks: unknown, path: string, errors: BodyError[]): void {
  if (marks === undefined) return;
  if (!Array.isArray(marks)) {
    errors.push({ path, code: 'invalid_structure' });
    return;
  }
  for (const mark of marks) {
    const type = own(mark, 'type');
    const allowed = typeof type === 'string' ? MARK_ATTRS[type] : undefined;
    if (typeof type !== 'string' || allowed === undefined) {
      errors.push({
        path,
        code: 'unknown_mark',
        name: typeof type === 'string' ? type : undefined,
      });
      continue;
    }
    for (const key of Object.keys(mark as object)) {
      if (key !== 'type' && key !== 'attrs')
        errors.push({ path, code: 'unknown_attribute', name: key });
    }
    const attrs = own(mark, 'attrs');
    if (attrs !== undefined && typeof attrs === 'object' && attrs !== null) {
      for (const key of Object.keys(attrs)) {
        if (!allowed.includes(key)) errors.push({ path, code: 'unknown_attribute', name: key });
      }
    }
  }
}
