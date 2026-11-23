'use strict';

(() => {
  const filter = document.getElementById('shop-filter');
  if (!filter) return;

  const pageSize = 24;
  const input = filter.elements.namedItem('q');
  const categorySelect = filter.elements.namedItem('category');
  const topicSelect = filter.elements.namedItem('topic');
  const volumeFilter = filter.elements.namedItem('sizeOnly');
  const volumePanel = filter.querySelector('[data-pond-parameters]');
  const reset = filter.querySelector('[data-reset]');
  const title = document.getElementById('catalog-list-title');
  const list = document.getElementById('shop-results');
  const status = document.querySelector('[data-status]');
  const more = document.querySelector('[data-more]');
  const empty = document.querySelector('[data-empty]');
  const params = new URLSearchParams(location.search);
  const volume = Number(params.get('volume'));
  const depth = Number(params.get('depth'));
  const hasVolume = Number.isFinite(volume) && volume > 0 && volume <= 100000000;
  const depthValid = Number.isFinite(depth) && depth > 0 && depth <= 100;
  const volumeCategories = ['aeratory-dlya-pruda', 'filtry-dlya-pruda', 'uf-sterilizatory'];
  const volumeCompatible = (product, ancestors) =>
    volumeCategories.some(category => ancestors.has(category)) &&
    Number.isFinite(product.maxVolume) && product.maxVolume >= volume &&
    (!depthValid || !product.maxDepth || depth <= product.maxDepth);
  const currentCategory = () => topicSelect.value || categorySelect.value;
  let visibleLimit = pageSize;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  async function start() {
    const response = await fetch('catalog-data.json?v=13');
    if (!response.ok) throw new Error('Catalog data unavailable');
    const { categories, products, asOf } = await response.json();
    const byCategory = new Map(categories.map(category => [category.id, category]));
    const children = new Map();
    for (const category of categories) {
      const parent = byCategory.has(category.parentId) ? category.parentId : '';
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(category);
    }
    const names = new Intl.Collator('ru', { numeric: true });
    for (const branch of children.values()) branch.sort((a, b) => names.compare(a.title, b.title));
    const parentsOf = id => {
      const lineage = [];
      const seen = new Set();
      while (byCategory.has(id) && !seen.has(id)) {
        seen.add(id);
        const category = byCategory.get(id);
        lineage.push(category);
        id = category.parentId;
      }
      return lineage;
    };
    const index = products.map(product => {
      const ancestors = new Set(product.categoryIds.flatMap(id => parentsOf(id).map(item => item.id)));
      const categoryWords = [...ancestors].map(id => byCategory.get(id).title).join(' ');
      return { product, ancestors, search: searchWords(product.title + ' ' + product.search + ' ' + categoryWords) };
    });
    index.sort((a, b) => names.compare(a.product.title, b.product.title));

    function setOptions(select, label, entries) {
      select.replaceChildren(new Option(label, ''));
      for (const { category, indent } of entries) select.add(new Option(indent + category.title, category.id));
    }

    const roots = (children.get('') || []).map(category => ({ category, indent: '' }));
    setOptions(categorySelect, 'Все разделы', roots);

    function updateTopics(selected = '') {
      volumePanel.hidden = !hasVolume || categorySelect.value !== 'oborudovanie-dlya-pruda';
      const branch = [];
      function collect(id, level, seen) {
        if (seen.has(id)) return;
        for (const category of children.get(id) || []) {
          branch.push({ category, indent: '— '.repeat(level) });
          collect(category.id, level + 1, new Set([...seen, id]));
        }
      }
      if (categorySelect.value) collect(categorySelect.value, 0, new Set());
      setOptions(topicSelect, 'Все категории', branch);
      topicSelect.value = branch.some(({ category }) => category.id === selected) ? selected : '';
      topicSelect.closest('label').hidden = branch.length === 0;
    }

    function card({ product }, query) {
      const article = node('article', 'catalog-card');
      article.id = 'product-' + product.id;
      const anchor = node('a');
      anchor.href = 'products/' + encodeURIComponent(product.id) + '.html?' + (query || 'from=catalog');
      const photo = node('div', 'catalog-card-photo');
      if (product.image) {
        const image = node('img');
        image.loading = 'lazy';
        image.decoding = 'async';
        image.alt = '';
        image.src = product.image;
        photo.append(image);
      }
      const copy = node('div', 'catalog-card-copy');
      copy.append(node('p', 'shop-card-category', byCategory.get(product.categoryIds[0])?.title), node('h3', '', product.title),
        node('p', 'catalog-card-price', product.price), node('p', 'shop-card-stock', product.stock));
      anchor.append(photo, copy);
      article.append(anchor);
      return article;
    }

    function searchParams() {
      const next = new URLSearchParams();
      if (currentCategory()) next.set('category', currentCategory());
      if (input.value.trim()) next.set('q', input.value.trim());
      if (!volumePanel.hidden) {
        next.set('volume', volume);
        if (depthValid) next.set('depth', depth);
        if (!volumeFilter.checked) next.set('allSizes', '1');
      }
      if (visibleLimit > pageSize) next.set('limit', visibleLimit);
      return next.toString();
    }

    function render(updateUrl = true, focusNew = false) {
      const words = searchQuery(input.value);
      const selected = currentCategory();
      const byVolume = hasVolume && !volumePanel.hidden && volumeFilter.checked;
      const results = index.filter(({ product, ancestors, search }) =>
        (!selected || ancestors.has(selected)) && words.every(word => search.includes(word)) &&
        (!byVolume || volumeCompatible(product, ancestors))
      );
      const query = searchParams();
      const prior = list.children.length;
      if (!focusNew) list.replaceChildren();
      list.append(...results.slice(focusNew ? prior : 0, visibleLimit).map(item => card(item, query)));
      if (focusNew) {
        for (const anchor of list.querySelectorAll('article > a')) anchor.search = query;
        list.children[prior]?.querySelector('a').focus();
      }
      const total = results.length;
      const shown = Math.min(total, visibleLimit);
      title.textContent = byCategory.get(selected)?.title || 'Все товары';
      status.textContent = 'Найдено: ' + total;
      empty.hidden = total > 0;
      more.hidden = shown >= total;
      more.querySelector('[data-progress]').textContent = 'Показано ' + shown + ' из ' + total;
      reset.hidden = !(selected || input.value || (hasVolume && volumeFilter.checked));
      if (updateUrl) history.replaceState(history.state, '', 'catalog.html' + (query ? '?' + query : ''));
    }

    const initial = params.get('category');
    const hierarchy = parentsOf(initial);
    if (hierarchy.length) categorySelect.value = hierarchy.at(-1).id;
    updateTopics(initial);
    input.value = (params.get('q') || '').slice(0, 100);
    if (hasVolume) {
      volumeFilter.checked = !params.has('allSizes');
      volumePanel.querySelector('[data-pond-volume]').textContent = new Intl.NumberFormat('ru-BY', { maximumFractionDigits: 3 }).format(volume) + ' м³';
    }
    const initialLimit = Number(params.get('limit'));
    if (Number.isInteger(initialLimit) && initialLimit > pageSize) visibleLimit = Math.min(initialLimit, index.length);
    const refresh = () => {
      visibleLimit = pageSize;
      render();
    };
    filter.addEventListener('submit', event => event.preventDefault());
    input.addEventListener('input', refresh);
    topicSelect.addEventListener('change', refresh);
    volumeFilter.addEventListener('change', refresh);
    categorySelect.addEventListener('change', () => {
      updateTopics();
      if (categorySelect.value !== 'oborudovanie-dlya-pruda') volumeFilter.checked = false;
      refresh();
    });
    reset.addEventListener('click', () => {
      input.value = '';
      categorySelect.value = '';
      updateTopics();
      volumeFilter.checked = false;
      refresh();
      input.focus();
    });
    more.querySelector('button').addEventListener('click', () => {
      visibleLimit += pageSize;
      render(true, true);
    });
    const catalogDate = document.querySelector('[data-catalog-date]');
    if (asOf && catalogDate) {
      catalogDate.textContent = 'Данные каталога на ' + asOf.split('-').reverse().join('.') + '.';
      catalogDate.hidden = false;
    }
    filter.hidden = false;
    render(false);
    if (location.hash.startsWith('#product-')) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) target.scrollIntoView({ behavior: 'instant' });
    }
  }

  status.textContent = 'Загружаем каталог…';
  start().catch(() => {
    status.textContent = '';
    document.querySelector('[data-error]').hidden = false;
  });
})();
