// 問い合わせフォームの入力の組み立て・検証・応答の判定（03 §8.4・§8.5・§10.2、06 §4.1・§4.3）
import { describe, expect, it } from 'vitest';
import {
  buildInput,
  classifyResponse,
  refCodeFromSearch,
  thanksUrl,
  fieldMessage,
  isUnder18,
  toAgeValue,
  validate,
  type FormValues,
} from '../../src/lib/contact-form.ts';

const VERSION = '2026-11-01';
const performance: FormValues = {
  kind: 'performance',
  fields: {
    organization: ' 〇〇自治会 ',
    name: '宜野湾 太郎',
    email: 'taro@example.com',
    phone: '',
    preferred_datetime: '11月23日の夕方',
    venue: '〇〇公園',
    event_summary: '地域の秋祭り',
    performance_length: '',
    message: '',
  },
  privacyAgreed: true,
  website: '',
};
const ctx = { kind: 'performance' as const, joinAgeLabel: '高校生以上', value: '' };

describe('toAgeValue・isUnder18（03 §8.2・§8.4）', () => {
  it('全角を半角にして数値にする', () => expect(toAgeValue('１９')).toBe(19));
  it('空は送らない', () => expect(toAgeValue('  ')).toBeUndefined());
  it('数字でなければそのまま（スキーマで誤りにする）', () =>
    expect(toAgeValue('19歳')).toBe('19歳'));
  it('15以上18未満だけ保護者の案内を出す', () => {
    expect([14, 15, 17, 18].map((n) => isUnder18(String(n)))).toEqual([false, true, true, false]);
    expect(isUnder18('abc')).toBe(false);
  });
});

describe('buildInput（03 §10.2）', () => {
  it('選んだ種類の項目だけを入れ、空の項目は入れない', () => {
    const input = buildInput(
      { ...performance, fields: { ...performance.fields, age: '20' } },
      VERSION,
      'tok',
    );
    expect(input).toEqual({
      kind: 'performance',
      organization: ' 〇〇自治会 ',
      name: '宜野湾 太郎',
      email: 'taro@example.com',
      preferred_datetime: '11月23日の夕方',
      venue: '〇〇公園',
      event_summary: '地域の秋祭り',
      privacy_agreed: true,
      privacy_version: VERSION,
      turnstile_token: 'tok',
    });
  });
  it('入会希望では年齢を数値で送り、団体名は送らない', () => {
    const input = buildInput(
      {
        ...performance,
        kind: 'join',
        fields: { ...performance.fields, age: '１８' },
      },
      VERSION,
      'tok',
    );
    expect(input['age']).toBe(18);
    expect(input).not.toHaveProperty('organization');
  });
  it('入会希望では選んだ性別を送り、ほかの種類では送らない（D-118）', () => {
    const join: FormValues = {
      ...performance,
      kind: 'join',
      fields: { ...performance.fields, age: '20', gender: 'female' },
    };
    expect(buildInput(join, VERSION, 'tok')['gender']).toBe('female');
    expect(
      buildInput({ ...join, fields: { ...join.fields, gender: '' } }, VERSION, 'tok'),
    ).not.toHaveProperty('gender');
    for (const kind of ['performance', 'other'] as const)
      expect(buildInput({ ...join, kind }, VERSION, 'tok')).not.toHaveProperty('gender');
  });
  it('おとり項目は入力があるときだけ送る', () => {
    expect(buildInput(performance, VERSION, 'tok')).not.toHaveProperty('website');
    expect(buildInput({ ...performance, website: 'x' }, VERSION, 'tok')['website']).toBe('x');
  });
});

describe('validate（共有の入力チェック。03 §8.4）', () => {
  it('正しい入力は整えた本文を返す（前後の空白を除く）', () => {
    const result = validate(performance, VERSION, 'tok');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body['organization']).toBe('〇〇自治会');
      expect(result.body['turnstile_token']).toBe('tok');
    }
  });
  it('token がまだ無くても入力の誤りだけを見る', () => {
    expect(validate(performance, VERSION, null).ok).toBe(true);
  });
  it('種類が未選択', () => {
    expect(validate({ ...performance, kind: null }, VERSION, 'tok')).toEqual({
      ok: false,
      fields: { kind: 'required' },
    });
  });
  it('項目ごとの理由コード', () => {
    const result = validate(
      {
        ...performance,
        fields: { ...performance.fields, name: '', email: 'taro@', venue: 'あ'.repeat(201) },
        privacyAgreed: false,
      },
      VERSION,
      'tok',
    );
    expect(result).toEqual({
      ok: false,
      fields: {
        name: 'required',
        email: 'invalid_format',
        venue: 'too_long',
        privacy_agreed: 'required',
      },
    });
  });
  it('入会希望の性別は任意（選ばなければ null、決まった値でなければ invalid。D-118）', () => {
    const join: FormValues = {
      ...performance,
      kind: 'join',
      fields: { name: '宜野湾 次郎', age: '17', email: 'jiro@example.com', gender: '' },
    };
    const none = validate(join, VERSION, 'tok');
    expect(none.ok && none.body['gender']).toBeNull();
    const chosen = validate(
      { ...join, fields: { ...join.fields, gender: 'no_answer' } },
      VERSION,
      'tok',
    );
    expect(chosen.ok && chosen.body['gender']).toBe('no_answer');
    expect(validate({ ...join, fields: { ...join.fields, gender: 'x' } }, VERSION, 'tok')).toEqual({
      ok: false,
      fields: { gender: 'invalid' },
    });
  });
  it('画面にない項目（おとり項目）の誤りは出さずに送る', () => {
    const result = validate({ ...performance, website: 'x'.repeat(201) }, VERSION, 'tok');
    expect(result.ok).toBe(true);
  });
});

