// 問い合わせの入力チェック（02 §4.2、D-34）。公開サイトの src/lib/inquiry-schema.ts と同じ内容にする
// 正はこのファイル（00 §2.2）。管理画面の ci.yml の content-sync が一致を確かめる
// Deno（Edge Functions）と Node（公開サイト）の両方で、同じ版の Zod で動く書き方にする（08 V-35）
import { z } from "zod";

/** 入力エラーの理由（02 §2.4。入力値そのものは返さない） */
export const FIELD_REASONS = [
  "required",
  "too_long",
  "out_of_range",
  "invalid_format",
  "invalid",
] as const;
/** 入力エラーの理由コード */
export type FieldReason = (typeof FIELD_REASONS)[number];

/**
 * 改行・タブ以外の制御文字を含むか（U+0000〜U+001F と U+007F）
 * @param s 調べる文字列
 * @returns 含めば true
 */
const hasControlChars = (s: string) =>
  Array.from(s).some((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return (code < 0x20 && code !== 0x0a && code !== 0x09) || code === 0x7f;
  });

// 01 の inquiries.email の check と同じ形
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * 文字数（コードポイント数。Postgres の char_length と一致）
 * @param s 数える文字列
 * @returns 文字数
 */
const length = (s: string) => Array.from(s).length;

/**
 * 項目が送られていないか（undefined か null）
 * @param input 項目の値
 * @returns 送られていなければ true
 */
const missing = (input: unknown) => input === undefined || input === null;

/**
 * 文字列の項目の土台。無ければ required、文字列でなければ invalid にする
 * @returns 文字列の Zod スキーマ
 */
const str = () =>
  z.string({
    error: (issue) => (missing(issue.input) ? "required" : "invalid"),
  });

/**
 * 前後の空白を除き、改行を \n にそろえる。制御文字を含むか、1行の項目に改行があれば invalid_format
 * @param multiline 改行を許す項目なら true
 * @returns 整えた文字列を返す Zod スキーマ
 */
const cleaned = (multiline: boolean) =>
  str()
    .transform((s) => s.replace(/\r\n?/g, "\n").trim())
    .superRefine((s, ctx) => {
      if (hasControlChars(s) || (!multiline && s.includes("\n"))) {
        ctx.addIssue({ code: "custom", message: "invalid_format" });
      }
    });

/**
 * 文字数の範囲を確かめる superRefine の関数を作る。短ければ required、長ければ too_long
 * @param min 最小の文字数
 * @param max 最大の文字数
 * @returns superRefine に渡す関数
 */
const withLength =
  (min: number, max: number) => (s: string, ctx: z.RefinementCtx) => {
    const n = length(s);
    if (n < min) ctx.addIssue({ code: "custom", message: "required" });
    else if (n > max) ctx.addIssue({ code: "custom", message: "too_long" });
  };

/**
 * 必須の文字列
 * @param min 最小の文字数（1 なら空を required にする）
 * @param max 最大の文字数
 * @param multiline 改行を許す項目なら true
 * @returns 整えた文字列を返す Zod スキーマ
 */
const text = (min: number, max: number, multiline = false) =>
  cleaned(multiline).superRefine(withLength(min, max));

/**
 * 任意の文字列。空文字は undefined（保存は null。02 §4.2）
 * @param max 最大の文字数
 * @param multiline 改行を許す項目なら true
 * @returns 整えた文字列か undefined を返す Zod スキーマ
 */
const optionalText = (max: number, multiline = false) =>
  cleaned(multiline)
    .superRefine(withLength(0, max))
    .transform((s) => (s === "" ? undefined : s))
    .optional();

/** メールアドレス：必須、254文字まで、EMAIL_PATTERN の形 */
const email = text(1, 254).superRefine((s, ctx) => {
  if (s !== "" && length(s) <= 254 && !EMAIL_PATTERN.test(s)) {
    ctx.addIssue({ code: "custom", message: "invalid_format" });
  }
});

