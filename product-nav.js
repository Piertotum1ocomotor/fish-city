'use strict';

(() => {
  const back = document.querySelector('[data-back-to-catalog]');
  if (back) {
    const current = new URLSearchParams(location.search);
    const previous = new URLSearchParams();
    for (const name of ['category', 'q', 'volume', 'depth', 'allSizes', 'limit', 'sort', 'stock', 'brand', 'unit']) {
      if (current.has(name)) previous.set(name, current.get(name));
    }
    if (previous.size || current.get('from') === 'catalog') {
      const query = previous.size ? '?' + previous : '';
      back.href = '../catalog.html' + query + '#product-' + encodeURIComponent(back.dataset.backToCatalog);
    }
  }

  const gallery = document.querySelector('[data-product-gallery]');
  if (!gallery) return;
  const open = gallery.querySelector('[data-gallery-open]');
  const dialog = gallery.querySelector('dialog');
  if (!open || !dialog || typeof dialog.showModal !== 'function') return;

  const visibleImage = open.querySelector('img');
  const enlargedImage = dialog.querySelector('img');
  const count = dialog.querySelector('[data-gallery-count]');
  const thumbnails = [...gallery.querySelectorAll('.shop-product-thumbs a')];
  const photos = thumbnails.length ? thumbnails.map(thumb => thumb.href) : [open.href];
  let selectedIndex = 0;

  function showImage(index) {
    selectedIndex = (index + photos.length) % photos.length;
    const source = photos[selectedIndex];
    open.href = source;
    visibleImage.src = source;
    if (dialog.open) {
      enlargedImage.src = source;
      enlargedImage.alt = visibleImage.alt + (photos.length > 1 ? ', фото ' + (selectedIndex + 1) : '');
    }
    if (count) count.textContent = (selectedIndex + 1) + ' из ' + photos.length;
    thumbnails.forEach((thumb, number) => {
      if (number === selectedIndex) thumb.setAttribute('aria-current', 'true');
      else thumb.removeAttribute('aria-current');
    });
  }

  thumbnails.forEach((thumb, index) => thumb.addEventListener('click', event => {
    event.preventDefault();
    showImage(index);
  }));
  open.addEventListener('click', event => {
    event.preventDefault();
    dialog.showModal();
    showImage(selectedIndex);
  });
  for (const button of dialog.querySelectorAll('[data-gallery-step]')) {
    button.addEventListener('click', () => showImage(selectedIndex + Number(button.dataset.galleryStep)));
  }
  dialog.addEventListener('keydown', event => {
    if (photos.length < 2 || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    showImage(selectedIndex + (event.key === 'ArrowLeft' ? -1 : 1));
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    const thumbnail = thumbnails[selectedIndex];
    if (thumbnail) thumbnail.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    open.focus({ preventScroll: true });
  });
})();
