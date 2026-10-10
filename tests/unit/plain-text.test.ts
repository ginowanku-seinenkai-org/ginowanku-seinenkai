// bodyToPlainText・isEmptyBody（03 §5.5）
import { describe, expect, it } from 'vitest';
import { bodyToPlainText, isEmptyBody } from '../../src/lib/plain-text.ts';

const PHOTO = { type: 'photo', attrs: { photoId: '0f0e0d0c-0b0a-4908-8706-050403020100' } };

describe('bodyToPlainText', () => {
  it('文字を順につなぎ、ブロックの区切りは空白1つ、写真・動画は無視する', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '見出し' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '一行目' },
            { type: 'hardBreak' },
            { type: 'text', text: '二行目' },
          ],
        },
        PHOTO,
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '  項目  ' }] }],
            },
          ],
        },
      ],
    };
    expect(bodyToPlainText(doc)).toBe('見出し 一行目 二行目 項目');
  });
  it('文書でなければ空文字', () => expect(bodyToPlainText(null)).toBe(''));
});

describe('isEmptyBody', () => {
  it('空・空白だけなら true、写真や動画だけなら false', () => {
    expect(isEmptyBody({ type: 'doc', content: [] })).toBe(true);
    expect(
      isEmptyBody({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }],
      }),
    ).toBe(true);
    expect(isEmptyBody({ type: 'doc', content: [PHOTO] })).toBe(false);
    expect(
      isEmptyBody({
        type: 'doc',
        content: [{ type: 'youtube', attrs: { videoId: 'M7lc1UVf-VE' } }],
      }),
    ).toBe(false);
    expect(isEmptyBody(undefined)).toBe(true);
  });
});
