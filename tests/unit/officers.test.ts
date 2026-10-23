// 役員紹介の部品（D-121）
import { describe, expect, it } from 'vitest';
import { compareOfficers } from '../../src/lib/data.ts';
import { OFFICERS_PAGE } from '../../src/lib/messages.ts';
import { publicOfficerSchema } from '../../src/lib/view-schemas.ts';
import { rows } from './helpers.ts';

describe('役員紹介', () => {
  it('compareOfficers は sort_order の昇順に並べる', () => {
    const list = [rows.officer(3, '書記'), rows.officer(1, '会長'), rows.officer(2, '副会長')];
    expect([...list].sort(compareOfficers).map((o) => o.role)).toEqual(['会長', '副会長', '書記']);
  });

  it('リードは年度の表示を添える', () => {
    expect(OFFICERS_PAGE.lead('令和8年度')).toBe('令和8年度の役員です。');
  });

  it('行の形が違えば受け付けない（sort_order は整数）', () => {
    expect(publicOfficerSchema.safeParse(rows.officer(1)).success).toBe(true);
    expect(publicOfficerSchema.safeParse({ ...rows.officer(1), sort_order: 1.5 }).success).toBe(
      false,
    );
    expect(publicOfficerSchema.safeParse({ role: '会長', sort_order: 1 }).success).toBe(false);
  });
});
