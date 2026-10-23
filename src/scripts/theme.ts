// 表示の明るさの切り替え（03 §6.2、D-86）。最初の色は public/theme-init.js が決める
const root = document.documentElement;
const buttons = document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]');

/** ボタンの押した状態（aria-pressed）を今の明るさに合わせる */
const sync = () => {
  const dark = root.dataset['theme'] === 'dark';
  for (const button of buttons) button.setAttribute('aria-pressed', String(dark));
};

for (const button of buttons) {
  button.hidden = false;
  button.addEventListener('click', () => {
    const next = root.dataset['theme'] === 'dark' ? 'light' : 'dark';
    root.dataset['theme'] = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      // 覚えられなくても、このページでは切り替える
    }
    sync();
  });
}
sync();
