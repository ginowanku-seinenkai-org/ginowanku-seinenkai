// 環境変数の検証（03 §15、00 §8）。src では import.meta.env、scripts では process.env から読む
// すべてブラウザに配ってよい値。production・preview では4つとも必須、local では既定値を使う
import { z } from 'zod';

/** サイトの環境（PUBLIC_SITE_ENV の値） */
export const SITE_ENVS = ['production', 'preview', 'local'] as const;
/** サイトの環境 */
export type SiteEnv = (typeof SITE_ENVS)[number];

/** 検証した公開の環境変数 */
export interface PublicEnv {
  siteEnv: SiteEnv;
  supabaseUrl: string;
  supabasePublishableKey: string;
  turnstileSiteKey: string;
}

// local のときに、値が無ければ使う既定値
const LOCAL_DEFAULTS = {
  PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
  // Turnstile の公式のテスト用キー（常に成功）
  PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
} as const;

// production・preview で必須の値（前後の空白を除いて1文字以上）
const required = z.string().trim().min(1);

/**
 * 環境変数を検証して PublicEnv にする。PUBLIC_SITE_ENV が無ければ local
 * @param raw 環境変数（import.meta.env か process.env）
 * @returns 検証した値
 * @throws production・preview で値が無いとき、PUBLIC_SITE_ENV や PUBLIC_SUPABASE_URL の形が違うとき
 */
export function parseEnv(raw: Record<string, string | undefined>): PublicEnv {
  const siteEnv = z.enum(SITE_ENVS).parse(raw['PUBLIC_SITE_ENV'] || 'local');
  /**
   * 環境変数を1つ読む。local では無ければ既定値、production・preview では必須
   * @param name 環境変数の名前
   * @returns 前後の空白を除いた値
   * @throws production・preview で値が無いとき
   */
  const pick = (name: keyof typeof LOCAL_DEFAULTS): string => {
    const value = raw[name];
    if (siteEnv === 'local') return value?.trim() || LOCAL_DEFAULTS[name];
    const parsed = required.safeParse(value);
    if (!parsed.success)
      throw new Error(`環境変数 ${name} が設定されていません（PUBLIC_SITE_ENV=${siteEnv}）`);
    return parsed.data;
  };
  const supabaseUrl = pick('PUBLIC_SUPABASE_URL');
  z.url({ protocol: /^https?$/ }).parse(supabaseUrl);
  return {
    siteEnv,
    supabaseUrl,
    supabasePublishableKey: pick('PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    turnstileSiteKey: pick('PUBLIC_TURNSTILE_SITE_KEY'),
  };
}

let cached: PublicEnv | undefined;

/**
 * 環境変数を読んで検証する。ビルド時（Astro のページ）と scripts から使う。結果は1回目の値を使い回す
 * @returns 検証した値
 * @throws parseEnv() と同じ
 */
export function getEnv(): PublicEnv {
  cached ??= parseEnv(
    typeof import.meta.env === 'object' && import.meta.env !== null
      ? { ...process.env, ...(import.meta.env as Record<string, string | undefined>) }
      : process.env,
  );
  return cached;
}
