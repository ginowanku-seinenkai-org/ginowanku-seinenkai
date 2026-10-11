// 問い合わせフォームの入力の組み立て・検証・応答の判定（03 §8.4・§8.5・§10.2）。画面の操作は src/scripts/contact-form.ts
import { inquirySchema, toFieldReasons, type FieldReason } from './inquiry-schema.ts';
import {
  CONTACT_ERRORS,
  CONTACT_FIELDS,
  CONTACT_MAX_LENGTH,
  type InquiryKind,
  type SubmitFailure,
} from './messages.ts';

export type FieldName =
  | 'organization'
  | 'name'
  | 'age'
  | 'email'
  | 'phone'
  | 'preferred_datetime'
  | 'venue'
  | 'event_summary'
  | 'performance_length'
  | 'message';

/** 種類ごとに表示して送る項目（03 §8.1） */
export const FIELDS_BY_KIND: Record<InquiryKind, readonly FieldName[]> = {
  performance: [
    'organization',
    'name',
    'email',
    'phone',
    'preferred_datetime',
    'venue',
    'event_summary',
    'performance_length',
    'message',
  ],
  join: ['name', 'age', 'email', 'phone', 'message'],
  other: ['organization', 'name', 'email', 'phone', 'message'],
};

/** 種類ごとの必須（ラベルの「必須」「任意」の切り替えに使う。検証はスキーマが行う） */
export const REQUIRED_BY_KIND: Record<InquiryKind, readonly FieldName[]> = {
  performance: ['organization', 'name', 'email', 'preferred_datetime', 'venue', 'event_summary'],
  join: ['name', 'age', 'email'],
  other: ['name', 'email', 'message'],
};

export const isInquiryKind = (value: unknown): value is InquiryKind =>
  value === 'performance' || value === 'join' || value === 'other';

export interface FormValues {
  kind: InquiryKind | null;
  fields: Partial<Record<FieldName, string>>;
  privacyAgreed: boolean;
  /** おとり項目 */
  website: string;
}

/** 画面に項目がない（利用者が直せない）入力 */
const HIDDEN_FIELDS = new Set(['privacy_version', 'turnstile_token', 'website']);

/** 年齢：全角を半角にし、1〜3桁の数字なら数値にする（数値にできなければそのまま渡してエラーにする） */
export function toAgeValue(raw: string): number | string | undefined {
  const s = raw.normalize('NFKC').trim();
  if (s === '') return undefined;
  return /^[0-9]{1,3}$/.test(s) ? Number(s) : s;
}

/** 送る JSON の元。選んだ種類の項目だけを入れ、空の項目は入れない（03 §10.2） */
export function buildInput(
  values: FormValues,
  privacyVersion: string,
  token: string,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  if (values.kind) {
    input['kind'] = values.kind;
    for (const name of FIELDS_BY_KIND[values.kind]) {
      const raw = values.fields[name] ?? '';
      if (name === 'age') {
        const age = toAgeValue(raw);
        if (age !== undefined) input['age'] = age;
      } else if (raw.trim() !== '') {
        input[name] = raw;
      }
    }
  }
  input['privacy_agreed'] = values.privacyAgreed;
  input['privacy_version'] = privacyVersion;
  input['turnstile_token'] = token;
  if (values.website !== '') input['website'] = values.website;
  return input;
}

export type ValidationResult =
  { ok: true; body: Record<string, unknown> } | { ok: false; fields: Record<string, FieldReason> };

/**
 * 共有の入力チェック（inquiry-schema.ts）で確かめる。token がまだ無いときは仮の値で確かめ、
 * 画面にない項目の誤りは返さない（token の有無は呼び出し側が別に確かめる）
 */
