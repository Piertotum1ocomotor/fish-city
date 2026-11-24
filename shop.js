'use strict';

(() => {
  const form = document.getElementById('shop-filter');
  if (!form) return;

  const pageSize = 24;
  const field = name => form.elements.namedItem(name);
  const el = selector => document.querySelector(selector);
  const input = field('q');
  const sort = field('sort');
  const stock = field('stock');
  const brand = field('brand');
  const unit = field('unit');
  const fit = field('sizeOnly');
  const title = el('#catalog-list-title');
  const list = el('#shop-results');
  const status = el('[data-status]');
  const more = el('[data-more]');
  const filterPanel = el('[data-filters]');
  const filterToggle = el('[data-filters-toggle]');
  const pondPanel = el('[data-pond-parameters]');
  const compareBar = el('[data-compare-bar]');
  const compareDialog = el('[data-compare-dialog]');
  const canCompare = typeof compareDialog?.showModal === 'function';
  const params = new URLSearchParams(location.search);
  const volume = Number(params.get('volume'));
  const depth = Number(params.get('depth'));
  const hasVolume = Number.isFinite(volume) && volume > 0 && volume <= 100000000;
  const hasDepth = Number.isFinite(depth) && depth > 0 && depth <= 100;
  const equipment = 'oborudovanie-dlya-pruda';
  const crayfish = 'zhivye-i-varenye-raki';
  const cookedCrayfish = 'varenye-raki';
  const pondCatalog = { id: 'vse-dlya-pruda', title: 'Всё для пруда' };
  const pondCategories = [
    'ryba-dlya-pruda', 'dekorativnaya-ryba-dlya-pruda', equipment,
    'rasteniya-dlya-pruda', 'korm-dlya-ryb',
  ];
  const compatibleCategories = ['aeratory-dlya-pruda', 'filtry-dlya-pruda', 'uf-sterilizatory'];
  const sortByPrice = value => value === 'price-asc' || value === 'price-desc';
  const formatNumber = new Intl.NumberFormat('ru-BY', { maximumFractionDigits: 3 });
  const collation = new Intl.Collator('ru', { numeric: true });
  const compareSelection = new Set();
  let selected = '';
  let visibleLimit = pageSize;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function productAddress(id, query) {
    return 'products/' + encodeURIComponent(id) + '.html?' + (query || 'from=catalog');
  }

  function toggleFilters(open) {
    filterPanel.toggleAttribute('data-collapsed', !open);
    filterToggle.setAttribute('aria-expanded', String(open));
  }

  function compatible(item) {
    const { product, ancestors } = item;
    return compatibleCategories.some(id => ancestors.has(id)) &&
      Number.isFinite(product.maxVolume) && product.maxVolume >= volume &&
      (!hasDepth || !product.maxDepth || depth <= product.maxDepth);
  }

  function setOptions(select, label, values) {
    const current = select.value || select.dataset.initial || '';
    delete select.dataset.initial;
    select.replaceChildren(new Option(label, ''));
    for (const value of values) select.add(new Option(value, value));
    if (values.includes(current)) select.value = current;
  }

  async function start() {
    const response = await fetch('catalog-data.json?v=14');
    if (!response.ok) throw new Error('Catalog data unavailable');
    const { categories, products } = await response.json();
    const byCategory = new Map(categories.map(category => [category.id, category]));
    const children = new Map();
    for (const category of categories) {
      const parent = byCategory.has(category.parentId) ? category.parentId : '';
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(category);
    }
    for (const branch of children.values()) branch.sort((a, b) => collation.compare(a.title, b.title));
    byCategory.set(pondCatalog.id, pondCatalog);
    children.set(pondCatalog.id, pondCategories.map(id => byCategory.get(id)).filter(Boolean));
    if (byCategory.has(cookedCrayfish) && byCategory.get(cookedCrayfish).parentId !== crayfish) {
      children.set(crayfish, [...(children.get(crayfish) || []), byCategory.get(cookedCrayfish)]);
    }

    function lineage(id) {
      const path = [];
      const seen = new Set();
      while (byCategory.has(id) && !seen.has(id)) {
        seen.add(id);
        const category = byCategory.get(id);
        path.push(category);
        id = category.parentId;
      }
      return path;
    }

    const index = products.map(product => {
      const ancestors = new Set(product.categoryIds.flatMap(id => lineage(id).map(item => item.id)));
      const label = searchWords(product.title);
      const model = searchWords(product.search || '');
      const categoryWords = [...ancestors].map(id => byCategory.get(id).title).join(' ');
      const terms = searchWords([categoryWords, product.brand, ...product.facts].filter(Boolean).join(' '));
      if (pondCategories.some(id => ancestors.has(id))) ancestors.add(pondCatalog.id);
      if (ancestors.has(cookedCrayfish)) ancestors.add(crayfish);
      return { product, ancestors, label, model, haystack: [label, model, terms].join(' ') };
    });
    index.sort((a, b) => collation.compare(a.product.title, b.product.title));
    const byProduct = new Map(index.map(item => [item.product.id, item]));
    const rootOrder = [
      'ryba-dlya-pruda', equipment, 'dekorativnaya-ryba-dlya-pruda', 'rasteniya-dlya-pruda',
      'korm-dlya-ryb', crayfish, 'ryba-i-moreprodukty', 'zhivec',
      'sedobnye-podarochnye-kompoziczii',
    ];
    const roots = rootOrder.map(id => byCategory.get(id)).filter(Boolean);
    for (const category of children.get('') || []) {
      if (!rootOrder.includes(category.id)) roots.push(category);
    }
    const remaining = new Set(index);
    const browseOrder = new Map();
    const groups = roots.map(category => index.filter(item => item.ancestors.has(category.id)));
    while (groups.some(group => group.length)) {
      for (const group of groups) {
        while (group.length && !remaining.has(group[0])) group.shift();
        const item = group.shift();
        if (remaining.delete(item)) browseOrder.set(item, browseOrder.size);
      }
    }
    for (const item of remaining) browseOrder.set(item, browseOrder.size);
    const allBrands = new Set(index.map(item => item.product.brand).filter(Boolean));
    const allUnits = new Set(index.map(item => item.product.unit).filter(Boolean));
    const departments = [...el('[data-departments]').querySelectorAll('a')];
    for (const link of departments) link.dataset.categoryChoice = new URL(link.href).searchParams.get('category');
    const extraDepartments = [
      ['korm-dlya-ryb', 'Корм для рыб'],
      ['zhivec', 'Живец'],
      ['sedobnye-podarochnye-kompoziczii', 'Подарочные композиции'],
    ];
    const initial = params.get('category');
    selected = byCategory.has(initial) ? initial : '';
    input.value = (params.get('q') || '').slice(0, 100);
    stock.checked = params.get('stock') === '1';
    fit.checked = hasVolume && !params.has('allSizes');
    brand.dataset.initial = params.get('brand') || '';
    unit.dataset.initial = params.get('unit') || '';
    if ([...sort.options].some(option => option.value === params.get('sort'))) sort.value = params.get('sort');
    const initialLimit = Number(params.get('limit'));
    if (Number.isInteger(initialLimit) && initialLimit > pageSize) visibleLimit = Math.min(initialLimit, index.length);
    el('[data-pond-volume]').textContent = hasVolume ? formatNumber.format(volume) + ' м³' : '';

    function rootCategory() {
      return lineage(selected).at(-1)?.id || '';
    }

    function paramsFor(category = selected) {
      const next = new URLSearchParams();
      if (category) next.set('category', category);
      if (input.value.trim()) next.set('q', input.value.trim());
      if (hasVolume && lineage(category).at(-1)?.id === equipment) {
        next.set('volume', volume);
        if (hasDepth) next.set('depth', depth);
        if (!fit.checked) next.set('allSizes', '1');
      }
      if (stock.checked) next.set('stock', '1');
      if (brand.value && lineage(category).at(-1)?.id === equipment) next.set('brand', brand.value);
      if (unit.value) next.set('unit', unit.value);
      if (sort.value) next.set('sort', sort.value);
      if (category === selected && visibleLimit > pageSize) next.set('limit', visibleLimit);
      return next.toString();
    }

    function linkToCategory(category, label, count) {
      const link = node('a', '', label);
      const next = paramsFor(category);
      link.href = 'catalog.html' + (next ? '?' + next : '');
      link.dataset.categoryChoice = category;
      if (typeof count === 'number') link.append(node('small', '', String(count)));
      if (selected === category) link.setAttribute('aria-current', 'page');
      return link;
    }

    function renderNavigation(counts) {
      const root = rootCategory();
      for (const link of departments) {
        link.href = 'catalog.html?' + paramsFor(link.dataset.categoryChoice);
      }
      el('[data-extras]').replaceChildren(...extraDepartments.map(([id, label]) => linkToCategory(id, label)));
      const directions = el('[data-root-categories]');
      directions.replaceChildren(linkToCategory('', 'Все товары'), ...[pondCatalog, ...roots].map(category => {
        const link = linkToCategory(category.id, category.title);
        if (root === category.id) link.setAttribute('aria-current', 'true');
        return link;
      }));
      const path = lineage(selected).reverse();
      const crumbs = el('[data-category-path]');
      crumbs.hidden = !path.length;
      crumbs.replaceChildren(...[linkToCategory('', 'Каталог'), ...path.slice(0, -1).map(category =>
        linkToCategory(category.id, category.title)
      )].flatMap((link, i, all) => i < all.length - 1 ? [link, node('span', '', '/')] : [link]));
      const subcategories = el('[data-subcategories]');
      const quickEquipment = ['filtry-dlya-pruda', 'aeratory-dlya-pruda', 'nasosy-dlya-pruda', 'uf-sterilizatory', 'plyonka-dlya-pruda'];
      const ids = selected === equipment ? [...new Set([...quickEquipment, ...(children.get(selected) || []).map(category => category.id)])] :
        (children.get(selected) || []).map(category => category.id);
      const relevant = selected ? ids.filter(id => counts.get(id) > 0) : [];
      subcategories.hidden = !relevant.length;
      const links = relevant.map(id => linkToCategory(id, byCategory.get(id).title, counts.get(id)));
      const extra = links.splice(6);
      subcategories.replaceChildren(...links);
      if (extra.length) {
        const details = node('details');
        const panel = node('div');
        panel.append(...extra);
        details.append(node('summary', '', 'Ещё категории'), panel);
        subcategories.append(details);
      }
    }

    function renderChips() {
      const chips = [];
      function add(label, fn) {
        const button = node('button', 'fish-chip', label);
        button.type = 'button';
        button.setAttribute('aria-label', 'Убрать фильтр «' + label + '»');
        const cross = node('span', '', '×');
        cross.setAttribute('aria-hidden', 'true');
        button.append(cross);
        button.addEventListener('click', () => {
          fn();
          refresh();
          input.focus({ preventScroll: true });
        });
        chips.push(button);
      }

      if (input.value.trim()) add('«' + input.value.trim() + '»', () => { input.value = ''; });
      if (selected) add(byCategory.get(selected).title, () => { selected = ''; });
      if (stock.checked) add('В наличии', () => { stock.checked = false; });
      if (brand.value) add(brand.value, () => { brand.value = ''; });
      if (unit.value) add('Цена за ' + unit.value, () => { unit.value = ''; });
      if (!pondPanel.hidden && fit.checked) {
        add(formatNumber.format(volume) + ' м³', () => { fit.checked = false; });
      }
      el('[data-active-filters]').hidden = !chips.length && !sort.value;
      el('[data-filter-chips]').replaceChildren(...chips);
    }

    function compareTray(message = '') {
      const count = compareSelection.size;
      compareBar.hidden = !count;
      el('.fish-catalog').classList.toggle('has-comparison', Boolean(count));
      el('[data-compare-open]').disabled = count < 2;
      el('[data-compare-status]').textContent = message || 'Для сравнения: ' + count + ' из 3';
      for (const button of list.querySelectorAll('[data-compare-product]')) {
        button.setAttribute('aria-pressed', String(compareSelection.has(button.dataset.compareProduct)));
      }
    }

    function toggleComparison(id) {
      if (compareSelection.delete(id)) {
        compareTray();
        return;
      }
      if (compareSelection.size === 3) {
        compareTray('Уберите одну модель, чтобы добавить другую');
        return;
      }
      compareSelection.add(id);
      compareTray();
    }

    function card(item, query) {
      const { product, ancestors } = item;
      const article = node('article', 'catalog-card');
      article.id = 'product-' + product.id;
      const link = node('a');
      link.href = productAddress(product.id, query);
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
      const category = byCategory.get(product.categoryIds[0]);
      copy.append(node('p', 'shop-card-category', category?.title), node('h3', '', product.title));
      if (product.facts.length) {
        const facts = node('ul', 'fish-card-facts');
        facts.append(...product.facts.map(value => node('li', '', value)));
        copy.append(facts);
      }
      const availability = node('p', 'shop-card-stock', product.stock);
      if (product.available) availability.dataset.state = 'in';
      copy.append(node('p', 'catalog-card-price', product.price), availability);
      link.append(photo, copy);
      article.append(link);
      if (canCompare && rootCategory() === equipment && ancestors.has(equipment)) {
        const button = node('button', 'fish-card-compare', 'Сравнить');
        button.type = 'button';
        button.dataset.compareProduct = product.id;
        button.setAttribute('aria-label', 'Сравнить ' + product.title);
        button.setAttribute('aria-pressed', String(compareSelection.has(product.id)));
        article.append(button);
      }
      return article;
    }

    function compare() {
      const selectedProducts = [...compareSelection].map(id => byProduct.get(id)?.product).filter(Boolean);
      const table = node('table');
      const head = table.createTHead().insertRow();
      const header = node('th', '', 'Модель');
      header.scope = 'col';
      head.append(header);
      for (const product of selectedProducts) {
        const cell = node('th');
        cell.scope = 'col';
        const link = node('a', '', product.title);
        link.href = productAddress(product.id, paramsFor());
        cell.append(link);
        head.append(cell);
      }
      const body = table.createTBody();
      const measures = [
        ['Цена', product => product.price],
        ['Наличие', product => product.stock],
        ['Бренд', product => product.brand],
        ['Объём пруда', product => product.maxVolume > 0 ? 'до ' + formatNumber.format(product.maxVolume) + ' м³' : ''],
        ['Глубина установки', product => product.maxDepth > 0 ? 'до ' + formatNumber.format(product.maxDepth) + ' м' : ''],
        ['Мощность', product => product.power],
        ['Производительность', product => product.flow],
      ];
      for (const [label, read] of measures) {
        const values = selectedProducts.map(read);
        if (!values.some(Boolean)) continue;
        const row = body.insertRow();
        const cell = node('th', '', label);
        cell.scope = 'row';
        row.append(cell, ...values.map(value => node('td', '', value || '—')));
      }
      el('[data-compare-content]').replaceChildren(table);
      compareDialog.showModal();
    }

    function relevance(item, normalized, words) {
      const compact = normalized.replaceAll(' ', '');
      if (item.model && item.model.replaceAll(' ', '') === compact) return 0;
      if (item.label === normalized) return 1;
      if (item.label.includes(normalized)) return 2;
      if (words.every(word => item.label.includes(word))) return 3;
      return 4;
    }

    function render(updateUrl = true, append = false) {
      const words = searchQuery(input.value);
      const normalized = searchWords(input.value);
      const root = rootCategory();
      const volumeActive = hasVolume && root === equipment;
      pondPanel.hidden = !volumeActive;
      const matches = index.filter(item => words.every(word => item.haystack.includes(word)) &&
        (!stock.checked || item.product.available) &&
        (!volumeActive || !fit.checked || compatible(item)));
      const base = selected ? matches.filter(item => item.ancestors.has(selected)) : matches;
      const categoryItems = selected ? index.filter(item => item.ancestors.has(selected)) : index;
      const wantedBrand = brand.value || brand.dataset.initial;
      const brandValues = new Set(categoryItems.map(item => item.product.brand).filter(Boolean));
      if (allBrands.has(wantedBrand)) brandValues.add(wantedBrand);
      const brands = root === equipment ? [...brandValues].sort(collation.compare) : [];
      setOptions(brand, 'Все бренды', brands);
      el('[data-brand-filter]').hidden = !brands.length;
      const byBrand = brand.value ? base.filter(item => item.product.brand === brand.value) : base;
      const wantedUnit = unit.value || unit.dataset.initial;
      const categoryUnits = new Set(categoryItems.map(item => item.product.unit).filter(Boolean));
      if (allUnits.has(wantedUnit)) categoryUnits.add(wantedUnit);
      const units = [...categoryUnits].sort(collation.compare);
      setOptions(unit, 'Все единицы', units);
      el('[data-unit-filter]').hidden = units.length < 2 && !unit.value;
      const results = unit.value ? byBrand.filter(item => item.product.unit === unit.value) : byBrand;
      const resultUnits = new Set(byBrand.map(item => item.product.unit).filter(Boolean));
      const canPriceSort = Boolean(unit.value || resultUnits.size === 1);
      for (const option of sort.options) {
        if (!sortByPrice(option.value)) continue;
        option.hidden = option.disabled = !canPriceSort;
      }
      if (sortByPrice(sort.value) && !canPriceSort) sort.value = '';
      if (normalized && !sort.value) {
        results.sort((a, b) => relevance(a, normalized, words) - relevance(b, normalized, words));
      } else if ((!selected || selected === pondCatalog.id) && !sort.value) {
        results.sort((a, b) => browseOrder.get(a) - browseOrder.get(b));
      } else if (sort.value === 'available') {
        results.sort((a, b) => Number(b.product.available) - Number(a.product.available));
      } else if (sortByPrice(sort.value)) {
        const direction = sort.value === 'price-asc' ? 1 : -1;
        results.sort((a, b) => {
          const left = a.product.minPrice;
          const right = b.product.minPrice;
          if (left === undefined || right === undefined) return Number(left === undefined) - Number(right === undefined);
          return (left - right) * direction;
        });
      }

      const relevant = new Map();
      for (const item of matches) {
        if (brand.value && item.product.brand !== brand.value || unit.value && item.product.unit !== unit.value) continue;
        for (const id of item.ancestors) relevant.set(id, (relevant.get(id) || 0) + 1);
      }
      const titleText = byCategory.get(selected)?.title || (normalized ? 'Результаты поиска' : 'Все товары');
      const refined = Boolean(selected || normalized);
      el('.fish-catalog').toggleAttribute('data-refined', refined);
      el('[data-departments]').hidden = refined;
      el('[data-extras]').hidden = refined;
      el('[data-setup-link]').hidden = (root !== equipment && root !== pondCatalog.id) || volumeActive;
      el('[data-clear-query]').hidden = !input.value;
      title.textContent = titleText;
      status.textContent = 'Найдено: ' + results.length;
      el('[data-empty]').hidden = results.length > 0;
      renderNavigation(relevant);
      renderChips();
      const query = paramsFor();
      const before = append ? list.children.length : 0;
      const cards = results.slice(before, visibleLimit).map(item => card(item, query));
      if (append) {
        for (const link of list.querySelectorAll('article > a')) {
          link.search = query || 'from=catalog';
        }
        list.append(...cards);
        list.children[before]?.querySelector('a').focus();
      } else {
        list.replaceChildren(...cards);
      }
      more.hidden = results.length <= visibleLimit;
      more.querySelector('[data-progress]').textContent = 'Показано ' + Math.min(visibleLimit, results.length) + ' из ' + results.length;
      el('[data-show-results]').textContent = 'Показать товары (' + results.length + ')';
      if (updateUrl) history.replaceState(history.state, '', 'catalog.html' + (query ? '?' + query : ''));
    }

    function refresh() {
      visibleLimit = pageSize;
      render();
    }

    function reset() {
      input.value = selected = sort.value = brand.value = unit.value = '';
      stock.checked = false;
      fit.checked = hasVolume;
      refresh();
      input.focus();
    }

    form.addEventListener('submit', event => {
      event.preventDefault();
      title.focus();
    });
    input.addEventListener('input', refresh);
    for (const control of [stock, brand, unit, sort, fit]) control.addEventListener('change', refresh);
    el('[data-clear-query]').addEventListener('click', () => {
      input.value = '';
      refresh();
      input.focus();
    });
    el('[data-reset]').addEventListener('click', reset);
    el('[data-empty-reset]').addEventListener('click', reset);
    filterToggle.addEventListener('click', () => toggleFilters(filterToggle.getAttribute('aria-expanded') === 'false'));
    form.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || filterToggle.getAttribute('aria-expanded') !== 'true' || !filterToggle.offsetWidth) return;
      event.preventDefault();
      toggleFilters(false);
      filterToggle.focus();
    });
    el('[data-show-results]').addEventListener('click', () => {
      toggleFilters(false);
      title.focus();
    });
    form.addEventListener('click', event => {
      const link = event.target.closest('a');
      if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const choice = link.dataset.categoryChoice;
      if (choice === undefined || (choice && !byCategory.has(choice))) return;
      event.preventDefault();
      selected = choice || '';
      if (rootCategory() !== equipment) brand.value = '';
      toggleFilters(false);
      refresh();
      title.focus();
    });
    more.querySelector('button').addEventListener('click', () => {
      visibleLimit += pageSize;
      render(true, true);
    });
    if (canCompare) {
      list.addEventListener('click', event => {
        const button = event.target.closest('[data-compare-product]');
        if (button) toggleComparison(button.dataset.compareProduct);
      });
      el('[data-compare-open]').addEventListener('click', compare);
      compareDialog.addEventListener('close', () => el('[data-compare-open]').focus({ preventScroll: true }));
      el('[data-compare-clear]').addEventListener('click', () => {
        compareSelection.clear();
        compareTray();
        title.focus({ preventScroll: true });
      });
    }
    for (const selector of ['[data-search]', '[data-controls]', '[data-filters]']) el(selector).hidden = false;
    render(false);
    if (location.hash.startsWith('#product-')) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) target.scrollIntoView({ behavior: 'instant' });
      else history.replaceState(history.state, '', location.pathname + location.search);
    }
  }

  status.textContent = 'Загружаем каталог…';
  start().catch(() => {
    status.textContent = '';
    document.querySelector('[data-error]').hidden = false;
  });
})();
