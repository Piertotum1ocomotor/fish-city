'use strict';

function setupMenu() {
  const sectionMenu = document.querySelector('.site-nav');
  const menuButton = document.querySelector('.menu-button');
  if (!sectionMenu || !menuButton) return;

  function setMenuOpen(open) {
    menuButton.setAttribute('aria-expanded', String(open));
    sectionMenu.classList.toggle('is-open', open);
  }

  document.documentElement.classList.add('menu-ready');
  menuButton.hidden = false;
  menuButton.addEventListener('click', () => {
    setMenuOpen(menuButton.getAttribute('aria-expanded') === 'false');
  });
  sectionMenu.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link) return;
    const wasOpen = menuButton.getAttribute('aria-expanded') === 'true';
    setMenuOpen(false);
    if (!wasOpen || !link.getAttribute('href').startsWith('#')) return;
    const target = document.getElementById(link.hash.slice(1));
    if (!target) return;
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || menuButton.getAttribute('aria-expanded') === 'false') return;
    setMenuOpen(false);
    menuButton.focus();
  });
  window.matchMedia('(max-width: 760px)').addEventListener('change', () => setMenuOpen(false));
}

setupMenu();

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

if (!reducedMotion.matches && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('entered');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.17 });

  for (const element of document.querySelectorAll('[data-reveal]')) {
    observer.observe(element);
  }

  reducedMotion.addEventListener('change', (event) => {
    if (event.matches) observer.disconnect();
  });
}

const volumeNumber = new Intl.NumberFormat('ru-BY', { maximumFractionDigits: 3 });
const wholeNumber = new Intl.NumberFormat('ru-BY', { maximumFractionDigits: 0 });
const moneyNumber = new Intl.NumberFormat('ru-BY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function readNumber(input, { min, max, whole = false }) {
  const raw = input.value.trim();
  const pattern = whole ? /^\d+$/ : /^(?:\d+(?:[,.]\d{1,3})?|[,.]\d{1,3})$/;
  const value = Number(raw.replace(',', '.'));
  return pattern.test(raw) && value >= min && value <= max ? value : null;
}

function setInvalid(form, error, input, message, focus) {
  form.querySelectorAll('[aria-invalid]').forEach((field) => {
    field.removeAttribute('aria-invalid');
    field.removeAttribute('aria-describedby');
  });
  error.textContent = message;
  if (!input) return;
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', error.id);
  if (focus) input.focus();
}

function setupPondForm() {
  const form = document.getElementById('pond-form');
  if (!form) return;
  const error = document.getElementById('pond-error');
  const result = document.getElementById('pond-result');
  const resultPanel = result.closest('.output-panel');
  const literResult = document.getElementById('pond-liters');
  const shapeOptions = form.elements.namedItem('shape');
  const equipmentLink = document.getElementById('pond-equipment-link');
  const liner = document.getElementById('pond-liner');
  const linerForm = document.getElementById('liner-form');
  const linerError = document.getElementById('liner-error');
  const linerResult = document.getElementById('liner-result');
  let pondDimensions;
  let resultPulse;

  function clearPondDimensions() {
    pondDimensions = null;
    resultPulse?.cancel();
    equipmentLink.setAttribute('href', 'catalog.html?category=oborudovanie-dlya-pruda');
    linerResult.textContent = '';
    setInvalid(linerForm, linerError, null, '', false);
  }

  function showPondVolume(focus, notifyScene = true) {
    const shape = shapeOptions.value;
    const fields = [
      ['length', 'Введите длину от 0,001 до 1000 м.'],
      ['width', 'Введите ширину от 0,001 до 1000 м.'],
      ['depth', 'Введите среднюю глубину от 0,001 до 100 м.'],
    ];
    const dimensions = [];
    for (const [name, message] of fields) {
      const input = form.elements.namedItem(name);
      const number = readNumber(input, { min: 0.001, max: name === 'depth' ? 100 : 1000 });
      if (number === null) {
        setInvalid(form, error, input, message, focus);
        result.textContent = '—';
        literResult.textContent = '';
        clearPondDimensions();
        return;
      }
      dimensions.push(number);
    }

    setInvalid(form, error, null, '', false);
    const factor = shape === 'oval' ? Math.PI / 4 : 1;
    const [length, width, depth] = dimensions;
    const volume = length * width * depth * factor;
    const liters = volume * 1000;
    clearPondDimensions();
    pondDimensions = { length, width, depth };
    const params = new URLSearchParams({ category: 'oborudovanie-dlya-pruda', volume: String(Number(volume.toPrecision(15))), depth: String(depth) });
    equipmentLink.setAttribute('href', 'catalog.html?' + params);
    result.textContent = volume >= 0.001 ? volumeNumber.format(volume) + ' м³' : 'Менее 0,001 м³';
    literResult.textContent = liters >= 1 ? wholeNumber.format(liters) + ' л' : 'Менее 1 л';
    if (notifyScene) {
      form.dispatchEvent(new CustomEvent('pond:volume', {
        bubbles: true,
        detail: { shape, length, width, depth, volume },
      }));
    }
  }

  function showLinerSize(event) {
    event.preventDefault();
    linerResult.textContent = '';
    if (!pondDimensions) {
      setInvalid(linerForm, linerError, null, 'Сначала рассчитайте объём пруда выше.', false);
      return;
    }
    const depthInput = linerForm.elements.namedItem('maxDepth');
    const marginInput = linerForm.elements.namedItem('margin');
    const maxDepth = readNumber(depthInput, { min: pondDimensions.depth, max: 100 });
    const margin = readNumber(marginInput, { min: 0, max: 10 });
    if (maxDepth === null) {
      setInvalid(linerForm, linerError, depthInput, 'Максимальная глубина должна быть не меньше средней и не больше 100 м.', true);
      return;
    }
    if (margin === null) {
      setInvalid(linerForm, linerError, marginInput, 'Введите запас от 0 до 10 м с каждой стороны.', true);
      return;
    }
    setInvalid(linerForm, linerError, null, '', false);
    const allowance = 2 * (maxDepth + margin);
    const length = volumeNumber.format(pondDimensions.length + allowance);
    const width = volumeNumber.format(pondDimensions.width + allowance);
    linerResult.textContent = length + ' × ' + width + ' м';
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    showPondVolume(true);
  });
  shapeOptions.forEach((radio) => {
    radio.addEventListener('change', () => showPondVolume(false));
  });
  form.addEventListener('pond:volume', () => {
    if (reducedMotion.matches || !resultPanel?.animate) return;
    resultPulse = resultPanel.animate([
      { backgroundColor: '#d8e8ff', boxShadow: '0 0 0 2px #0a55e247' },
      { backgroundColor: 'var(--ice)', boxShadow: '0 0 0 5px #0a55e200' },
    ], { duration: 320, easing: 'ease-out' });
  });
  clearOnEdit(form, error, result, literResult, false, clearPondDimensions);
  clearOnEdit(linerForm, linerError, linerResult);
  linerForm.addEventListener('submit', showLinerSize);
  liner.hidden = false;
  showPondVolume(false, false);
}

