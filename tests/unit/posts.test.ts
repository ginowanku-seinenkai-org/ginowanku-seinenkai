// 並び替え、ページ分割、URL、終了・中止の判定（07 UT-02・UT-31、03 §3.7・§6.3、13 §6.3）
import { describe, expect, it } from 'vitest';
import type { SiteData } from '../../src/lib/data.ts';
import {
  activityPosts,
  eventEndDate,
  isCancelled,
  isEnded,
  newsPosts,
  pageUrl,
  paginate,
  postUrl,
  upcomingEvents,
} from '../../src/lib/posts.ts';
import { VIEW_COLUMNS, publicPostSchema, type PublicPost } from '../../src/lib/view-schemas.ts';
import { rows } from './helpers.ts';

function post(id: number, kind: PublicPost['kind'], extra: Partial<PublicPost> = {}): PublicPost {
  return {
    id,
    kind,
    title: `記事${id}`,
    body: { type: 'doc', content: [] },
    cover_photo_id: null,
    event_starts_at: null,
    event_ends_at: null,
    event_all_day: false,
    event_time_tbd: false,
    event_place: null,
    published_on: '2026-10-01',
    updated_at: '2026-10-01T00:00:00Z',
    ...extra,
  };
}
const ev = (id: number, start: string, end: string | null = null, allDay = false) =>
  post(id, 'event', { event_starts_at: start, event_ends_at: end, event_all_day: allDay });
const cancelled = (id: number, start: string) =>
  post(id, 'event', { event_starts_at: start, event_status: 'cancelled' });

function data(posts: PublicPost[], today = '2026-10-10'): SiteData {
  return {
    source: 'fixture',
    today,
    posts,
    postPhotos: new Map(),
    pages: {} as SiteData['pages'],
    settings: {} as SiteData['settings'],
    officers: [],
    photos: new Map(),
  };
}

describe('isEnded・eventEndDate（UT-02、01 §3.2）', () => {
  it('終了日が今日なら終了していない、昨日なら終了', () => {
    expect(
      isEnded(ev(1, '2026-10-10T18:00:00+09:00', '2026-10-10T21:00:00+09:00'), '2026-10-10'),
    ).toBe(false);
    expect(
      isEnded(ev(1, '2026-10-09T18:00:00+09:00', '2026-10-09T21:00:00+09:00'), '2026-10-10'),
    ).toBe(true);
  });
  it('終了日時がなければ開始日で判定する', () => {
    expect(isEnded(ev(1, '2026-10-10T18:00:00+09:00'), '2026-10-10')).toBe(false);
    expect(isEnded(ev(1, '2026-10-09T18:00:00+09:00'), '2026-10-10')).toBe(true);
  });
  it('終日の演舞は終了日の翌日に終了', () => {
    const allDay = ev(1, '2026-10-08T00:00:00+09:00', '2026-10-10T00:00:00+09:00', true);
    expect(isEnded(allDay, '2026-10-10')).toBe(false);
    expect(isEnded(allDay, '2026-10-11')).toBe(true);
  });
  it('UTC と日本時間のずれ：UTC で前日の 15:30 は日本時間の当日', () => {
    expect(eventEndDate(ev(1, '2026-10-09T15:30:00Z'))).toBe('2026-10-10');
  });
  it('演舞以外は終了しない', () => {
    expect(eventEndDate(post(1, 'news'))).toBeNull();
    expect(isEnded(post(1, 'news'), '2099-01-01')).toBe(false);
  });
});

describe('一覧の並び（03 §6.3）', () => {
  const posts = [
    post(5, 'news', { published_on: '2026-10-05' }),
    ev(4, '2026-09-01T10:00:00+09:00'),
    ev(3, '2026-10-20T10:00:00+09:00'),
    ev(2, '2026-10-12T10:00:00+09:00'),
    ev(1, '2026-08-01T10:00:00+09:00'),
    post(6, 'activity'),
  ];
  it('すべて：活動記録を除き、受け取った順（published_on 降順・id 降順）', () => {
    expect(newsPosts(data(posts)).map((p) => p.id)).toEqual([5, 4, 3, 2, 1]);
  });
  it('演舞：終了していないものを開始の早い順 → 終了したものを開始の遅い順（F-10）', () => {
    expect(newsPosts(data(posts), 'event').map((p) => p.id)).toEqual([2, 3, 4, 1]);
  });
  it('次回演舞：終了していないものを開始の早い順に limit 件', () => {
    expect(upcomingEvents(data(posts), 1).map((p) => p.id)).toEqual([2]);
  });
  it('活動記録だけ', () => expect(activityPosts(data(posts)).map((p) => p.id)).toEqual([6]));
});

