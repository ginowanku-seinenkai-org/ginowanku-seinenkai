// スマホのメニュー開閉（03 §6.2）。読み込まれるまではナビを開いたまま表示する
const container = document.querySelector<HTMLElement>('[data-menu]');
const button = container?.querySelector<HTMLButtonElement>('.menu-btn');
const nav = container?.querySelector<HTMLElement>('.nav');

if (container && button && nav) {
  container.classList.add('js-menu');
  button.hidden = false;

  /**
   * メニューを開く・閉じる
   * @param open 開くなら true
   */
  const setOpen = (open: boolean) => {
    button.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('open', open);
  };

  button.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      button.focus();
    }
  });
}