/** 電話番号：全角を半角にしてから数字・+・- だけ（02 §4.2） */
const phone = cleaned(false)
  .transform((s) => s.normalize("NFKC"))
  .superRefine((s, ctx) => {
    if (length(s) > 20) ctx.addIssue({ code: "custom", message: "too_long" });
    else if (!/^[0-9+-]*$/.test(s)) {
      ctx.addIssue({ code: "custom", message: "invalid_format" });
    }
  })
  .transform((s) => (s === "" ? undefined : s))
  .optional();

// 3つの種類に共通の項目
const common = {
  name: text(1, 50),
  email,
  phone,
  privacy_agreed: z.literal(true, { error: "required" }),
  privacy_version: str().regex(/^\d{4}-\d{2}-\d{2}$/, {
    error: "invalid_format",
  }),
  turnstile_token: str().min(1, { error: "required" }).max(2048, {
    error: "too_long",
  }),
  // おとり項目（画面には出さない）。空でなければ関数が何も保存せずに 200 を返す
  website: z.string({ error: "invalid" }).max(200, { error: "too_long" })
    .optional(),
};

/**
 * 問い合わせの入力のスキーマ。kind（performance・join・other）で項目が変わる
 * z.object は既定で知らない項目を捨てる（種類に合わない項目も捨てる。02 §4.2）
 */
export const inquirySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("performance"),
    ...common,
    organization: text(1, 100),
    preferred_datetime: text(1, 200, true),
    venue: text(1, 200, true),
    event_summary: text(1, 1000, true),
    performance_length: optionalText(50),
    message: optionalText(2000, true),
  }),
  z.object({
    kind: z.literal("join"),
    ...common,
    age: z
      .number({
        error: (issue) => (missing(issue.input) ? "required" : "invalid"),
      })
      .int({ error: "invalid" })
      .min(15, { error: "out_of_range" })
      .max(99, { error: "out_of_range" }),
    message: optionalText(2000, true),
  }),
  z.object({
    kind: z.literal("other"),
    ...common,
    organization: optionalText(100),
    message: text(1, 2000, true),
  }),
], {
  error: (
    issue,
  ) => (missing((issue.input as Record<string, unknown> | undefined)?.kind)
    ? "required"
    : "invalid"),
});

/** 入力チェックを通ったあとの問い合わせの値 */
export type InquiryInput = z.infer<typeof inquirySchema>;

/**
 * Zod の問題を `{ 項目名: 理由コード }` にする（02 §2.4、D-34）。項目ごとに最初の理由だけ
 * @param issues Zod の safeParse が返した問題の一覧
 * @returns 項目名ごとの理由コード。項目名が無い問題は kind にまとめる
 */
export function toFieldReasons(
  issues: readonly z.core.$ZodIssue[],
): Record<string, FieldReason> {
  const fields: Record<string, FieldReason> = {};
  for (const issue of issues) {
    const name = issue.path.length ? String(issue.path[0]) : "kind";
    if (fields[name]) continue;
    const known = (FIELD_REASONS as readonly string[]).includes(issue.message);
    fields[name] = known
      ? (issue.message as FieldReason)
      : issue.code === "too_big"
      ? "too_long"
      : "invalid";
  }
  return fields;
}

/** 公開サイトのフォームと submit-inquiry の両方のテストで使う共通のケース表（07 UT-04） */
export interface InquirySchemaCase {
  name: string;
  input: Record<string, unknown>;
  fields?: Record<string, FieldReason>;
  expect?: Record<string, unknown>;
}

