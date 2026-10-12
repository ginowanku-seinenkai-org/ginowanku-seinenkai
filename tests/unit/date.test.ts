// 日本時間の日付処理（07 UT-01、03 §6.4）
import { describe, expect, it } from 'vitest';
import {
  eventDatetime,
  formatEventDate,
  formatPublishedOn,
  jstDate,
  todayJst,
} from '../../src/lib/date.ts';

describe('todayJst（UT-01）', () => {
  it('UTC 14:59 は前日、UTC 15:00 は当日', () => {
    expect(todayJst(new Date('2026-10-09T14:59:59Z'))).toBe('2026-10-09');
    expect(todayJst(new Date('2026-10-09T15:00:00Z'))).toBe('2026-10-10');
  });
  it('jstDate は ISO 文字列も受け取る', () => {
    expect(jstDate('2026-12-31T15:00:00Z')).toBe('2027-01-01');
  });
});

describe('formatPublishedOn', () => {
  it('YYYY年M月D日', () => expect(formatPublishedOn('2026-10-01')).toBe('2026年10月1日'));
});

describe('formatEventDate（03 §6.4 の表）', () => {
  const ev = (start: string, end: string | null, allDay = false, timeTbd = false) => ({
    event_starts_at: start,
    event_ends_at: end,
    event_all_day: allDay,
    event_time_tbd: timeTbd,
  });
  it('時刻あり・同日', () =>
    expect(formatEventDate(ev('2026-10-10T18:00:00+09:00', '2026-10-10T21:00:00+09:00'))).toBe(
      '2026年10月10日（土）18:00〜21:00',
    ));
  it('時刻あり・終了なし', () =>
    expect(formatEventDate(ev('2026-10-10T09:05:00+09:00', null))).toBe(
      '2026年10月10日（土）9:05〜',
    ));
  it('時刻あり・複数日', () =>
    expect(formatEventDate(ev('2026-10-10T18:00:00+09:00', '2026-10-11T02:00:00+09:00'))).toBe(
      '2026年10月10日（土）18:00〜10月11日（日）2:00',
    ));
  it('終日・1日', () =>
    expect(formatEventDate(ev('2026-10-10T00:00:00+09:00', null, true))).toBe(
      '2026年10月10日（土）',
    ));
  it('終日・複数日', () =>
    expect(
      formatEventDate(ev('2026-10-10T00:00:00+09:00', '2026-10-12T00:00:00+09:00', true)),
    ).toBe('2026年10月10日（土）〜10月12日（月）'));
  it('時間未定・1日（D-68）', () =>
    expect(formatEventDate(ev('2026-11-22T00:00:00+09:00', null, false, true))).toBe(
      '2026年11月22日（日）時間未定',
    ));
  it('時間未定・複数日（D-68）', () =>
    expect(
      formatEventDate(ev('2026-11-22T00:00:00+09:00', '2026-11-23T00:00:00+09:00', false, true)),
    ).toBe('2026年11月22日（日）〜11月23日（月）時間未定'));
  it('UTC で前日でも日本時間の日付で表示する', () =>
    expect(formatEventDate(ev('2026-10-09T15:30:00Z', null))).toBe('2026年10月10日（土）0:30〜'));
});

describe('eventDatetime', () => {
  it('終日は日付だけ、時刻ありは +09:00 付き', () => {
    expect(eventDatetime('2026-10-10T00:00:00+09:00', true)).toBe('2026-10-10');
    expect(eventDatetime('2026-10-10T09:00:00Z', false)).toBe('2026-10-10T18:00:00+09:00');
  });
});