describe('fieldMessage（03 §8.4 の対応表、06 §4.1）', () => {
  it('文字数超過は上限といまの文字数', () =>
    expect(fieldMessage('venue', 'too_long', { ...ctx, value: '😀'.repeat(201) })).toBe(
      '200文字以内で入力してください（いま201文字です）。',
    ));
  it('種類・同意・年齢', () => {
    expect(fieldMessage('kind', 'required', ctx)).toBe('お問い合わせの種類を選んでください。');
    expect(fieldMessage('privacy_agreed', 'required', ctx)).toBe(
      '送信するには、プライバシーポリシーへの同意が必要です。',
    );
    for (const reason of ['required', 'out_of_range', 'invalid'] as const)
      expect(fieldMessage('age', reason, ctx)).toBe(
        '年齢は15から99までの数字で入力してください。入会の対象は高校生以上です。',
      );
  });
  it('メール・電話の形式', () => {
    expect(fieldMessage('email', 'invalid_format', ctx)).toBe(
      'メールアドレスの形式が正しくありません。例：example@example.com',
    );
    expect(fieldMessage('phone', 'invalid_format', ctx)).toBe(
      '電話番号は数字とハイフン（-）で入力してください。',
    );
  });
  it('必須はラベルを種類に合わせる', () => {
    expect(fieldMessage('name', 'required', ctx)).toBe('担当者名を入力してください。');
    expect(fieldMessage('name', 'required', { ...ctx, kind: 'join' })).toBe(
      'お名前を入力してください。',
    );
    expect(fieldMessage('message', 'required', { ...ctx, kind: 'other' })).toBe(
      'お問い合わせ内容を入力してください。',
    );
  });
  it('それ以外は汎用の文', () =>
    expect(fieldMessage('name', 'invalid_format', ctx)).toBe('担当者名の内容を確認してください。'));
  it('性別の誤りは汎用の文（D-118）', () =>
    expect(fieldMessage('gender', 'invalid', { ...ctx, kind: 'join' })).toBe(
      '性別の内容を確認してください。',
    ));
  it('画面にない項目は項目に出さない', () => {
    for (const name of ['turnstile_token', 'privacy_version', 'website'])
      expect(fieldMessage(name, 'required', ctx)).toBeNull();
  });
});

describe('classifyResponse（03 §8.5 の表）', () => {
  const fail = (code: string, extra: Record<string, unknown> = {}) => ({
    ok: false,
    error: { code, message: code, ...extra },
    request_id: 'r',
  });
  it('200 ok は成功。受付番号は形が合うときだけ受け取る（D-93）', () => {
    expect(classifyResponse(200, { ok: true })).toEqual({ ok: true, refCode: null });
    expect(classifyResponse(200, { ok: true, ref_code: 'K7Q-3M9' })).toEqual({
      ok: true,
      refCode: 'K7Q-3M9',
    });
    expect(classifyResponse(200, { ok: true, ref_code: '<b>x</b>' })).toEqual({
      ok: true,
      refCode: null,
    });
  });
  it('完了画面の URL と受付番号の読み取り（D-93）', () => {
    expect(thanksUrl('K7Q-3M9')).toBe('/contact/thanks?ref=K7Q-3M9');
    expect(thanksUrl(null)).toBe('/contact/thanks');
    expect(refCodeFromSearch('?ref=K7Q-3M9')).toBe('K7Q-3M9');
    expect(refCodeFromSearch('?ref=%3Cscript%3E')).toBeNull();
    expect(refCodeFromSearch('')).toBeNull();
  });
  it('400 invalid_input は項目ごとの理由を返す。知らない理由は invalid', () =>
    expect(
      classifyResponse(
        400,
        fail('invalid_input', { fields: { email: 'invalid_format', x: 'new' } }),
      ),
    ).toEqual({
      ok: false,
      failure: 'invalid',
      fields: { email: 'invalid_format', x: 'invalid' },
    }));
  it('fields が配列などでも落ちない', () =>
    expect(classifyResponse(400, fail('invalid_input', { fields: ['email'] }))).toEqual({
      ok: false,
      failure: 'invalid',
      fields: {},
    }));
  it('Turnstile・回数制限・混雑', () => {
    expect(classifyResponse(403, fail('turnstile_failed'))).toMatchObject({ failure: 'turnstile' });
    expect(classifyResponse(429, fail('rate_limited'))).toMatchObject({ failure: 'rate_limited' });
    expect(classifyResponse(429, fail('busy'))).toMatchObject({ failure: 'busy' });
  });
  it('それ以外のコード・読めない応答は「保存の失敗・サーバーの不具合」', () => {
    for (const [status, code] of [
      [500, 'save_failed'],
      [500, 'internal'],
      [503, 'upstream_unavailable'],
      [400, 'invalid_json'],
      [403, 'origin_not_allowed'],
      [413, 'payload_too_large'],
      [415, 'unsupported_media_type'],
      [418, 'unknown'],
    ] as const)
      expect(classifyResponse(status, fail(code))).toEqual({ ok: false, failure: 'server' });
    expect(classifyResponse(502, null)).toEqual({ ok: false, failure: 'server' });
    expect(classifyResponse(200, { ok: false })).toEqual({ ok: false, failure: 'server' });
  });
});
