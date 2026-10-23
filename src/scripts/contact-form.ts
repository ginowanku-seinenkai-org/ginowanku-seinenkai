// 問い合わせフォームの動き（03 §8.1〜§8.6、§13.3）。入力の組み立て・検証・応答の判定は src/lib/contact-form.ts
import {
  classifyResponse,
  FIELDS_BY_KIND,
  fieldMessage,
  isInquiryKind,
  isUnder18,
  labelOf,
  REQUIRED_BY_KIND,
  thanksUrl,
  validate,
  type FieldName,
  type FormValues,
  type SubmitResult,
} from '../lib/contact-form.ts';
import type { FieldReason } from '../lib/inquiry-schema.ts';
import {
  CONTACT_ERRORS,
  CONTACT_FIELDS,
  CONTACT_STATE,
  INSTAGRAM_DM,
  JOIN_GUIDE,
  SUBMIT_FAILURES,
  type InquiryKind,
  type SubmitFailure,
} from '../lib/messages.ts';

// 使う Turnstile の関数（window.turnstile）
interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// Turnstile のスクリプト（render を呼ぶまで表示しない）
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
/** 10秒で「時間がかかっています」、70秒で打ち切り（D-34、03 §8.5） */
const SLOW_MS = 10_000;
/** 送信を打ち切るまでの時間 */
const TIMEOUT_MS = 70_000;
// 画面で入力するすべての項目（誤りの表示の順）
const ALL_FIELDS: readonly FieldName[] = [
  'organization',
  'name',
  'age',
  'email',
  'phone',
  'preferred_datetime',
  'venue',
  'event_summary',
  'performance_length',
  'message',
];

const form = document.querySelector<HTMLFormElement>('[data-contact-form]');
if (form) setup(form);

/**
 * 問い合わせフォームに動きを付ける：種類の切り替え、入力の検証と誤りの表示、Turnstile、送信
 * 設定はフォームの data-* 属性（preview・joinAgeLabel・privacyVersion・sitekey・endpoint・instagramUrl）から読む
 * @param form 問い合わせフォーム（[data-contact-form]）
 */
