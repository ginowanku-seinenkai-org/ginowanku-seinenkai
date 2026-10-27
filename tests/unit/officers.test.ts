// 役員紹介の部品（D-121、D-122、D-132）
import { describe, expect, it } from 'vitest';
import {
  compareOfficers,
  officerInitial,
  officerPhoto,
  splitOfficers,
} from '../../src/lib/data.ts';
import { OFFICERS_PAGE } from '../../src/lib/messages.ts';
import { VIEW_COLUMNS, publicOfficerSchema, type PublicPhoto } from '../../src/lib/view-schemas.ts';
import { PHOTO_ID, rows } from './helpers.ts';

describe('役員紹介', () => {
  it('compareOfficers は sort_order の昇順に並べる', () => {
    const list = [rows.officer(3, '書記'), rows.officer(1, '会長'), rows.officer(2, '副会長')];
    expect([...list].sort(compareOfficers).map((o) => o.role)).toEqual(['会長', '副会長', '書記']);
  });

  it('splitOfficers は先頭の1人と2人目からに分ける（D-132）', () => {
    const list = [rows.officer(1, '会長'), rows.officer(2, '副会長'), rows.officer(3, '書記')];
    const { top, rest } = splitOfficers(list);
    expect(top?.role).toBe('会長');
    expect(rest.map((o) => o.role)).toEqual(['副会長', '書記']);
    // 1人だけなら一覧は空、0人なら先頭もない
    expect(splitOfficers([rows.officer(1, '会長')]).rest).toEqual([]);
    expect(splitOfficers([])).toEqual({ top: undefined, rest: [] });
  });

  it('リードは年度の表示を添える', () => {
    expect(OFFICERS_PAGE.lead('令和8年度')).toBe('令和8年度の役員です。');
  });

  it('行の形が違えば受け付けない（sort_order は整数、photo_id は UUID か null）', () => {
    expect(publicOfficerSchema.safeParse(rows.officer(1)).success).toBe(true);
    expect(
      publicOfficerSchema.safeParse(rows.officer(1, '会長', '宜野湾 一郎', PHOTO_ID)).success,
    ).toBe(true);
    expect(publicOfficerSchema.safeParse({ ...rows.officer(1), sort_order: 1.5 }).success).toBe(
      false,
    );
    expect(publicOfficerSchema.safeParse({ role: '会長', sort_order: 1 }).success).toBe(false);
    expect(publicOfficerSchema.safeParse({ ...rows.officer(1), photo_id: 'photo' }).success).toBe(
      false,
    );
    // photo_id の列が無い行も受け付けない（ビューの列の変更を取り込み忘れないため。D-122）
    const withoutPhoto: Record<string, unknown> = { ...rows.officer(1) };
    delete withoutPhoto['photo_id'];
    expect(publicOfficerSchema.safeParse(withoutPhoto).success).toBe(false);
  });

  it('ひと言は文字列か null。列が無い行は受け付けない（D-124、D-125）', () => {
    expect(
      publicOfficerSchema.safeParse(
        rows.officer(1, '会長', '宜野湾 一郎', null, 'よろしくお願いします。'),
      ).success,
    ).toBe(true);
    expect(publicOfficerSchema.safeParse(rows.officer(1, '書記', '宜野湾 花子')).success).toBe(
      true,
    );
    expect(publicOfficerSchema.safeParse({ ...rows.officer(1), message: 1 }).success).toBe(false);
    const withoutMessage: Record<string, unknown> = { ...rows.officer(1) };
    delete withoutMessage['message'];
    expect(publicOfficerSchema.safeParse(withoutMessage).success).toBe(false);
  });

  it('v_public_officers から読む列は、スキーマの列と同じ（D-124、D-125）', () => {
    expect(VIEW_COLUMNS.v_public_officers.split(',')).toEqual(
      Object.keys(publicOfficerSchema.shape),
    );
  });

  it('officerPhoto は写真があれば返し、null や公開用ビューに無い ID なら undefined（D-122）', () => {
    const photo: PublicPhoto = rows.photo();
    const photos = new Map([[PHOTO_ID, photo]]);
    expect(officerPhoto(rows.officer(1, '会長', '宜野湾 一郎', PHOTO_ID), photos)).toBe(photo);
    expect(officerPhoto(rows.officer(1), photos)).toBeUndefined();
    expect(
      officerPhoto(
        rows.officer(1, '会長', '宜野湾 一郎', 'aaaaaaaa-0000-4000-8000-000000000000'),
        photos,
      ),
    ).toBeUndefined();
  });

  it('officerInitial は氏名の最初の1文字を返す（前後の空白は除き、サロゲートペアも1文字）（D-122）', () => {
    expect(officerInitial('宜野湾 一郎')).toBe('宜');
    expect(officerInitial('  比嘉 花子')).toBe('比');
    expect(officerInitial('𠮷田 太郎')).toBe('𠮷');
    expect(officerInitial('')).toBe('');
  });
});
