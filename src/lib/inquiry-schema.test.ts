// UT-04（07）。submit-inquiry のテストと同じケース表（inquiry-schema.ts の INQUIRY_SCHEMA_CASES）を使う
import { describe, expect, it } from 'vitest';
import { INQUIRY_SCHEMA_CASES, inquirySchema, toFieldReasons } from './inquiry-schema.ts';

describe('問い合わせの入力チェック（02 §4.2、D-34）', () => {
  it.each(INQUIRY_SCHEMA_CASES)('$name', (c) => {
    const result = inquirySchema.safeParse(c.input);
    if (c.fields) {
      expect(result.success).toBe(false);
      if (!result.success) expect(toFieldReasons(result.error.issues)).toEqual(c.fields);
    } else {
      expect(result.success).toBe(true);
      if (result.success && c.expect) {
        const data = result.data as Record<string, unknown>;
        for (const [key, value] of Object.entries(c.expect)) expect(data[key]).toEqual(value);
      }
    }
  });
});