/** 共通のケース表の中身（07 UT-04）。fields は期待する理由コード、expect は通ったときに期待する値 */
export const INQUIRY_SCHEMA_CASES: InquirySchemaCase[] =
  ((): InquirySchemaCase[] => {
    const base = {
      name: "宜野湾 太郎",
      email: "taro@example.com",
      privacy_agreed: true,
      privacy_version: "2026-11-01",
      turnstile_token: "token",
    };
    const performance = {
      ...base,
      kind: "performance",
      organization: "〇〇自治会",
      preferred_datetime: "11月23日の夕方",
      venue: "〇〇公園",
      event_summary: "地域の秋祭り",
    };
    const join = { ...base, kind: "join", age: 19 };
    const other = {
      ...base,
      kind: "other",
      message: "衣装について教えてください",
    };
    return [
      {
        name: "演舞依頼：最小の入力",
        input: performance,
        expect: { kind: "performance", phone: undefined },
      },
      {
        name: "入会希望：最小の入力",
        input: join,
        expect: { kind: "join", age: 19 },
      },
      {
        name: "その他：団体名なし",
        input: other,
        expect: { organization: undefined },
      },
      {
        name: "その他：団体名あり",
        input: { ...other, organization: " 〇〇会 " },
        expect: { organization: "〇〇会" },
      },
      {
        name: "その他：団体名101文字",
        input: { ...other, organization: "あ".repeat(101) },
        fields: { organization: "too_long" },
      },
      { name: "種類なし", input: { ...base }, fields: { kind: "required" } },
      {
        name: "知らない種類",
        input: { ...base, kind: "x" },
        fields: { kind: "invalid" },
      },
      {
        name: "氏名なし",
        input: { ...join, name: undefined },
        fields: { name: "required" },
      },
      {
        name: "氏名が空白だけ",
        input: { ...join, name: "   " },
        fields: { name: "required" },
      },
      {
        name: "氏名51文字",
        input: { ...join, name: "あ".repeat(51) },
        fields: { name: "too_long" },
      },
      {
        name: "氏名50文字（絵文字はコードポイントで数える）",
        input: { ...join, name: "😀".repeat(50) },
        expect: { name: "😀".repeat(50) },
      },
      {
        name: "氏名に改行",
        input: { ...join, name: "宜野湾\n太郎" },
        fields: { name: "invalid_format" },
      },
      {
        name: "メールの形が違う",
        input: { ...join, email: "taro@" },
        fields: { email: "invalid_format" },
      },
      {
        name: "電話番号は全角を半角に",
        input: { ...join, phone: "０９０－１２３４－５６７８" },
        expect: { phone: "090-1234-5678" },
      },
      {
        name: "電話番号に文字",
        input: { ...join, phone: "090-abc" },
        fields: { phone: "invalid_format" },
      },
      {
        name: "電話番号が空なら保存しない",
        input: { ...join, phone: "" },
        expect: { phone: undefined },
      },
      {
        name: "同意が false",
        input: { ...join, privacy_agreed: false },
        fields: { privacy_agreed: "required" },
      },
      {
        name: "同意がない",
        input: { ...join, privacy_agreed: undefined },
        fields: { privacy_agreed: "required" },
      },
      {
        name: "ポリシーの版の形が違う",
        input: { ...join, privacy_version: "2026/11/01" },
        fields: { privacy_version: "invalid_format" },
      },
      {
        name: "年齢14",
        input: { ...join, age: 14 },
        fields: { age: "out_of_range" },
      },
      {
        name: "年齢100",
        input: { ...join, age: 100 },
        fields: { age: "out_of_range" },
      },
      {
        name: "年齢が文字",
        input: { ...join, age: "19" },
        fields: { age: "invalid" },
      },
      {
        name: "年齢が小数",
        input: { ...join, age: 19.5 },
        fields: { age: "invalid" },
      },
      {
        name: "入会希望では団体名を捨てる",
        input: { ...join, organization: "〇〇会" },
        expect: { organization: undefined },
      },
      {
        name: "知らない項目を捨てる",
        input: { ...other, admin: true },
        expect: { admin: undefined },
      },
      {
        name: "演舞依頼：会場なし",
        input: { ...performance, venue: "" },
        fields: { venue: "required" },
      },
      {
        name: "演舞依頼：改行は \\n にそろえる",
        input: { ...performance, venue: "公民館\r\n2階" },
        expect: { venue: "公民館\n2階" },
      },
      {
        name: "制御文字",
        input: { ...other, message: "a\u0007b" },
        fields: { message: "invalid_format" },
      },
      {
        name: "その他：本文2001文字",
        input: { ...other, message: "あ".repeat(2001) },
        fields: { message: "too_long" },
      },
      {
        name: "おとり項目は200文字まで受け取る",
        input: { ...other, website: "x" },
        expect: { website: "x" },
      },
    ];
  })();
