// 本文（TipTap の JSON）の型（00 §2.1）。公開サイトと管理画面で同じ内容（正は公開サイト。00 §2.2）

/** 文字の飾り：太字とリンク（00 §2.1） */
export type BodyMark = { type: 'bold' } | { type: 'link'; attrs: { href: string } };

/** 本文で許可するノード（00 §2.1）。これ以外は validateBody() がエラーにし、renderBody() は出さない */
export type BodyNode =
  | { type: 'paragraph'; content?: BodyNode[] }
  | { type: 'heading'; attrs: { level: 2 | 3 }; content?: BodyNode[] }
  | { type: 'bulletList'; content?: BodyNode[] }
  | { type: 'orderedList'; content?: BodyNode[] }
  | { type: 'listItem'; content?: BodyNode[] }
  | { type: 'hardBreak' }
  | { type: 'text'; text: string; marks?: BodyMark[] }
  | { type: 'photo'; attrs: { photoId: string; caption?: string } }
  | { type: 'youtube'; attrs: { videoId: string; title?: string } }
  | { type: 'tiktok'; attrs: { videoId: string; author: string; title?: string } }
  | { type: 'instagram'; attrs: { kind: 'p' | 'reel'; postId: string; title?: string } };

/** 本文全体（TipTap の doc ノード） */
export interface BodyDoc {
  type: 'doc';
  content?: BodyNode[];
}

/** renderBody() が写真の出力に使う値（00 §2.2） */
export interface ResolvedPhoto {
  src: string;
  thumbSrc: string;
  width: number;
  height: number;
  thumbWidth: number;
  thumbHeight: number;
  alt: string;
}

/** renderBody() に渡す、写真の解決とリンクの判定に使う値 */
export interface RenderContext {
  /** 写真の ID から表示用の値を返す。見つからなければ null */
  resolvePhoto: (photoId: string) => ResolvedPhoto | null;
  /** 自サイトのオリジン（内部リンクの判定に使う。例：https://ginowanku-seinenkai.com） */
  siteOrigin: string;
}
