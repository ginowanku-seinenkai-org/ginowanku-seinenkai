// トップの「演舞のカレンダー」をブラウザで動かす（03 §6.5、D-128）。月の切り替えと日付の選択、その日の演舞の一覧
import {
  MAX_DOTS,
  byDay,
  dayLabel,
  defaultDay,
  inMonthRange,
  monthLabel,
  monthWeeks,
  parseCalendarEvents,
  shiftMonth,
  timeLabel,
  type CalendarEvent,
} from '../lib/calendar.ts';
import { formatDateWithWeekday, todayJst } from '../lib/date.ts';
import { CALENDAR, PLACE_PIN } from '../lib/messages.ts';

/**
 * 要素を作り、class と文字を付ける
 * @param tag 要素の名前
 * @param className class（空なら付けない）
 * @param text 中の文字（省略すると空）
 * @returns 作った要素
 */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * カレンダー1つを動かす
 * @param root data-calendar の要素
 */
function setup(root: HTMLElement) {
  const prev = root.querySelector<HTMLButtonElement>('[data-cal-prev]');
  const next = root.querySelector<HTMLButtonElement>('[data-cal-next]');
  const monthText = root.querySelector<HTMLElement>('[data-cal-month]');
  const body = root.querySelector<HTMLElement>('[data-cal-body]');
  const panel = root.querySelector<HTMLElement>('[data-cal-day]');
  const dateText = root.querySelector<HTMLElement>('[data-cal-date]');
  const empty = root.querySelector<HTMLElement>('[data-cal-empty]');
  const list = root.querySelector<HTMLElement>('[data-cal-list]');
  if (!prev || !next || !monthText || !body || !panel || !dateText || !empty || !list) return;

  const days = byDay(parseCalendarEvents(root.dataset['events']));
  const today = todayJst();
  let month = today.slice(0, 7);
  let selected = today;

  /**
   * 前後の月のボタンを、範囲の端では押せない状態にする（焦点が外れないよう aria-disabled にする）
   */
  const updateNav = () => {
    for (const [button, diff] of [
      [prev, -1],
      [next, 1],
    ] as const) {
      const ok = inMonthRange(shiftMonth(month, diff), today);
      if (ok) button.removeAttribute('aria-disabled');
      else button.setAttribute('aria-disabled', 'true');
    }
  };

  /**
   * その日の演舞の1行（記事へのリンク。時刻・中止の印・タイトル・場所）
   * @param event 演舞
   * @returns 一覧の項目
   */
  const row = (event: CalendarEvent) => {
    const li = el('li');
    const link = el('a', 'cal-item');
    link.href = event.url;
    link.append(el('span', 'cal-time', timeLabel(event)));
    const main = el('span', 'cal-item-body');
    if (event.cancelled) main.append(el('span', 'badge-cancelled', CALENDAR.cancelled));
    main.append(el('span', 'cal-title', event.title));
    if (event.place) {
      // 場所の前に 📍（読み上げない。D-129）
      const place = el('span', 'cal-place');
      const pin = el('span', 'pin', PLACE_PIN);
      pin.setAttribute('aria-hidden', 'true');
      place.append(pin, event.place);
      main.append(place);
    }
    link.append(main);
    li.append(link);
    return li;
  };

  /**
   * 選んだ日の印（aria-pressed）と、その日の演舞の一覧を描き直す
   */
  const renderDay = () => {
    for (const button of body.querySelectorAll<HTMLButtonElement>('button[data-date]'))
      button.setAttribute('aria-pressed', String(button.dataset['date'] === selected));
    const items = days.get(selected) ?? [];
    dateText.textContent = formatDateWithWeekday(selected);
    empty.hidden = items.length > 0;
    list.replaceChildren(...items.map(row));
    list.hidden = items.length === 0;
  };

  /**
   * 日付のボタン（読み上げは「m月d日（曜）、演舞n件」）
   * @param date 日付（'YYYY-MM-DD'）
   * @param weekday 曜日の番号（0 が日曜）
   * @returns ボタン
   */
  const dayButton = (date: string, weekday: number) => {
    const count = days.get(date)?.length ?? 0;
    const button = el(
      'button',
      [weekday === 0 ? 'sun' : weekday === 6 ? 'sat' : '', date === today ? 'today' : '']
        .filter(Boolean)
        .join(' '),
    );
    button.type = 'button';
    button.dataset['date'] = date;
    button.setAttribute('aria-label', dayLabel(date, count));
    button.setAttribute('aria-pressed', 'false');
    const num = el('span', 'cal-num', String(Number(date.slice(8))));
    num.setAttribute('aria-hidden', 'true');
    const dots = el('span', 'cal-dots');
    dots.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < Math.min(count, MAX_DOTS); i++) dots.append(el('i', 'cal-dot'));
    button.append(num, dots);
    button.addEventListener('click', () => {
      selected = date;
      renderDay();
    });
    return button;
  };

  /**
   * 表示している月の表を描き直す
   */
  const renderMonth = () => {
    monthText.textContent = monthLabel(month);
    body.replaceChildren(
      ...monthWeeks(month).map((week) => {
        const tr = el('tr');
        week.forEach((date, wi) => {
          const td = el('td');
          if (date !== null) td.append(dayButton(date, wi));
          tr.append(td);
        });
        return tr;
      }),
    );
    updateNav();
    renderDay();
  };

  /**
   * 前後の月へ移る。今月なら今日を、それ以外は1日を選ぶ
   * @param diff 動かす月の数（前は -1、次は 1）
   */
  const move = (diff: number) => {
    const to = shiftMonth(month, diff);
    if (!inMonthRange(to, today)) return;
    month = to;
    selected = defaultDay(to, today);
    renderMonth();
  };

  prev.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  prev.hidden = false;
  next.hidden = false;
  panel.hidden = false;
  renderMonth();
}

for (const root of document.querySelectorAll<HTMLElement>('[data-calendar]')) setup(root);
