// 送信完了（S09）：URL の ?ref= の受付番号を出す（D-93、06 §4.2）。形が違えば出さない
import { refCodeFromSearch } from '../lib/contact-form.ts';

const box = document.querySelector<HTMLElement>('[data-ref-box]');
const value = document.querySelector<HTMLElement>('[data-ref-value]');
const code = refCodeFromSearch(location.search);
if (box && value && code) {
  value.textContent = code;
  box.hidden = false;
}
