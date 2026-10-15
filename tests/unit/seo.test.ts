// title・description・JSON-LD（03 §11）
import { describe, expect, it } from 'vitest';
import {
  absoluteUrl,
  buildMeta,
  descriptionFromBody,
  eventJsonLd,
  organizationJsonLd,
  serializeJsonLd,
  SITE_ORIGIN,
  withSiteOgImage,
} from '../../src/lib/seo.ts';
import type { PublicPost } from '../../src/lib/view-schemas.ts';

describe('buildMeta', () => {
  it('トップ・各ページ・2ページ目以降の title', () => {
    expect(buildMeta({ name: null, path: '/' }).title).toBe('宜野湾区青年会｜沖縄県宜野湾市');
    expect(buildMeta({ name: '活動記録', path: '/activities' }).title).toBe(
      '活動記録｜宜野湾区青年会',
    );
    expect(buildMeta({ name: 'お知らせ・行事', page: 2, path: '/news/page/2' }).title).toBe(
      'お知らせ・行事（2ページ目）｜宜野湾区青年会',
    );
  });
  it('og:title は「｜宜野湾区青年会」を除いたもの。画像がなければ共通画像', () => {
    const meta = buildMeta({ name: '活動記録', path: '/activities' });
    expect(meta.ogTitle).toBe('活動記録');
    expect(meta.ogImage).toEqual({
      url: 'https://ginowanku-seinenkai.com/og-default.jpg',
      width: 1200,
      height: 630,
      alt: '宜野湾区青年会',
    });
  });
  it('canonical は末尾スラッシュ・.html なし。404 には付けない', () => {
    expect(absoluteUrl('/news/')).toBe('https://ginowanku-seinenkai.com/news');
    expect(absoluteUrl('/about.html')).toBe('https://ginowanku-seinenkai.com/about');
    expect(absoluteUrl('/')).toBe('https://ginowanku-seinenkai.com/');
    expect(buildMeta({ name: 'x', path: '/404', noCanonical: true }).canonical).toBeNull();
  });
});

describe('descriptionFromBody', () => {
  const doc = (text: string) => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
  it('120文字を超えたら「…」', () => {
    expect(descriptionFromBody(doc('あ'.repeat(120)), 'x')).toBe('あ'.repeat(120));
    expect(descriptionFromBody(doc('あ'.repeat(121)), 'x')).toBe(`${'あ'.repeat(120)}…`);
  });
  it('空なら固定文', () => expect(descriptionFromBody(doc(''), '固定文')).toBe('固定文'));
});

describe('JSON-LD', () => {
  it('< を \\u003c に置き換える', () =>
    expect(serializeJsonLd({ a: '</script>' })).toBe('{"a":"\\u003c/script>"}'));
  it('Organization の sameAs は null を除き、すべて null なら出さない', () => {
    const settings = {
      og_photo_id: null,
      instagram_url: 'https://www.instagram.com/x',
      facebook_url: null,
      tiktok_url: null,
      join_age_label: '高校生以上',
    };
    expect(organizationJsonLd(settings)['sameAs']).toEqual(['https://www.instagram.com/x']);
    expect(organizationJsonLd({ ...settings, instagram_url: null })).not.toHaveProperty('sameAs');
  });
  it('Event は場所がなければ出さない', () => {
    const post: PublicPost = {
      id: 1,
      kind: 'event',
      title: '行事',
      body: null,
      cover_photo_id: null,
      event_starts_at: '2026-10-10T09:00:00Z',
      event_ends_at: null,
      event_all_day: false,
      event_time_tbd: false,
      event_place: '公民館',
      published_on: '2026-10-01',
      updated_at: '2026-10-01T00:00:00Z',
    };
    expect(eventJsonLd(post, '説明', null)).toMatchObject({
      startDate: '2026-10-10T18:00:00+09:00',
      url: 'https://ginowanku-seinenkai.com/news/1',
    });
    expect(eventJsonLd({ ...post, event_place: null }, '説明', null)).toBeNull();
    // 時間未定は終日と同じく日付だけ（D-68）
    expect(
      eventJsonLd(
        {
          ...post,
          event_starts_at: '2026-11-21T15:00:00Z',
          event_ends_at: '2026-11-22T15:00:00Z',
          event_time_tbd: true,
        },
        '説明',
        null,
      ),
    ).toMatchObject({ startDate: '2026-11-22', endDate: '2026-11-23' });
  });
});

describe('withSiteOgImage（D-85）', () => {
  const photo = {
    id: '11111111-1111-4111-8111-111111111111',
    full_path: 'x/full.jpg',
    thumb_path: 'x/thumb.jpg',
    width: 1600,
    height: 900,
    thumb_width: 480,
    thumb_height: 270,
    alt: '演舞の写真',
  };
  it('自分の画像がないページだけ、サイト設定の画像に替える', () => {
    const plain = buildMeta({ name: 'x', path: '/x' });
    expect(withSiteOgImage(plain, photo).ogImage).toEqual({
      url: `${SITE_ORIGIN}/photos/${photo.id}/full.jpg`,
      width: 1600,
      height: 900,
      alt: '演舞の写真',
    });
    expect(withSiteOgImage(plain, undefined)).toBe(plain);
    const own = buildMeta({
      name: 'x',
      path: '/x',
      image: { ...photo, id: '22222222-2222-4222-8222-222222222222' },
    });
    expect(withSiteOgImage(own, photo)).toBe(own);
  });
});
