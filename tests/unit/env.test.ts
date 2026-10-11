// 環境変数の検証（03 §15）
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/lib/env.ts';

const FULL = {
  PUBLIC_SUPABASE_URL: 'https://abcd.supabase.co',
  PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
  PUBLIC_TURNSTILE_SITE_KEY: '0x4AAA',
};

describe('parseEnv', () => {
  it('未設定は local で、既定値を使う', () => {
    expect(parseEnv({})).toEqual({
      siteEnv: 'local',
      supabaseUrl: 'http://127.0.0.1:54321',
      supabasePublishableKey: '',
      turnstileSiteKey: '1x00000000000000000000AA',
    });
  });
  it('production・preview では4つとも必須', () => {
    expect(parseEnv({ ...FULL, PUBLIC_SITE_ENV: 'production' }).siteEnv).toBe('production');
    for (const name of Object.keys(FULL)) {
      expect(() => parseEnv({ ...FULL, PUBLIC_SITE_ENV: 'preview', [name]: '' })).toThrow(name);
    }
  });
  it('知らない環境名はエラー', () =>
    expect(() => parseEnv({ PUBLIC_SITE_ENV: 'staging' })).toThrow());
});
