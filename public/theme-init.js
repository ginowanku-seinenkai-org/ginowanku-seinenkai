// 表示の明るさを、描く前に決める（03 §6.2、D-86）。localStorage の theme か、端末の設定
/* global document, localStorage, window */
(() => {
  let theme = null;
  try {
    theme = localStorage.getItem('theme');
  } catch {
    // 使えないときは端末の設定のまま
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
})();