function setupCrayfishForm() {
  const crayfishForm = document.getElementById('crayfish-form');
  if (!crayfishForm) return;
  const crayfishError = document.getElementById('crayfish-error');
  const crayfishResult = document.getElementById('crayfish-result');
  const crayfishBudget = document.getElementById('crayfish-budget');

  function showCrayfishWeight(focus) {
    const guests = crayfishForm.elements.namedItem('guests');
    const portion = crayfishForm.elements.namedItem('portion');
    const price = crayfishForm.elements.namedItem('price');
    const guestCount = readNumber(guests, { min: 1, max: 999, whole: true });
    const grams = readNumber(portion, { min: 1, max: 9999, whole: true });
    const cost = price.value.trim() === '' ? 0 : readNumber(price, { min: 0.001, max: 100000 });
    const invalid = [
      [guestCount, guests, 'Введите целое число гостей от 1 до 999.'],
      [grams, portion, 'Введите размер порции целым числом от 1 до 9999 г.'],
      [cost, price, 'Введите цену больше 0 и не выше 100 000 BYN за кг или оставьте поле пустым.'],
    ].find(([value]) => value === null);

    if (invalid) {
      setInvalid(crayfishForm, crayfishError, invalid[1], invalid[2], focus);
      crayfishResult.textContent = '—';
      crayfishBudget.hidden = true;
      crayfishBudget.textContent = '';
      return;
    }

    setInvalid(crayfishForm, crayfishError, null, '', false);
    const kilograms = guestCount * grams / 1000;
    crayfishResult.textContent = volumeNumber.format(kilograms) + ' кг';
    crayfishBudget.hidden = cost === 0;
    crayfishBudget.textContent = cost === 0 ? '' : 'Ориентир по бюджету: ' + moneyNumber.format(cost * kilograms) + ' BYN';
  }

  crayfishForm.addEventListener('submit', (event) => {
    event.preventDefault();
    showCrayfishWeight(true);
  });
  clearOnEdit(crayfishForm, crayfishError, crayfishResult, crayfishBudget, true);
  showCrayfishWeight(false);
}

function clearOnEdit(form, error, output, detail, detailShouldBeHidden, onEdit) {
  form.addEventListener('input', (event) => {
    if (event.target.type === 'radio') return;
    setInvalid(form, error, null, '', false);
    output.textContent = detail ? '—' : '';
    if (detail) {
      detail.textContent = '';
      detail.hidden = detailShouldBeHidden;
    }
    onEdit?.();
  });
}

function searchWords(text) {
  return text.toLocaleLowerCase('ru-BY').replaceAll('ё', 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function searchQuery(text) {
  return searchWords(text).split(' ').filter(Boolean).map(word => (
    /^[а-я]{4,}ь$/u.test(word) ? word.slice(0, -1) : word
  ));
}

setupPondForm();
setupCrayfishForm();
