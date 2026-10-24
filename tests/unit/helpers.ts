// テスト用の小さな部品
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const tempDir = () => mkdtemp(join(tmpdir(), 'gws-test-'));

export const PHOTO_ID = '0f0e0d0c-0b0a-4908-8706-050403020100';
export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

export const rows = {
  post: {
    id: 1,
    kind: 'news',
    title: 'お知らせ',
    body: { type: 'doc', content: [] },
    cover_photo_id: PHOTO_ID,
    event_starts_at: null,
    event_ends_at: null,
    event_all_day: false,
    event_time_tbd: false,
    event_place: null,
    published_on: '2026-10-01',
    updated_at: '2026-10-01T00:00:00Z',
  },
  page: (key: 'about' | 'join' | 'songs') => ({
    key,
    title: key,
    lead: null,
    body: { type: 'doc', content: [] },
    cover_photo_id: null,
    updated_at: '2026-10-01T00:00:00Z',
  }),
  settings: {
    og_photo_id: null,
    instagram_url: null,
    tiktok_url: null,
    join_age_label: '高校生以上',
    officer_term_label: null,
  },
  officer: (
    sort_order: number,
    role = '会長',
    name = '宜野湾 一郎',
    photo_id: string | null = null,
    message: string | null = null,
  ) => ({
    role,
    name,
    sort_order,
    photo_id,
    message,
  }),
  photo: (id: string = PHOTO_ID) => ({
    id,
    full_path: `${id}/full.jpg`,
    thumb_path: `${id}/thumb.jpg`,
    width: 1600,
    height: 1200,
    thumb_width: 480,
    thumb_height: 360,
    alt: '写真',
  }),
};
