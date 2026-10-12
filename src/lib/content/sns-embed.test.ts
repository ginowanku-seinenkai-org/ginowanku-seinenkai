// RB-52a（07 §4、D-70）：TikTok・Instagram の投稿の URL から埋め込みの属性を取り出す
import { describe, expect, it } from 'vitest';
import { parseInstagramUrl, parseTikTokUrl } from './sns-embed.ts';
import { validateBody } from './validate-body.ts';

describe('parseTikTokUrl', () => {
  it.each([
    [
      'https://www.tiktok.com/@ginowanku.seinenkai/video/7123456789012345678',
      'ginowanku.seinenkai',
    ],
    [
      'https://www.tiktok.com/@seinen_kai/video/7123456789012345678?is_from_webapp=1&sender_device=pc',
      'seinen_kai',
    ],
    ['https://m.tiktok.com/@abc/video/7123456789012345678', 'abc'],
    ['https://tiktok.com/@abc/photo/7123456789012345678', 'abc'],
    ['  https://www.tiktok.com/@abc/video/7123456789012345678/  ', 'abc'],
  ])('%s', (url, author) =>
    expect(parseTikTokUrl(url)).toEqual({ videoId: '7123456789012345678', author }),
  );

  it.each([
    'https://vt.tiktok.com/ZSabcdef/', // 短縮 URL（番号が分からない）
    'https://vm.tiktok.com/ZSabcdef/',
    'https://www.tiktok.com/t/ZTabcdef/',
    'https://www.tiktok.com/@abc', // アカウントのページ
    'https://www.tiktok.com/@abc/video/abc',
    'https://www.tiktok.com/@a/b/video/7123456789012345678',
    'https://www.tiktok.com/@ab"c/video/7123456789012345678',
    'https://evil.example/@abc/video/7123456789012345678',
    'https://www.tiktok.com.evil.example/@abc/video/7123456789012345678',
    'javascript:alert(1)',
    'ftp://www.tiktok.com/@abc/video/7123456789012345678',
    '',
    'tiktok',
  ])('受け付けない：%s', (url) => expect(parseTikTokUrl(url)).toBeNull());
});

describe('parseInstagramUrl', () => {
  it.each([
    ['https://www.instagram.com/p/C8xR1nTSf3k/', { kind: 'p', postId: 'C8xR1nTSf3k' }],
    [
      'https://www.instagram.com/p/C8xR1nTSf3k/?utm_source=ig_web_copy_link',
      { kind: 'p', postId: 'C8xR1nTSf3k' },
    ],
    ['https://instagram.com/reel/DA_b-12345', { kind: 'reel', postId: 'DA_b-12345' }],
    ['https://www.instagram.com/reels/DA_b-12345/', { kind: 'reel', postId: 'DA_b-12345' }],
    [
      'https://www.instagram.com/ginowanku_seinenkai/p/C8xR1nTSf3k/',
      { kind: 'p', postId: 'C8xR1nTSf3k' },
    ],
    [
      'https://www.instagram.com/ginowanku_seinenkai/reel/DA_b-12345/',
      { kind: 'reel', postId: 'DA_b-12345' },
    ],
  ])('%s', (url, expected) => expect(parseInstagramUrl(url)).toEqual(expected));

  it.each([
    'https://www.instagram.com/ginowanku_seinenkai/', // アカウントのページ
    'https://www.instagram.com/stories/abc/123/',
    'https://www.instagram.com/tv/C8xR1nTSf3k/',
    'https://www.instagram.com/p/abc/', // 短すぎる
    'https://www.instagram.com/a/b/p/C8xR1nTSf3k/', // 種類の位置が違う
    'https://www.instagram.com/p/C8x"R1/',
    'https://instagr.am/p/C8xR1nTSf3k/',
    'https://evil.example/p/C8xR1nTSf3k/',
    'javascript:alert(1)',
    '',
  ])('受け付けない：%s', (url) => expect(parseInstagramUrl(url)).toBeNull());
});

describe('validateBody（D-70）', () => {
  it('tiktok・instagram の決まった属性は通り、余分な属性と長すぎる題名は誤り', () => {
    const ok = {
      type: 'doc',
      content: [
        { type: 'tiktok', attrs: { videoId: '7123456789012345678', author: 'abc', title: '動画' } },
        { type: 'instagram', attrs: { kind: 'p', postId: 'C8xR1nTSf3k', title: '投稿' } },
      ],
    };
    expect(validateBody(ok).valid).toBe(true);
    const bad = {
      type: 'doc',
      content: [
        { type: 'tiktok', attrs: { videoId: '7123456789012345678', author: 'abc', src: 'x' } },
        { type: 'instagram', attrs: { kind: 'p', postId: 'C8xR1nTSf3k', title: 'あ'.repeat(101) } },
      ],
    };
    expect(validateBody(bad).errors.map((e) => e.code)).toEqual([
      'unknown_attribute',
      'title_too_long',
    ]);
  });
});
