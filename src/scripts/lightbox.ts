// ギャラリーの拡大表示（03 §6.7）。<dialog> を showModal() で開き、閉じたら元のサムネイルにフォーカスを戻す
const gallery = document.querySelector<HTMLElement>('[data-gallery]');
const dialog = document.querySelector<HTMLDialogElement>('[data-lightbox]');

if (gallery && dialog && typeof dialog.showModal === 'function') {
  const links = Array.from(gallery.querySelectorAll<HTMLAnchorElement>('a'));
  const img = dialog.querySelector<HTMLImageElement>('[data-lightbox-img]');
  const cap = dialog.querySelector<HTMLElement>('[data-lightbox-cap]');
  let index = 0;
  let opener: HTMLAnchorElement | undefined;

  const show = (i: number) => {
    index = (i + links.length) % links.length;
    const link = links[index];
    const thumb = link?.querySelector('img');
    if (!link || !img) return;
    img.src = link.href;
    img.width = Number(link.dataset['width']) || img.width;
    img.height = Number(link.dataset['height']) || img.height;
    img.alt = thumb?.alt ?? '';
    if (cap) cap.textContent = `${thumb?.alt ?? ''}（${index + 1}／${links.length}）`;
  };

  links.forEach((link, i) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      opener = link;
      show(i);
      dialog.showModal();
    });
  });

  dialog.querySelector('[data-lightbox-prev]')?.addEventListener('click', () => show(index - 1));
  dialog.querySelector('[data-lightbox-next]')?.addEventListener('click', () => show(index + 1));
  dialog.querySelector('[data-lightbox-close]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') show(index - 1);
    if (event.key === 'ArrowRight') show(index + 1);
  });
  dialog.addEventListener('close', () => opener?.focus());
}
