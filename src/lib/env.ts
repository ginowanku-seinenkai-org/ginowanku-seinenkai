// 環境変数の検証（03 §15、00 §8）。src では import.meta.env、scripts では process.env から読む
// すべてブラウザに配ってよい値。production・preview では4つとも必須、local では既定値を使う
import { z } from 'zod';

export const SITE_ENVS = ['production', 'preview', 'local'] as const;
export type SiteEnv = (typeof SITE_ENVS)[number];

export interface PublicEnv {
  siteEnv: SiteEnv;
  supabaseUrl: string;
  supabasePublishableKey: string;
  turnstileSiteKey: string;
}

const LOCAL_DEFAULTS = {
  PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
  // Turnstile の公式のテスト用キー（常に成功）
  PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
} as const;

const required = z.string().trim().min(1);

export function parseEnv(raw: Record<string, string | undefined>): PublicEnv {
  const siteEnv = z.enum(SITE_ENVS).parse(raw['PUBLIC_SITE_ENV'] || 'local');
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

/** ビルド時（Astro のページ）と scripts から使う */
export function getEnv(): PublicEnv {
  cached ??= parseEnv(
    typeof import.meta.env === 'object' && import.meta.env !== null
      ? { ...process.env, ...(import.meta.env as Record<string, string | undefined>) }
      : process.env,
  );
  return cached;
}
