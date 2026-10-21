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

interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
/** 10秒で「時間がかかっています」、70秒で打ち切り（D-34、03 §8.5） */
const SLOW_MS = 10_000;
const TIMEOUT_MS = 70_000;
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

function setup(form: HTMLFormElement) {
  const config = form.dataset;
  const preview = config['preview'] === 'true';
  const joinAgeLabel = config['joinAgeLabel'] ?? '';
  const privacyVersion = config['privacyVersion'] ?? '';

  const $ = <T extends Element>(selector: string) => form.querySelector<T>(selector);
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

  function currentErrors(): Record<string, FieldReason> {
    const result = validate(readValues(), privacyVersion, token);
    return result.ok ? {} : result.fields;
  }

  /** 各項目の下に誤りを出す（03 §13.3）。only を渡したときはその項目だけ更新する */
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
    const recheck = () => {
      if (attempted) showFieldErrors(currentErrors(), name);
    };
    control.addEventListener('blur', recheck);
    control.addEventListener('input', recheck);
    control.addEventListener('change', recheck);
  }

  // ---- フォーム上部のまとめ（03 §13.3、06 §4.1・§4.3） ----
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

  function hideSummary() {
    summary.hidden = true;
  }

  // ---- Turnstile（03 §8.5。プレビューでは読み込まない。§8.6） ----
  const turnstileError = $<HTMLElement>('#f-turnstile-e') as HTMLElement;
  function showTurnstileError(message: string | null) {
    turnstileError.textContent = message ?? '';
    turnstileError.hidden = message === null;
  }

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
  function setSending(on: boolean) {
    sending = on;
    submit.disabled = on || preview;
    submit.textContent = on ? CONTACT_STATE.sending : CONTACT_STATE.submit;
    form.setAttribute('aria-busy', String(on));
    if (on) form.dataset['sending'] = 'true';
    else delete form.dataset['sending'];
    status.textContent = on ? CONTACT_STATE.sendingStatus : '';
  }

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
