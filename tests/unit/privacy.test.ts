// プライバシーポリシーの版（03 §8.3。/privacy の表示は tests/dist で確かめる）
import { describe, expect, it } from 'vitest';
import { PRIVACY_ESTABLISHED_ON, PRIVACY_VERSION } from '../../src/lib/privacy.ts';

describe('privacy', () => {
  it('YYYY-MM-DD の形で、最終改定日は制定日より前でない', () => {
    expect(PRIVACY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(PRIVACY_ESTABLISHED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(PRIVACY_VERSION >= PRIVACY_ESTABLISHED_ON).toBe(true);
  });
});