function setup(form: HTMLFormElement) {
  const config = form.dataset;
  const preview = config['preview'] === 'true';
  const joinAgeLabel = config['joinAgeLabel'] ?? '';
  const privacyVersion = config['privacyVersion'] ?? '';

  /**
   * フォームの中の要素を探す
   * @param selector CSS セレクター
   * @returns 見つかった要素。無ければ null
   */
  const $ = <T extends Element>(selector: string) => form.querySelector<T>(selector);
  /**
   * 項目の入力欄（#f-<名前>）を取り出す
   * @param name 項目名
   * @returns 入力欄
   */
  const input = (name: string) =>
    $<HTMLInputElement | HTMLTextAreaElement>(`#f-${name}`) as
      HTMLInputElement | HTMLTextAreaElement;
  const kindRadios = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="kind"]'));
  const privacy = input('privacy_agreed') as HTMLInputElement;
  const submit = $<HTMLButtonElement>('[data-submit]') as HTMLButtonElement;
  const status = $<HTMLElement>('[data-status]') as HTMLElement;
  const summary = $<HTMLElement>('[data-summary]') as HTMLElement;
  const turnstileBox = $<HTMLElement>('[data-turnstile]') as HTMLElement;

  let kind: InquiryKind | null = null;
  let token: string | null = null;
  let widgetId: string | null = null;
  let sending = false;
  /** 最初の送信までは誤りを出さない（03 §8.4） */
  let attempted = false;

  // ---- 種類の切り替え（03 §8.1） ----
  /**
   * 種類を切り替える。種類に合う項目だけを出し、ほかは隠して送らない。必須・任意の印、ラベル、例、案内も種類に合わせる
   * @param next 選んだ種類。未選択なら null（種類の後ろの項目をすべて隠す）
   */
  function setKind(next: InquiryKind | null) {
    kind = next;
    ($<HTMLElement>('[data-after-kind]') as HTMLElement).hidden = next === null;
    for (const el of form.querySelectorAll<HTMLElement>('[data-kind-only]')) {
      const show = next !== null && (el.dataset['kindOnly'] ?? '').split(' ').includes(next);
      el.hidden = !show;
      // 隠した項目は検証・送信の対象にしない
      for (const control of el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        'input, textarea',
      ))
        control.disabled = !show;
    }
    if (next === null) return;
    const required = REQUIRED_BY_KIND[next];
    for (const name of ALL_FIELDS) {
      const badge = $<HTMLElement>(`[data-field="${name}"] [data-badge]`);
      if (!badge) continue;
      const req = required.includes(name);
      badge.className = req ? 'req' : 'opt';
      badge.textContent = req ? '必須' : '任意';
    }
    setText(`[data-field="name"] [data-label]`, labelOf('name', next));
    setText(`[data-field="message"] [data-label]`, labelOf('message', next));
    input('message').placeholder = CONTACT_FIELDS.message.placeholder[next];
    const orgHint = $<HTMLElement>('[data-field="organization"] [data-hint]');
    if (orgHint && next !== 'join') {
      orgHint.textContent = CONTACT_FIELDS.organization.hint[next];
      orgHint.hidden = false;
    }
    if (attempted) showFieldErrors(currentErrors());
  }

  /**
   * 要素の文字を替える（要素が無ければ何もしない）
   * @param selector CSS セレクター
   * @param text 入れる文字
   */
  function setText(selector: string, text: string) {
    const el = $<HTMLElement>(selector);
    if (el) el.textContent = text;
  }

  for (const radio of kindRadios)
    radio.addEventListener('change', () =>
      setKind(isInquiryKind(radio.value) ? radio.value : null),
    );

  // 初期の種類は ?kind=（無い・不正なら未選択）
  const initial = new URLSearchParams(location.search).get('kind');
  if (isInquiryKind(initial)) {
    const radio = kindRadios.find((r) => r.value === initial);
    if (radio) radio.checked = true;
    setKind(initial);
  } else {
    setKind(null);
  }

  // ---- 18歳未満の案内（03 §8.2） ----
  const ageNote = $<HTMLElement>('[data-age-note]') as HTMLElement;
  input('age').addEventListener('input', () => {
    ageNote.textContent = isUnder18(input('age').value) ? JOIN_GUIDE.under18 : '';
  });

  // ---- 入力の読み取りと検証 ----
  /**
   * フォームの今の入力を読む。選んだ種類の項目だけを読む
   * @returns フォームの値
   */
  function readValues(): FormValues {
    const fields: FormValues['fields'] = {};
    if (kind) for (const name of FIELDS_BY_KIND[kind]) fields[name] = input(name).value;
    return {
      kind,
      fields,
      privacyAgreed: privacy.checked,
      website: input('website').value,
    };
  }

  /**
   * 今の入力の誤りを求める
   * @returns 項目ごとの理由コード。誤りが無ければ空
   */
  function currentErrors(): Record<string, FieldReason> {
    const result = validate(readValues(), privacyVersion, token);
    return result.ok ? {} : result.fields;
  }

  /**
   * 各項目の下に誤りを出す（03 §13.3）。誤りのある入力欄には aria-invalid を付ける
   * @param fields 項目ごとの理由コード（無い項目は誤りを消す）
   * @param only 渡したときはその項目だけ更新する
   */
  function showFieldErrors(fields: Record<string, FieldReason>, only?: string) {
    const names = only ? [only] : ['kind', 'privacy_agreed', ...ALL_FIELDS];
    for (const name of names) {
      const error = $<HTMLElement>(`#f-${name}-e`);
      if (!error) continue;
      const reason = fields[name];
      const message =
        reason === undefined
          ? null
          : fieldMessage(name, reason, {
              kind,
              joinAgeLabel,
              value: name === 'kind' || name === 'privacy_agreed' ? '' : input(name).value,
            });
      error.textContent = message ?? '';
      error.hidden = message === null;
      const control = name === 'kind' ? null : $<HTMLElement>(`#f-${name}`);
      if (control) {
        if (message) control.setAttribute('aria-invalid', 'true');
        else control.removeAttribute('aria-invalid');
      }
    }
  }

  // 最初の送信のあとは、項目ごとに blur と input で検証し直す
  for (const name of [...ALL_FIELDS, 'privacy_agreed']) {
    const control = input(name);
    /** 最初の送信のあとだけ、この項目の誤りを出し直す */
    const recheck = () => {
      if (attempted) showFieldErrors(currentErrors(), name);
    };
    control.addEventListener('blur', recheck);
    control.addEventListener('input', recheck);
    control.addEventListener('change', recheck);
  }

  // ---- フォーム上部のまとめ（03 §13.3、06 §4.1・§4.3） ----
  /**
   * 要素に文を入れる。文の中の「InstagramのDM」は Instagram へのリンクにする（URL が無ければ文字のまま）
   * @param el 文を入れる要素
   * @param text 入れる文
   */
  function fillWithInstagramLink(el: HTMLElement, text: string) {
    el.replaceChildren();
    const at = text.indexOf(INSTAGRAM_DM);
    if (at < 0) {
      el.textContent = text;
      return;
    }
    el.append(text.slice(0, at));
    const instagramUrl = config['instagramUrl'] ?? '';
    if (instagramUrl) {
      const link = document.createElement('a');
      link.href = instagramUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = INSTAGRAM_DM;
      el.append(link);
    } else {
      el.append(INSTAGRAM_DM);
    }
    el.append(text.slice(at + INSTAGRAM_DM.length));
  }

  /**
   * フォーム上部のまとめを出し、そこへフォーカスを移す。誤りのある項目へのリンクを並べる
   * @param heading 見出し
   * @param body 本文。無ければ null
   * @param fields 項目ごとの理由コード（リンクを並べる項目）
   */
  function showSummary(heading: string, body: string | null, fields: Record<string, FieldReason>) {
    ($<HTMLElement>('[data-summary-heading]') as HTMLElement).textContent = heading;
    const bodyEl = $<HTMLElement>('[data-summary-body]') as HTMLElement;
    bodyEl.hidden = body === null;
    if (body !== null) fillWithInstagramLink(bodyEl, body);
    const list = $<HTMLElement>('[data-summary-list]') as HTMLElement;
    list.replaceChildren();
    for (const name of ['kind', ...ALL_FIELDS, 'privacy_agreed']) {
      const message = $<HTMLElement>(`#f-${name}-e`);
      if (!message || message.hidden || fields[name] === undefined) continue;
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href =
        name === 'kind' ? `#f-kind-${kindRadios[0]?.value ?? 'performance'}` : `#f-${name}`;
      link.textContent = message.textContent ?? '';
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const target = name === 'kind' ? kindRadios[0] : input(name);
        target?.focus();
      });
      item.append(link);
      list.append(item);
    }
    list.hidden = list.childElementCount === 0;
    summary.hidden = false;
    summary.focus();
  }

  /** フォーム上部のまとめを隠す */
  function hideSummary() {
    summary.hidden = true;
  }

  // ---- Turnstile（03 §8.5。プレビューでは読み込まない。§8.6） ----
  const turnstileError = $<HTMLElement>('#f-turnstile-e') as HTMLElement;
  /**
   * Turnstile の下に案内を出す
   * @param message 出す文。null なら消す
   */
  function showTurnstileError(message: string | null) {
    turnstileError.textContent = message ?? '';
    turnstileError.hidden = message === null;
  }

  /** Turnstile を表示する（読み込み前・表示済みなら何もしない）。取れたトークンを token に入れる */
  function renderTurnstile() {
    if (!window.turnstile || widgetId !== null) return;
    widgetId = window.turnstile.render(turnstileBox, {
      sitekey: config['sitekey'],
      action: 'inquiry',
      language: 'ja',
      theme: 'light',
      size: 'flexible',
      appearance: 'always',
      'refresh-expired': 'auto',
      callback: (value: string) => {
        token = value;
        showTurnstileError(null);
      },
      'expired-callback': () => {
        token = null;
      },
      'error-callback': () => {
        token = null;
        showTurnstileError(CONTACT_STATE.turnstileLoadFailed);
      },
    });
  }

  /** トークンを捨て、Turnstile をやり直す（トークンは1回しか使えないため） */
  function resetTurnstile() {
    token = null;
    if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
  }

  if (!preview) {
    const script = document.createElement('script');
    script.src = TURNSTILE_SRC;
    script.async = true;
    script.addEventListener('load', renderTurnstile);
    script.addEventListener('error', () => showTurnstileError(CONTACT_STATE.turnstileLoadFailed));
    document.head.append(script);
  }

  // ---- 送信（03 §8.5） ----
  /**
   * 送信中の表示に切り替える（ボタンを押せなくし、送信中の案内を出す）
   * @param on 送信中なら true
   */
  function setSending(on: boolean) {
    sending = on;
    submit.disabled = on || preview;
    submit.textContent = on ? CONTACT_STATE.sending : CONTACT_STATE.submit;
    form.setAttribute('aria-busy', String(on));
    if (on) form.dataset['sending'] = 'true';
    else delete form.dataset['sending'];
    status.textContent = on ? CONTACT_STATE.sendingStatus : '';
  }

  /**
   * submit-inquiry に送る。10秒で「時間がかかっています」を出し、70秒で打ち切る（03 §8.5）
   * @param body 入力チェックを通った送る値
   * @returns 送信の結果。通信できなければ network、打ち切ったら timeout
   */
  async function post(body: Record<string, unknown>): Promise<SubmitResult> {
    const controller = new AbortController();
    const slow = window.setTimeout(() => {
      status.textContent = CONTACT_STATE.slow;
    }, SLOW_MS);
    const abort = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      // apikey・Authorization は送らない（D-34）
      const response = await fetch(config['endpoint'] ?? '', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data: unknown = await response.json().catch(() => null);
      return classifyResponse(response.status, data);
    } catch {
      return { ok: false, failure: controller.signal.aborted ? 'timeout' : 'network' };
    } finally {
      window.clearTimeout(slow);
      window.clearTimeout(abort);
    }
  }

  /**
   * 送信の失敗を出す（06 §4.3）。入力の誤りなら各項目の誤りも出す
   * @param failure 失敗の場面
   * @param fields 入力の誤りのときの、項目ごとの理由コード
   */
  function showFailure(failure: SubmitFailure, fields: Record<string, FieldReason> = {}) {
    const { heading, body } = SUBMIT_FAILURES[failure];
    if (failure === 'invalid') showFieldErrors(fields);
    showSummary(heading, body, fields);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending || preview) return;
    attempted = true;
    const values = readValues();
    const result = validate(values, privacyVersion, token);
    if (!result.ok) {
      showFieldErrors(result.fields);
      showSummary(CONTACT_ERRORS.summary, null, result.fields);
      return;
    }
    showFieldErrors({});
    if (token === null) {
      hideSummary();
      showTurnstileError(CONTACT_ERRORS.turnstilePending);
      turnstileBox.scrollIntoView({ block: 'center' });
      return;
    }
    hideSummary();
    setSending(true);
    const outcome = await post(result.body);
    if (outcome.ok) {
      // 送信内容は次のページに渡さない。受付番号だけを渡す（D-93）
      location.assign(thanksUrl(outcome.refCode));
      return;
    }
    setSending(false);
    // token は1回しか使えないので、どの失敗でも取り直す
    resetTurnstile();
    showFailure(outcome.failure, outcome.fields);
  });

  // 送ったあと「戻る」でこのページがそのまま戻ってきたとき、送信中のまま押せなくならないようにする
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    setSending(false);
    resetTurnstile();
  });
}
