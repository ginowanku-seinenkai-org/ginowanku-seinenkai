// 演舞のカレンダーの計算（03 §6.5、D-128）
import { describe, expect, it } from 'vitest';
import {
  MAX_DOTS,
  byDay,
  dayLabel,
  defaultDay,
  inMonthRange,
  monthDiff,
  monthLabel,
  monthWeeks,
  parseCalendarEvents,
  shiftMonth,
  timeLabel,
  toCalendarEvents,
  type CalendarEvent,
} from '../../src/lib/calendar.ts';
import { formatDateWithWeekday, jstTime, weekdayOf } from '../../src/lib/date.ts';
import type { PublicPost } from '../../src/lib/view-schemas.ts';
import { rows } from './helpers.ts';

function post(id: number, extra: Partial<PublicPost> = {}): PublicPost {
  return { ...(rows.post as PublicPost), id, title: `記事${id}`, ...extra };
}

function ev(starts_at: string, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    url: '/news/1',
    title: '演舞',
    starts_at,
    ends_at: null,
    all_day: false,
    time_tbd: false,
    place: null,
    cancelled: false,
    ...extra,
  };
}

describe('toCalendarEvents', () => {
  it('開始日時のある演舞だけを開始の早い順に、URL と中止の印を付けて返す', () => {
    const posts = [
      post(1, { kind: 'news' }),
      post(2, { kind: 'event', event_starts_at: null }),
      post(3, {
        kind: 'event',
        event_starts_at: '2026-10-25T17:00:00+09:00',
        event_ends_at: '2026-10-25T19:00:00+09:00',
        event_place: '公民館',
        event_status: 'cancelled',
      }),
      post(4, { kind: 'event', event_starts_at: '2026-10-10T18:00:00+09:00', event_status: null }),
      post(5, { kind: 'activity', event_starts_at: '2026-10-01T18:00:00+09:00' }),
    ];
    expect(toCalendarEvents(posts)).toEqual([
      {
        url: '/news/4',
        title: '記事4',
        starts_at: '2026-10-10T18:00:00+09:00',
        ends_at: null,
        all_day: false,
        time_tbd: false,
        place: null,
        cancelled: false,
      },
      {
        url: '/news/3',
        title: '記事3',
        starts_at: '2026-10-25T17:00:00+09:00',
        ends_at: '2026-10-25T19:00:00+09:00',
        all_day: false,
        time_tbd: false,
        place: '公民館',
        cancelled: true,
      },
    ]);
  });

  it('埋め込んだ JSON から読み戻せる。壊れた値は空か、その項目を捨てる', () => {
    const events = [ev('2026-10-10T18:00:00+09:00')];
    expect(parseCalendarEvents(JSON.stringify(events))).toEqual(events);
    expect(parseCalendarEvents(undefined)).toEqual([]);
    expect(parseCalendarEvents('{')).toEqual([]);
    expect(parseCalendarEvents('{"a":1}')).toEqual([]);
    expect(parseCalendarEvents(JSON.stringify([null, { url: 1 }, ...events]))).toEqual(events);
  });
});

describe('月の表', () => {
  it('日曜始まりで、月の外は null。2026年10月は木曜始まりの5週', () => {
    const weeks = monthWeeks('2026-10');
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(weeks[4]).toEqual([
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
    ]);
    for (const week of weeks) expect(week).toHaveLength(7);
  });

  it('うるう年の2月、日曜始まりの月', () => {
    expect(monthWeeks('2028-02').flat().filter(Boolean)).toHaveLength(29);
    expect(monthWeeks('2027-02').flat().filter(Boolean)).toHaveLength(28);
    expect(monthWeeks('2026-11')[0]?.[0]).toBe('2026-11-01');
  });

  it('月を前後に動かす（年をまたぐ）', () => {
    expect(shiftMonth('2026-10', 1)).toBe('2026-11');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-10', -12)).toBe('2025-10');
    expect(monthDiff('2026-10', '2027-10')).toBe(12);
    expect(monthDiff('2026-10', '2025-12')).toBe(-10);
  });

  it('動かせるのは今日の月から前後12か月まで', () => {
    expect(inMonthRange('2027-10', '2026-10-10')).toBe(true);
    expect(inMonthRange('2027-11', '2026-10-10')).toBe(false);
    expect(inMonthRange('2025-10', '2026-10-10')).toBe(true);
    expect(inMonthRange('2025-09', '2026-10-10')).toBe(false);
  });

  it('月を動かしたら、今日の月は今日、ほかの月は1日を選ぶ', () => {
    expect(defaultDay('2026-10', '2026-10-10')).toBe('2026-10-10');
    expect(defaultDay('2026-11', '2026-10-10')).toBe('2026-11-01');
  });
});

describe('byDay', () => {
  it('日本時間の開始日でまとめ、開始の早い順に並べる', () => {
    const late = ev('2026-10-10T18:00:00+09:00', { title: '夜' });
    const early = ev('2026-10-10T09:00:00+09:00', { title: '朝' });
    const map = byDay([late, early]);
    expect(map.get('2026-10-10')?.map((e) => e.title)).toEqual(['朝', '夜']);
  });

  it('UTC では前の日でも、日本時間の0時以降はその日に入る', () => {
    // 2026-10-09T15:00Z は日本時間の10月10日0:00、14:59Z は10月9日23:59
    const map = byDay([ev('2026-10-09T15:00:00Z'), ev('2026-10-09T14:59:00Z')]);
    expect(map.get('2026-10-10')).toHaveLength(1);
    expect(map.get('2026-10-09')).toHaveLength(1);
  });

  it('複数日の演舞は開始の日にだけ出す（管理画面と同じ）', () => {
    const map = byDay([
      ev('2026-11-03T00:00:00+09:00', { all_day: true, ends_at: '2026-11-04T00:00:00+09:00' }),
    ]);
    expect([...map.keys()]).toEqual(['2026-11-03']);
  });

  it('印の上限は3つ', () => expect(MAX_DOTS).toBe(3));
});

describe('文字', () => {
  it('月の見出し', () => expect(monthLabel('2026-10')).toBe('2026年10月'));

  it('日付のボタンの読み上げ（06）', () => {
    expect(dayLabel('2026-10-10', 1)).toBe('10月10日（土）、演舞1件');
    expect(dayLabel('2026-10-09', 2)).toBe('10月9日（金）、演舞2件');
    expect(dayLabel('2026-11-01', 0)).toBe('11月1日（日）、演舞なし');
  });

  it('時刻：開始だけ、同じ日の終了、別の日の終了、終日、時間未定', () => {
    expect(timeLabel(ev('2026-10-20T18:00:00+09:00'))).toBe('18:00');
    expect(
      timeLabel(ev('2026-10-10T09:00:00+09:00', { ends_at: '2026-10-10T20:30:00+09:00' })),
    ).toBe('9:00〜20:30');
    expect(
      timeLabel(ev('2026-10-10T22:00:00+09:00', { ends_at: '2026-10-11T02:00:00+09:00' })),
    ).toBe('22:00〜10月11日 2:00');
    expect(timeLabel(ev('2026-11-03T00:00:00+09:00', { all_day: true }))).toBe('終日');
    expect(timeLabel(ev('2026-11-22T00:00:00+09:00', { time_tbd: true }))).toBe('時間未定');
  });

  it('日付の表示の部品（日本時間）', () => {
    expect(formatDateWithWeekday('2026-10-10')).toBe('2026年10月10日（土）');
    expect(weekdayOf('2026-10-11')).toBe('日');
    expect(jstTime('2026-10-09T15:05:00Z')).toBe('0:05');
  });
});
