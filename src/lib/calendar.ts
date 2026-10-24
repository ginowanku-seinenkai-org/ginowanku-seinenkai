// トップの「演舞のカレンダー」の計算（03 §6.5、D-128）。月の表、日ごとの演舞、時刻の表示。ビルドとブラウザの両方で使う
import { CALENDAR } from './messages.ts';
import { jstDate, jstTime, weekdayOf } from './date.ts';
import { postUrl } from './posts.ts';
import type { PublicPost } from './view-schemas.ts';

/** 1日に出す印の数の上限（それより多い日は件数の読み上げで伝える） */
export const MAX_DOTS = 3;
/** 今日の月から前後に動かせる月の数（03 §6.5） */
export const MONTH_RANGE = 12;

/** ページに埋め込む演舞の1件（記事の URL と、カレンダーに出す列だけ） */
export interface CalendarEvent {
  url: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  time_tbd: boolean;
  place: string | null;
  cancelled: boolean;
}

/**
 * 記事から、カレンダーに出す演舞を開始の早い順に選ぶ。仮は公開用ビューに出ないので含まれない
 * @param posts 公開中の記事
 * @returns カレンダーの演舞
 */
export function toCalendarEvents(posts: readonly PublicPost[]): CalendarEvent[] {
  return posts
    .filter(
      (p): p is PublicPost & { event_starts_at: string } =>
        p.kind === 'event' && p.event_starts_at !== null,
    )
    .sort((a, b) => a.event_starts_at.localeCompare(b.event_starts_at) || a.id - b.id)
    .map((p) => ({
      url: postUrl(p),
      title: p.title,
      starts_at: p.event_starts_at,
      ends_at: p.event_ends_at,
      all_day: p.event_all_day,
      time_tbd: p.event_time_tbd,
      place: p.event_place,
      cancelled: p.event_status === 'cancelled',
    }));
}

/**
 * 埋め込んだ文字から演舞を読み戻す。形の合わない項目は捨てる
 * @param text data-events の JSON
 * @returns カレンダーの演舞。読めなければ空
 */
export function parseCalendarEvents(text: string | undefined): CalendarEvent[] {
  if (text === undefined) return [];
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is CalendarEvent =>
      typeof v === 'object' &&
      v !== null &&
      typeof (v as CalendarEvent).url === 'string' &&
      typeof (v as CalendarEvent).title === 'string' &&
      typeof (v as CalendarEvent).starts_at === 'string',
  );
}

/**
 * 'YYYY-MM' の月の、日曜始まりの週ごとの日付（月の外は null）
 * @param month 'YYYY-MM' の月
 * @returns 週ごとに7つずつの日付（'YYYY-MM-DD'）の配列
 */
export function monthWeeks(month: string): (string | null)[][] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: first.getUTCDay() }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

/**
 * 前後の月（'YYYY-MM'）
 * @param month 'YYYY-MM' の月
 * @param diff 動かす月の数（前は負）
 * @returns 動かしたあとの月
 */
export function shiftMonth(month: string, diff: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + diff, 1)).toISOString().slice(0, 7);
}

/**
 * 2つの月の差（b − a の月の数）
 * @param a 'YYYY-MM' の月
 * @param b 'YYYY-MM' の月
 * @returns 月の数の差
 */
export function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number) as [number, number];
  const [by, bm] = b.split('-').map(Number) as [number, number];
  return (by - ay) * 12 + (bm - am);
}

/**
 * 月を動かせるか（今日の月から前後 MONTH_RANGE か月まで）
 * @param month 動かしたあとの 'YYYY-MM'
 * @param today 今日（日本時間の 'YYYY-MM-DD'）
 * @returns 範囲の中なら true
 */
export function inMonthRange(month: string, today: string): boolean {
  return Math.abs(monthDiff(today.slice(0, 7), month)) <= MONTH_RANGE;
}

/**
 * 月を動かしたときに選ぶ日。今日の月なら今日、それ以外は1日（管理画面のカレンダーと同じ）
 * @param month 動かしたあとの 'YYYY-MM'
 * @param today 今日（日本時間の 'YYYY-MM-DD'）
 * @returns 選ぶ日（'YYYY-MM-DD'）
 */
export function defaultDay(month: string, today: string): string {
  return month === today.slice(0, 7) ? today : `${month}-01`;
}

/**
 * 日付ごとに、開始の早い順に並べる（複数日の演舞も開始の日にだけ出す。管理画面と同じ）
 * @param events カレンダーの演舞
 * @returns 日付（日本時間の 'YYYY-MM-DD'）から演舞を引ける表
 */
export function byDay(events: readonly CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    const day = jstDate(e.starts_at);
    map.set(day, [...(map.get(day) ?? []), e]);
  }
  return map;
}

/**
 * 月の見出し（例：2026年10月）
 * @param month 'YYYY-MM' の月
 * @returns 見出しの文字
 */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return CALENDAR.month(y, m);
}

/**
 * 日付のボタンの読み上げ（例：10月10日（土）、演舞1件）
 * @param ymd 日付（'YYYY-MM-DD'）
 * @param count その日の演舞の件数
 * @returns 読み上げの文字
 */
export function dayLabel(ymd: string, count: number): string {
  const [, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return CALENDAR.dayLabel(m, d, weekdayOf(ymd), count);
}

/**
 * 時刻の表示：'18:00'、'18:00〜20:30'、終日、時間未定。終了が別の日なら終了の時刻の前に月日を付ける（管理画面と同じ）
 * @param e 演舞の開始・終了・終日・時間未定
 * @returns 時刻の表示の文字
 */
export function timeLabel(
  e: Pick<CalendarEvent, 'starts_at' | 'ends_at' | 'all_day' | 'time_tbd'>,
): string {
  if (e.all_day) return CALENDAR.allDay;
  if (e.time_tbd) return CALENDAR.timeTbd;
  const start = jstTime(e.starts_at);
  if (e.ends_at === null) return start;
  const end = jstTime(e.ends_at);
  const endDay = jstDate(e.ends_at);
  if (endDay === jstDate(e.starts_at)) return `${start}〜${end}`;
  const [, m, d] = endDay.split('-').map(Number) as [number, number, number];
  return `${start}〜${m}月${d}日 ${end}`;
}
