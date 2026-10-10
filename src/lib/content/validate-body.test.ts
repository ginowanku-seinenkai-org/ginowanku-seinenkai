// validateBody() のテスト（07 RB-50、RB-51 の画面・ビルド側、D-29、D-52）
import { describe, expect, it } from 'vitest';
import { MAX_BODY_BYTES, validateBody } from './validate-body.ts';

const PHOTO_ID = '0f0e0d0c-0b0a-4908-8706-050403020100';

function docOf(...content: unknown[]) {
  return { type: 'doc', content };
}

/** JSON.stringify の UTF-8 バイト数がちょうど bytes になる文書（1文字3バイトの文字で埋める） */
function docOfBytes(bytes: number) {
  const base = new TextEncoder().encode(
    JSON.stringify(docOf({ type: 'paragraph', content: [{ type: 'text', text: '' }] })),
  ).length;
  const rest = bytes - base;
  const text = 'あ'.repeat(Math.floor(rest / 3)) + 'a'.repeat(rest % 3);
  return docOf({ type: 'paragraph', content: [{ type: 'text', text }] });
}

describe('validateBody', () => {
  it('RB-50 許可した要素だけなら合格', () => {
    const doc = docOf(
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '見出し' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '太字', marks: [{ type: 'bold' }] },
          { type: 'hardBreak' },
          {
            type: 'text',
            text: 'リンク',
            marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
          },
        ],
      },
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [] }] }],
      },
      { type: 'orderedList', content: [] },
      { type: 'photo', attrs: { photoId: PHOTO_ID, caption: '説明' } },
      { type: 'youtube', attrs: { videoId: 'M7lc1UVf-VE', title: '題名' } },
    );
    expect(validateBody(doc)).toEqual({ valid: true, bytes: expect.any(Number), errors: [] });
  });

  it('RB-50 許可外のノード・マーク・属性があると不合格', () => {
    const result = validateBody(
      docOf(
        { type: 'codeBlock', content: [] },
        {
          type: 'paragraph',
          attrs: { class: 'x' },
          content: [{ type: 'text', text: 'x', marks: [{ type: 'italic' }] }],
        },
        { type: 'photo', attrs: { photoId: PHOTO_ID, src: 'https://evil.example/x.jpg' } },
        {
          type: 'text',
          text: 'x',
          marks: [{ type: 'link', attrs: { href: 'https://example.com', target: '_self' } }],
        },
      ),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => `${e.code}:${e.name ?? ''}`)).toEqual([
      'unknown_node:codeBlock',
      'unknown_attribute:attrs',
      'unknown_mark:italic',
      'unknown_attribute:src',
      'unknown_attribute:target',
    ]);
  });

  it('文書でないものは不合格', () => {
    for (const input of [null, [], 'doc', { type: 'paragraph' }]) {
      expect(validateBody(input).valid).toBe(false);
    }
  });

  it('D-52 題名は100文字まで、説明文は120文字まで', () => {
    expect(
      validateBody(
        docOf({ type: 'youtube', attrs: { videoId: 'M7lc1UVf-VE', title: 'あ'.repeat(100) } }),
      ).valid,
    ).toBe(true);
    expect(
      validateBody(
        docOf({ type: 'youtube', attrs: { videoId: 'M7lc1UVf-VE', title: 'あ'.repeat(101) } }),
      ).errors[0]?.code,
    ).toBe('title_too_long');
    expect(
      validateBody(
        docOf({ type: 'photo', attrs: { photoId: PHOTO_ID, caption: '🥁'.repeat(120) } }),
      ).valid,
    ).toBe(true);
    expect(
      validateBody(
        docOf({ type: 'photo', attrs: { photoId: PHOTO_ID, caption: '🥁'.repeat(121) } }),
      ).errors[0]?.code,
    ).toBe('caption_too_long');
  });

  it('RB-51 サイズは JSON.stringify の UTF-8 バイト数で100,000まで（日本語を含む）', () => {
    const atLimit = validateBody(docOfBytes(MAX_BODY_BYTES));
    expect(atLimit.bytes).toBe(100_000);
    expect(atLimit.valid).toBe(true);
    const over = validateBody(docOfBytes(MAX_BODY_BYTES + 1));
    expect(over.bytes).toBe(100_001);
    expect(over.errors.map((e) => e.code)).toEqual(['too_large']);
  });

  it('入れ子の深さが20を超えると不合格（renderBody が出力しない部分）', () => {
    let node: unknown = { type: 'paragraph', content: [] };
    for (let i = 0; i < 25; i += 1)
      node = { type: 'bulletList', content: [{ type: 'listItem', content: [node] }] };
    expect(validateBody(docOf(node)).errors.map((e) => e.code)).toContain('too_deep');
  });
});
