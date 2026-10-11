// アクセス計測の送る内容と送らない条件（07 UT-05・UT-07、03 §9）
import { describe, expect, it } from 'vitest';
import { buildTrackPayload, referrerHost, shouldTrack, trackPath } from '../../src/lib/track.ts';

describe('UT-05 送る内容', () => {
  it('パスは末尾の .html と / を除く。/ はそのまま', () => {
    expect(trackPath('/about.html')).toBe('/about');
    expect(trackPath('/news/')).toBe('/news');
    expect(trackPath('/')).toBe('/');
  });
  it('200文字を超えるパスは計測しない', () => {
    expect(buildTrackPayload(`/${'a'.repeat(200)}`, '')).toBeNull();
  });
  it('流入元はホスト名だけ（小文字）', () => {
    expect(referrerHost('https://WWW.Instagram.com/p/abc?x=1')).toBe('www.instagram.com');
  });
  it('自サイトとそのサブドメインは (internal)', () => {
    expect(referrerHost('https://ginowanku-seinenkai.com/news')).toBe('(internal)');
    expect(referrerHost('https://www.ginowanku-seinenkai.com/')).toBe('(internal)');
  });
  it('空・解釈できない・http(s) 以外・100文字超は null', () => {
    expect(referrerHost('')).toBeNull();
    expect(referrerHost('not a url')).toBeNull();
    expect(referrerHost('android-app://com.instagram.android/')).toBeNull();
    expect(referrerHost(`https://${'a'.repeat(95)}.example/`)).toBeNull();
  });
  it('送る内容にクエリ・URL 全体を含めない', () =>
    expect(buildTrackPayload('/news', 'https://example.com/path?q=1')).toEqual({
      path: '/news',
      referrer_host: 'example.com',
    }));
});

describe('UT-07 送らない条件', () => {
  const ok = {
    siteEnv: 'production',
    hostname: 'ginowanku-seinenkai.com',
    webdriver: false,
    globalPrivacyControl: undefined,
    doNotTrack: null,
  };
  it('すべて満たさないときだけ送る', () => expect(shouldTrack(ok)).toBe(true));
  it.each([
    { siteEnv: 'preview' },
    { siteEnv: 'local' },
    { hostname: 'ginowanku-seinenkai.pages.dev' },
    { webdriver: true },
    { globalPrivacyControl: true },
    { doNotTrack: '1' },
  ])('%o では送らない', (change) => expect(shouldTrack({ ...ok, ...change })).toBe(false));
});
