// 日本時間の日付処理（00 §4、03 §6.4）

// 曜日の表示（0 が日曜）
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

// 日本時間の年月日・時分・曜日
interface JstParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

// 日本時間の各部分を取り出すための書式
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
// formatter の曜日の名前から番号へ
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * 日時を日本時間の年月日・時分・曜日に分ける
 * @param date 日時
 * @returns 日本時間の各部分
 */
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

/**
 * 2桁にそろえる（先頭を 0 で埋める）
 * @param n 数
 * @returns 2桁以上の文字列
 */
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 日本時間の日付にする
 * @param value 日時（ISO 8601 の文字列か Date）
 * @returns 日本時間の 'YYYY-MM-DD'
 */
export function jstDate(value: Date | string): string {
  const p = jstParts(typeof value === 'string' ? new Date(value) : value);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/**
 * 日本時間の今日を求める。ビルド中の判定には SiteData.today を使い、これを呼ばない（03 §6.4）
 * @param now 今の日時（テストで差し替える）
 * @returns 'YYYY-MM-DD'
 */
export function todayJst(now: Date = new Date()): string {
  return jstDate(now);
}

/**
 * 'YYYY-MM-DD' を年月日と曜日に分ける（時刻を持たない日付として扱う）
 * @param ymd 日付
 * @returns 年・月・日・曜日（0 が日曜）
 */
function dateOnlyParts(ymd: string): { year: number; month: number; day: number; weekday: number } {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return { year: y, month: m, day: d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/**
 * 公開日を表示の形にする（例：2026年10月10日）
 * @param ymd 公開日（'YYYY-MM-DD'）
 * @returns 表示の文字
 */
export function formatPublishedOn(ymd: string): string {
  const p = dateOnlyParts(ymd);
  return `${p.year}年${p.month}月${p.day}日`;
}

/**
 * 月日と曜日の表示（例：10月10日（土））
 * @param p 月・日・曜日
 * @returns 表示の文字
 */
function md(p: { month: number; day: number; weekday: number }): string {
  return `${p.month}月${p.day}日（${WEEKDAYS[p.weekday]}）`;
}
/**
 * 時刻の表示（例：18:00）
 * @param p 日本時間の各部分
 * @returns 表示の文字
 */
function hm(p: JstParts): string {
  return `${p.hour}:${pad(p.minute)}`;
}

/** 行事の日時の表示に使う列 */
export interface EventTime {
  event_starts_at: string | null;
  event_ends_at: string | null;
  event_all_day: boolean;
  /** 時間未定（D-68）。表示は終日と同じ日付だけに「時間未定」を付ける */
  event_time_tbd: boolean;
}

/**
 * 行事の日時を表示の形にする（03 §6.4 の表）
 * @param event 行事の開始・終了日時と、終日・時間未定
 * @returns 表示の文字。開始日時が無ければ空文字
 */
export function formatEventDate(event: EventTime): string {
  if (event.event_starts_at === null) return '';
  const start = jstParts(new Date(event.event_starts_at));
  const end = event.event_ends_at === null ? null : jstParts(new Date(event.event_ends_at));
  const head = `${start.year}年${md(start)}`;
  const sameDay =
    end !== null && end.year === start.year && end.month === start.month && end.day === start.day;

  if (event.event_all_day || event.event_time_tbd) {
    const days = end === null || sameDay ? head : `${head}〜${md(end)}`;
    return event.event_time_tbd ? `${days}時間未定` : days;
  }
  if (end === null) return `${head}${hm(start)}〜`;
  if (sameDay) return `${head}${hm(start)}〜${hm(end)}`;
  return `${head}${hm(start)}〜${md(end)}${hm(end)}`;
}

/**
 * 行事の <time datetime> の値を作る
 * @param iso 日時（ISO 8601）
 * @param allDay 終日・時間未定なら true
 * @returns 終日・時間未定は 'YYYY-MM-DD'、時刻ありは 'YYYY-MM-DDTHH:mm:ss+09:00'
 */
export function eventDatetime(iso: string, allDay: boolean): string {
  const p = jstParts(new Date(iso));
  const ymd = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  return allDay ? ymd : `${ymd}T${pad(p.hour)}:${pad(p.minute)}:00+09:00`;
}

/**
 * トップの「次の行事」の日付の箱（月・日・曜日）の文字を作る
 * @param iso 開始日時（ISO 8601）
 * @returns 月（例：10月）・日・曜日
 */
export function eventDateBox(iso: string): { month: string; day: string; weekday: string } {
  const p = jstParts(new Date(iso));
  return { month: `${p.month}月`, day: String(p.day), weekday: WEEKDAYS[p.weekday] ?? '' };
}
