// 演舞の「終了」をブラウザで再判定する（03 §7）。並び順は変えない。中止の演舞は data-event-end を持たないので対象外（13 §6.2）
import { todayJst } from '../lib/date.ts';

const today = todayJst();

for (const el of document.querySelectorAll<HTMLElement>('[data-event-end]')) {
  const end = el.dataset['eventEnd'];
  if (end === undefined || end >= today) continue;
  if (el.dataset['endedBehavior'] === 'hide') {
    el.hidden = true;
  } else {
    for (const badge of el.querySelectorAll<HTMLElement>('.badge-ended, [data-ended-note]'))
      badge.hidden = false;
    el.classList.add('is-ended');
  }
}

// トップの「次回演舞」：すべて隠れたら空の文言を出す
for (const list of document.querySelectorAll<HTMLElement>('[data-upcoming-list]')) {
  const items = list.querySelectorAll<HTMLElement>('[data-event-end]');
  if (items.length > 0 && Array.from(items).every((item) => item.hidden)) {
    list.hidden = true;
    const empty = document.querySelector<HTMLElement>('[data-upcoming-empty]');
    if (empty) empty.hidden = false;
  }
}