describe('中止の演舞（UT-31、13 §6.2・§6.3）', () => {
  const posts = [
    ev(4, '2026-09-01T10:00:00+09:00'),
    cancelled(5, '2026-10-11T10:00:00+09:00'),
    ev(3, '2026-10-20T10:00:00+09:00', null),
    cancelled(6, '2026-09-15T10:00:00+09:00'),
    post(2, 'event', { event_starts_at: '2026-10-12T10:00:00+09:00', event_status: 'confirmed' }),
    ev(1, '2026-08-01T10:00:00+09:00'),
  ];
  it('isCancelled：中止の演舞だけ true。確定・列がない行・演舞以外は false', () => {
    expect(isCancelled(cancelled(1, '2026-10-11T10:00:00+09:00'))).toBe(true);
    expect(isCancelled(post(1, 'event', { event_status: 'confirmed' }))).toBe(false);
    expect(isCancelled(post(1, 'event', { event_status: null }))).toBe(false);
    // event_status の列がない行（DB の反映前）は確定として扱う
    expect(isCancelled(ev(1, '2026-10-11T10:00:00+09:00'))).toBe(false);
    expect(isCancelled(post(1, 'news', { event_status: 'cancelled' }))).toBe(false);
  });
  it('次回演舞：中止を除く', () => {
    expect(upcomingEvents(data(posts), 3).map((p) => p.id)).toEqual([2, 3]);
  });
  it('演舞のカテゴリ：終わっていない・中止でないものを開始の早い順 → 終わったものと中止を開始の遅い順', () => {
    expect(newsPosts(data(posts), 'event').map((p) => p.id)).toEqual([2, 3, 5, 6, 4, 1]);
  });
  it('中止の演舞も一覧（すべて）には残る', () => {
    expect(newsPosts(data(posts)).map((p) => p.id)).toEqual([4, 5, 3, 6, 2, 1]);
  });
});

describe('v_public_posts の event_status（13 §3.7・§6.3）', () => {
  it('取得する列の末尾（13列目）に event_status', () => {
    const columns = VIEW_COLUMNS.v_public_posts.split(',');
    expect(columns).toHaveLength(13);
    expect(columns.at(-1)).toBe('event_status');
  });
  it('確定・中止・null と、列がない行を受け付け、仮やほかの値は受け付けない', () => {
    for (const status of ['confirmed', 'cancelled', null])
      expect(publicPostSchema.parse({ ...rows.post, event_status: status }).event_status).toBe(
        status,
      );
    const withoutStatus: Record<string, unknown> = { ...rows.post };
    delete withoutStatus['event_status'];
    expect(publicPostSchema.parse(withoutStatus).event_status).toBeUndefined();
    for (const status of ['tentative', 'draft', ''])
      expect(publicPostSchema.safeParse({ ...rows.post, event_status: status }).success).toBe(
        false,
      );
  });
});

describe('paginate・URL', () => {
  it('12件ずつに分ける。0件でも1ページ目を返す', () => {
    const pages = paginate(Array.from({ length: 25 }, (_, i) => i));
    expect(pages.map((p) => p.items.length)).toEqual([12, 12, 1]);
    expect(pages[2]?.lastPage).toBe(3);
    expect(paginate([])).toEqual([{ items: [], currentPage: 1, lastPage: 1 }]);
  });
  it('1ページ目は /page/1 を作らない', () => {
    expect(pageUrl('/news', 1)).toBe('/news');
    expect(pageUrl('/news/category/event', 2)).toBe('/news/category/event/page/2');
  });
  it('活動記録は /activities、それ以外は /news', () => {
    expect(postUrl({ id: 3, kind: 'activity' })).toBe('/activities/3');
    expect(postUrl({ id: 3, kind: 'recruit' })).toBe('/news/3');
  });
});
