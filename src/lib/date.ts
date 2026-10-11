// 日本時間の日付処理（00 §4、03 §6.4）

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

interface JstParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
});
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function jstParts(date: Date): JstParts {
  const parts: Record<string, string> = {};
  for (const p of formatter.formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts['year']),
    month: Number(parts['month']),
    day: Number(parts['day']),
    hour: Number(parts['hour']),
    minute: Number(parts['minute']),
    weekday: WEEKDAY_INDEX[parts['weekday'] ?? ''] ?? 0,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 日本時間の 'YYYY-MM-DD' */
export function jstDate(value: Date | string): string {
  const p = jstParts(typeof value === 'string' ? new Date(value) : value);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** 日本時間の今日（'YYYY-MM-DD'）。ビルド中の判定には SiteData.today を使い、これを呼ばない（03 §6.4） */
export function todayJst(now: Date = new Date()): string {
  return jstDate(now);
}

function dateOnlyParts(ymd: string): { year: number; month: number; day: number; weekday: number } {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return { year: y, month: m, day: d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** 公開日：2026年10月10日 */
export function formatPublishedOn(ymd: string): string {
  const p = dateOnlyParts(ymd);
  return `${p.year}年${p.month}月${p.day}日`;
}

function md(p: { month: number; day: number; weekday: number }): string {
  return `${p.month}月${p.day}日（${WEEKDAYS[p.weekday]}）`;
}
function hm(p: JstParts): string {
  return `${p.hour}:${pad(p.minute)}`;
}

export interface EventTime {
  event_starts_at: string | null;
  event_ends_at: string | null;
  event_all_day: boolean;
}

/** 行事の日時（03 §6.4 の表） */
export function formatEventDate(event: EventTime): string {
  if (event.event_starts_at === null) return '';
  const start = jstParts(new Date(event.event_starts_at));
  const end = event.event_ends_at === null ? null : jstParts(new Date(event.event_ends_at));
  const head = `${start.year}年${md(start)}`;
  const sameDay =
    end !== null && end.year === start.year && end.month === start.month && end.day === start.day;

  if (event.event_all_day) {
    return end === null || sameDay ? head : `${head}〜${md(end)}`;
  }
  if (end === null) return `${head}${hm(start)}〜`;
  if (sameDay) return `${head}${hm(start)}〜${hm(end)}`;
  return `${head}${hm(start)}〜${md(end)}${hm(end)}`;
}

/** 行事の <time datetime>：終日は 'YYYY-MM-DD'、時刻ありは 'YYYY-MM-DDTHH:mm:ss+09:00' */
export function eventDatetime(iso: string, allDay: boolean): string {
  const p = jstParts(new Date(iso));
  const ymd = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  return allDay ? ymd : `${ymd}T${pad(p.hour)}:${pad(p.minute)}:00+09:00`;
}

/** トップの「次の行事」の日付の箱（月・日・曜日） */
export function eventDateBox(iso: string): { month: string; day: string; weekday: string } {
  const p = jstParts(new Date(iso));
  return { month: `${p.month}月`, day: String(p.day), weekday: WEEKDAYS[p.weekday] ?? '' };
}