export function validate(
  values: FormValues,
  privacyVersion: string,
  token: string | null,
): ValidationResult {
  const parsed = inquirySchema.safeParse(buildInput(values, privacyVersion, token ?? 'pending'));
  if (parsed.success) return { ok: true, body: parsed.data as Record<string, unknown> };
  const fields = Object.fromEntries(
    Object.entries(toFieldReasons(parsed.error.issues)).filter(
      ([name]) => !HIDDEN_FIELDS.has(name),
    ),
  );
  // 画面に出す誤りが無い（おとり項目が長すぎるなど）ときはそのまま送り、サーバーの判断に任せる
  if (Object.keys(fields).length === 0)
    return { ok: true, body: buildInput(values, privacyVersion, token ?? '') };
  return { ok: false, fields };
}

export const isFieldName = (name: string): name is FieldName =>
  name in CONTACT_FIELDS && name !== 'kind';

/** 項目のラベル（種類で変わるものは種類に合わせる。06 §4.1） */
export function labelOf(name: FieldName, kind: InquiryKind | null): string {
  const label = CONTACT_FIELDS[name].label;
  return typeof label === 'string' ? label : label[kind ?? 'other'];
}

/** 文字数（コードポイント数。Postgres の char_length と同じ） */
export const countChars = (s: string) => Array.from(s.trim()).length;

/**
 * 理由コードを 06 §4.1 の文にする（03 §8.4 の対応表。上から順に最初に当てはまった行）。
 * 画面にない項目は null（項目には出さない）
 */
export function fieldMessage(
  name: string,
  reason: FieldReason,
  context: { kind: InquiryKind | null; joinAgeLabel: string; value: string },
): string | null {
  if (HIDDEN_FIELDS.has(name)) return null;
  if (reason === 'too_long' && name in CONTACT_MAX_LENGTH) {
    return CONTACT_ERRORS.tooLong(
      CONTACT_MAX_LENGTH[name as keyof typeof CONTACT_MAX_LENGTH],
      countChars(context.value),
    );
  }
  if (name === 'kind') return CONTACT_ERRORS.kind;
  if (name === 'privacy_agreed') return CONTACT_ERRORS.privacy;
  if (name === 'age') return CONTACT_ERRORS.age(context.joinAgeLabel);
  if (name === 'email' && reason === 'invalid_format') return CONTACT_ERRORS.email;
  if (name === 'phone' && reason === 'invalid_format') return CONTACT_ERRORS.phone;
  if (!isFieldName(name)) return null;
  const label = labelOf(name, context.kind);
  return reason === 'required' ? CONTACT_ERRORS.required(label) : CONTACT_ERRORS.generic(label);
}

/** 15以上18未満のとき、保護者への確認の文を出す（03 §8.2） */
export function isUnder18(raw: string): boolean {
  const age = toAgeValue(raw);
  return typeof age === 'number' && age >= 15 && age < 18;
}

export type SubmitResult =
  { ok: true } | { ok: false; failure: SubmitFailure; fields?: Record<string, FieldReason> };

const REASONS = new Set<string>([
  'required',
  'too_long',
  'out_of_range',
  'invalid_format',
  'invalid',
]);

/** submit-inquiry の応答を 06 §4.3 の場面にする（03 §8.5 の表。読めない応答は「その他」） */
export function classifyResponse(status: number, body: unknown): SubmitResult {
  const data = (typeof body === 'object' && body !== null ? body : {}) as {
    ok?: unknown;
    error?: { code?: unknown; fields?: unknown };
  };
  if (status === 200 && data.ok === true) return { ok: true };
  const code = data.error?.code;
  if (status === 400 && code === 'invalid_input') {
    const raw = data.error?.fields;
    const fields: Record<string, FieldReason> = {};
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      for (const [name, reason] of Object.entries(raw)) {
        // 知らない理由コードは「汎用」の文にする（06 §4.1）
        fields[name] = (
          typeof reason === 'string' && REASONS.has(reason) ? reason : 'invalid'
        ) as FieldReason;
      }
    }
    return { ok: false, failure: 'invalid', fields };
  }
  if (status === 403 && code === 'turnstile_failed') return { ok: false, failure: 'turnstile' };
  if (status === 429 && code === 'rate_limited') return { ok: false, failure: 'rate_limited' };
  if (status === 429 && code === 'busy') return { ok: false, failure: 'busy' };
  return { ok: false, failure: 'server' };
}
