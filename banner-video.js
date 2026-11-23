'use strict';

(() => {
  if (!('IntersectionObserver' in window)) return;

  const banners = document.querySelectorAll('video[data-banner-source]');
  const toggle = document.querySelector('.banner-video-toggle');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hoverPointer = window.matchMedia('(any-hover: hover)');
  const connection = navigator.connection;
  const visible = new Set();
  const loading = new WeakSet();
  const previewCards = new Map();
  const hovered = new WeakSet();
  const minimumVisibility = 0.18;
  const preferenceKey = 'fishCityBannerVideosPaused';
  let pausedByVisitor = false;

  try {
    pausedByVisitor = localStorage.getItem(preferenceKey) === 'true';
  } catch {
    // The current page still works when storage is unavailable.
  }

  async function loadClip(video) {
    if (loading.has(video)) return;
    loading.add(video);

    try {
      // The host serves whole files. A local Blob lets Safari seek within the clip.
      const response = await fetch(video.dataset.bannerSource);
      if (!response.ok) return;
      video.src = URL.createObjectURL(await response.blob());
      update(video);
    } catch {
      // If loading fails, the poster remains visible.
    } finally {
      loading.delete(video);
    }
  }

  function canPlay(video) {
    if (!visible.has(video) || document.hidden || pausedByVisitor || reducedMotion.matches || connection?.saveData) return false;
    const card = previewCards.get(video);
    return !card || (hoverPointer.matches && hovered.has(card)) || card.matches(':focus-visible');
  }

  function update(video) {
    if (!canPlay(video)) {
      video.autoplay = false;
      video.pause();
      video.classList.remove('is-playing');
      return;
    }

    if (!video.paused) return;
    if (!video.hasAttribute('src')) {
      loadClip(video);
      return;
    }

    video.autoplay = true;
    video.play().catch(() => {});
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const video = entry.target;
      if (entry.intersectionRatio >= minimumVisibility) visible.add(video);
      else visible.delete(video);
      update(video);
    }
  }, { threshold: minimumVisibility });

  for (const video of banners) {
    if (video.dataset.bannerTrigger === 'preview') {
      const card = video.closest('a');
      previewCards.set(video, card);
      card.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'touch' || !hoverPointer.matches) return;
        hovered.add(card);
        update(video);
      });
      card.addEventListener('pointerleave', () => {
        hovered.delete(card);
        update(video);
      });
      card.addEventListener('focus', () => update(video));
      card.addEventListener('blur', () => update(video));
      video.addEventListener('playing', () => video.classList.toggle('is-playing', canPlay(video)));
      video.addEventListener('pause', () => video.classList.remove('is-playing'));
    }
    observer.observe(video);
  }
  function refresh() {
    if (toggle) {
      toggle.hidden = reducedMotion.matches || Boolean(connection?.saveData);
      toggle.setAttribute('aria-pressed', String(!pausedByVisitor));
      toggle.title = pausedByVisitor ? 'Возобновить фоновые видео' : 'Приостановить фоновые видео';
    }
    banners.forEach(update);
  }

  toggle?.addEventListener('click', () => {
    pausedByVisitor = !pausedByVisitor;
    try {
      localStorage.setItem(preferenceKey, String(pausedByVisitor));
    } catch {
      // The button still controls playback on this page.
    }
    refresh();
  });

  document.addEventListener('visibilitychange', refresh);
  reducedMotion.addEventListener('change', refresh);
  hoverPointer.addEventListener('change', refresh);
  connection?.addEventListener?.('change', refresh);
  refresh();
})();
