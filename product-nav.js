'use strict';

(() => {
  const back = document.querySelector('[data-back-to-catalog]');
  if (!back) return;

  const current = new URLSearchParams(location.search);
  const previous = new URLSearchParams();
  for (const name of ['category', 'q', 'volume', 'depth', 'allSizes', 'limit']) {
    if (current.has(name)) previous.set(name, current.get(name));
  }
  if (previous.size || current.get('from') === 'catalog') {
    const query = previous.size ? '?' + previous : '';
    back.href = '../catalog.html' + query + '#product-' + encodeURIComponent(back.dataset.backToCatalog);
  }
})();
