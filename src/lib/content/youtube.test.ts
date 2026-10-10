// parseYouTubeId() のテスト（07 RB-52）
import { describe, expect, it } from 'vitest';
import { parseYouTubeId } from './youtube.ts';

describe('parseYouTubeId', () => {
  it.each([
    'https://www.youtube.com/watch?v=M7lc1UVf-VE',
    'https://youtube.com/watch?v=M7lc1UVf-VE&t=30s',
    'https://youtu.be/M7lc1UVf-VE',
    'https://youtu.be/M7lc1UVf-VE?t=30',
    'https://www.youtube.com/shorts/M7lc1UVf-VE',
    'https://www.youtube.com/embed/M7lc1UVf-VE',
    'https://m.youtube.com/watch?v=M7lc1UVf-VE',
    '  https://www.youtube.com/watch?v=M7lc1UVf-VE  ',
  ])('%s → 動画 ID', (url) => {
    expect(parseYouTubeId(url)).toBe('M7lc1UVf-VE');
  });

  it.each([
    'https://evil.example/watch?v=M7lc1UVf-VE',
    'https://www.youtube.com.evil.example/watch?v=M7lc1UVf-VE',
    'https://www.youtube.com/watch?v=abc',
    'https://www.youtube.com/watch?v=M7lc1UVf-VEx',
    'https://www.youtube.com/channel/M7lc1UVf-VE',
    'javascript:alert(1)//youtu.be/M7lc1UVf-VE',
    'M7lc1UVf-VE',
    '',
  ])('%s → null', (url) => {
    expect(parseYouTubeId(url)).toBeNull();
  });
});
