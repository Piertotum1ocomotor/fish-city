'use strict';

(() => {
  const scene = document.getElementById('pond-scene');
  const canvas = document.getElementById('pond-water');
  const form = document.getElementById('pond-form');
  const widePreview = document.getElementById('pond-wide-preview');
  const inlinePreview = document.getElementById('pond-inline-preview');
  const ctx = canvas?.getContext('2d');
  if (!ctx || !scene || !form || !widePreview || !inlinePreview) return;

  const backdrop = document.createElement('canvas');
  const bank = backdrop.getContext('2d');
  if (!bank) return;

  const waterPhoto = new Image();
  const koiPhoto = new Image();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const compactLayout = window.matchMedia('(max-width: 760px)');
  const swimDuration = 4500;
  const tau = Math.PI * 2;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const random = index => {
    const sequence = Math.sin(index * 91.37 + 17.81) * 43758.5453;
    return sequence - Math.floor(sequence);
  };

  const pebbles = Array.from({ length: 146 }, (_, index) => ({
    angle: index * tau / 146 + (random(index * 9) - .5) * .034,
    offset: .005 + random(index * 9 + 1) * .15,
    size: .013 + random(index * 9 + 2) * .033,
    flatness: .37 + random(index * 9 + 3) * .44,
    turn: random(index * 9 + 4) * tau,
    tone: random(index * 9 + 5),
  }));
  const fish = [
    { phase: .4, pace: .24, lane: .67, size: .28, light: 1.08, diveAfter: 1.8, interval: 7.3 },
    { phase: 2.75, pace: -.2, lane: .5, size: .24, light: .94, diveAfter: 4.5, interval: 6.6 },
    { phase: 4.95, pace: .27, lane: .56, size: .21, light: 1, diveAfter: 3, interval: 8.2 },
    { phase: 5.8, pace: -.18, lane: .32, size: .18, light: .94, diveAfter: 5.4, interval: 6.9 },
    { phase: 1.61, pace: .22, lane: .68, size: .19, light: .99, diveAfter: 2.8, interval: 7.9 },
    { phase: 3.88, pace: -.24, lane: .47, size: .17, light: .95, diveAfter: 6.4, interval: 8.5 },
  ].map((swimmer, i) => ({ ...swimmer, visibility: i < 4 ? 1 : 0 }));

  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let frame = 0;
  let time = 0;
  let previousFrame = 0;
  let rippleStarted = -10;
  let motionUntil = 0;
  let visible = !('IntersectionObserver' in window);
  let oval = form.elements.namedItem('shape').value === 'oval';
  let shape = oval ? 1 : 0;
  let aspect = 1.5;
  let depth = 1.2;
  let targetAspect = aspect;
  let targetDepth = depth;
  let scale = 1;
  let targetScale = 1;
  let fishCount = 4;
  let dirty = true;
  let waterPath;

  const canStartMotion = () => !reduced.matches && visible && !document.hidden;
  const canAnimate = () => canStartMotion() && performance.now() < motionUntil;

  function bounds() {
    const landscape = Math.max(.55, aspect);
    const rx = Math.min(width * .43, height * .405 * landscape) * scale;
    const ry = rx / landscape;
    return { x: width * .5, y: height * .493, rx, ry, exponent: 5 - 3 * shape };
  }

  function pointAt(outline, angle, radial = 1) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const n = outline.exponent;
    const norm = (Math.abs(cos) ** n + Math.abs(sin) ** n) ** (-1 / n);
    return {
      x: outline.x + outline.rx * norm * cos * radial,
      y: outline.y + outline.ry * norm * sin * radial,
    };
  }

  function createOutline(outline) {
    const path = new Path2D();
    for (let i = 0; i <= 128; i++) {
      const p = pointAt(outline, i * tau / 128);
      if (i === 0) path.moveTo(p.x, p.y);
      else path.lineTo(p.x, p.y);
    }
    path.closePath();
    return path;
  }

  function cover(context, photo, x, y, w, h) {
    const ratio = Math.max(w / photo.naturalWidth, h / photo.naturalHeight);
    const scaledW = photo.naturalWidth * ratio;
    const scaledH = photo.naturalHeight * ratio;
    context.drawImage(photo, x + (w - scaledW) / 2, y + (h - scaledH) / 2, scaledW, scaledH);
  }

  function drawBank(outline) {
    const shore = createOutline({ ...outline, rx: outline.rx + height * .06, ry: outline.ry + height * .07 });
    bank.save();
    const shelf = bank.createLinearGradient(0, outline.y - outline.ry, 0, outline.y + outline.ry);
    shelf.addColorStop(0, '#c3cedb');
    shelf.addColorStop(1, '#8296ae');
    bank.fillStyle = shelf;
    bank.shadowBlur = height * .075 * pixelRatio;
    bank.shadowColor = '#24487752';
    bank.shadowOffsetY = height * .028 * pixelRatio;
    bank.fill(shore);
    bank.restore();

    const shorePalette = ['#a5b3c1', '#8798aa', '#c2c9ce', '#a5abb1', '#abb9c9', '#d4d3cd'];
    for (const stone of pebbles) {
      const p = pointAt(outline, stone.angle, .992 + stone.offset);
      bank.save();
      bank.translate(p.x, p.y);
      bank.rotate(stone.turn);
      const size = stone.size * height;
      const gradient = bank.createLinearGradient(-size, -size, size, size);
      gradient.addColorStop(0, '#e5e8e9');
      gradient.addColorStop(.45, shorePalette[Math.floor(stone.tone * shorePalette.length)]);
      gradient.addColorStop(1, '#64768a');
      bank.fillStyle = gradient;
      bank.beginPath();
      bank.ellipse(0, 0, size, size * stone.flatness, 0, 0, tau);
      bank.fill();
      bank.strokeStyle = '#45587255';
      bank.lineWidth = .65;
      bank.stroke();
      bank.restore();
    }
  }

  function drawWater(outline) {
    bank.save();
    bank.clip(waterPath);
    const inner = bank.createRadialGradient(outline.x, outline.y, 0, outline.x, outline.y, Math.max(outline.rx, outline.ry));
    inner.addColorStop(0, '#0b2945');
    inner.addColorStop(.47, '#1e526a');
    inner.addColorStop(.84, '#39748a');
    inner.addColorStop(1, '#466878');
    bank.fillStyle = inner;
    bank.fillRect(0, 0, width, height);
    if (waterPhoto.naturalWidth) {
      bank.globalAlpha = .87;
      cover(bank, waterPhoto, outline.x - outline.rx, outline.y - outline.ry, outline.rx * 2, outline.ry * 2);
      bank.globalAlpha = 1;
    }
    bank.fillStyle = 'rgba(7,33,72,' + clamp(Math.log2(depth + 1) * .16, .08, .40) + ')';
    bank.fillRect(0, 0, width, height);
    bank.strokeStyle = '#0a264688';
    bank.lineWidth = height * .044;
    bank.stroke(waterPath);
    bank.strokeStyle = '#a9cbe858';
    bank.lineWidth = 1.25;
    bank.stroke(waterPath);
    bank.restore();
  }

  function drawPlants(outline) {
    const size = Math.min(outline.rx, outline.ry);
    for (const angle of [3.75, .61]) {
      const foot = pointAt(outline, angle, 1.035);
      bank.save();
      bank.translate(foot.x, foot.y);
      bank.rotate(angle + Math.PI / 2);
      for (let i = 0; i < 8; i++) {
        const lean = (i - 3.5) * size * .023;
        const length = size * (.15 + random(i * 2.7 + angle) * .17);
        bank.fillStyle = ['#345645', '#577a55', '#72945d'][i % 3];
        bank.beginPath();
        bank.moveTo(lean * .17, 0);
        bank.quadraticCurveTo(lean * .16, -length * .55, lean, -length);
        bank.quadraticCurveTo(lean * .47, -length * .53, lean * .17 + size * .018, 0);
        bank.fill();
      }
      bank.restore();
    }

    bank.save();
    bank.clip(waterPath);
    const pads = pointAt(outline, -0.91, .79);
    for (const [dx, dy, radius, turn] of [[-.08, .06, .083, .7], [.08, .04, .071, 2.2], [.02, -.075, .062, -.8]]) {
      bank.save();
      bank.translate(pads.x + size * dx, pads.y + size * dy);
      bank.rotate(turn);
      const r = size * radius;
      bank.scale(1, .76);
      bank.fillStyle = '#5a855c';
      bank.strokeStyle = '#285b4b';
      bank.lineWidth = .8;
      bank.beginPath();
      bank.moveTo(0, 0);
      bank.arc(0, 0, r, .19, tau - .24);
      bank.closePath();
      bank.fill();
      bank.stroke();
      for (let i = 1; i <= 5; i++) {
        const vein = i * tau / 6;
        bank.beginPath();
        bank.moveTo(0, 0);
        bank.lineTo(Math.cos(vein) * r * .79, Math.sin(vein) * r * .79);
        bank.stroke();
      }
      bank.restore();
    }
    const flower = { x: pads.x + size * .02, y: pads.y - size * .075 };
    bank.translate(flower.x, flower.y);
    for (let i = 0; i < 7; i++) {
      bank.rotate(tau / 7);
      bank.fillStyle = i % 2 ? '#f8f1e0' : '#e9ded1';
      bank.beginPath();
      bank.ellipse(0, -size * .036, size * .017, size * .037, 0, 0, tau);
      bank.fill();
    }
    bank.fillStyle = '#cbb475';
    bank.beginPath();
    bank.arc(0, 0, size * .019, 0, tau);
    bank.fill();
    bank.restore();
  }

  function paintBackdrop(outline) {
    bank.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    bank.clearRect(0, 0, width, height);
    waterPath = createOutline(outline);
    drawBank(outline);
    drawWater(outline);
    drawPlants(outline);
    dirty = false;
  }

  function fishPoint(outline, swimmer, tick) {
    const angle = swimmer.phase + tick * swimmer.pace + Math.sin(tick * .62 + swimmer.phase) * .13;
    const lane = swimmer.lane + Math.sin(tick * .51 + swimmer.phase * 2) * .1;
    return {
      x: outline.x + outline.rx * (Math.cos(angle) * lane + Math.sin(tick * .28 + swimmer.phase) * .08),
      y: outline.y + outline.ry * (Math.sin(angle) * lane + Math.cos(tick * .31 + swimmer.phase) * .08),
    };
  }

  function koiSilhouette(length, swimmer) {
    const w = length * .125;
    ctx.fillStyle = '#eee1c8';
    ctx.beginPath();
    ctx.ellipse(0, -length * .084, w, length * .32, 0, 0, tau);
    ctx.fill();
    ctx.fillStyle = '#dc662e';
    ctx.beginPath();
    ctx.ellipse(w * .26, -length * .18, w * .75, length * .14, -.17, 0, tau);
    ctx.ellipse(-w * .26, length * .072, w * .58, length * .109, .21, 0, tau);
    ctx.fill();
    ctx.fillStyle = '#eee1c8';
    const tail = Math.sin(time * 4 + swimmer.phase) * w * .6;
    ctx.beginPath();
    ctx.moveTo(0, length * .14);
    ctx.quadraticCurveTo(w * .6, length * .34, w * .73 + tail, length * .47);
    ctx.lineTo(0 + tail, length * .40);
    ctx.lineTo(-w * .71 + tail, length * .46);
    ctx.quadraticCurveTo(-w * .43, length * .32, 0, length * .14);
    ctx.fill();
  }

  function paintFish(outline, swimmer) {
    if (swimmer.visibility < .01) return;
    const p = fishPoint(outline, swimmer, time);
    const before = fishPoint(outline, swimmer, time - .07);
    const next = fishPoint(outline, swimmer, time + .07);
    const direction = Math.atan2(next.y - before.y, next.x - before.x) + Math.PI / 2;
    const cycle = (time - swimmer.diveAfter + .9) % swimmer.interval;
    const dive = !reduced.matches && cycle > 0 && cycle < 2.1 ? Math.sin(Math.PI * cycle / 2.1) ** 2 : 0;
    const length = Math.min(height * swimmer.size, outline.rx * .55, outline.ry * .88) * (1 - .19 * dive);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(direction + Math.sin(time * 3.8 + swimmer.phase) * .044);
    ctx.globalAlpha = swimmer.light * (.87 - .69 * dive) * swimmer.visibility;
    ctx.shadowColor = '#01232cbf';
    ctx.shadowBlur = length * .10 * (1 - dive) * pixelRatio;
    ctx.shadowOffsetY = length * .05 * (1 - dive) * pixelRatio;
    if (koiPhoto.naturalWidth) {
      const spriteWidth = length * koiPhoto.naturalWidth / koiPhoto.naturalHeight;
      const stripHeight = koiPhoto.naturalHeight / 10;
      for (let i = 0; i < 10; i++) {
        const progress = i / 10;
        const bend = Math.sin(time * 5.6 + swimmer.phase - 3 * progress) * length * .15 * progress ** 2;
        ctx.drawImage(koiPhoto, 0, stripHeight * i, koiPhoto.naturalWidth, stripHeight, bend - spriteWidth / 2,
          length * (progress - .5), spriteWidth, length / 10 + .2);
      }
    } else {
      koiSilhouette(length, swimmer);
    }

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.globalAlpha = .15 * (1 - dive) ** 2 * swimmer.visibility;
    ctx.strokeStyle = '#b9e6da';
    ctx.lineWidth = .85;
    for (let i = 1; i <= 3; i++) {
      const y = length * (.39 + i * .18);
      const w = length * (.102 + i * .05);
      ctx.beginPath();
      ctx.moveTo(-w, y - length * .15);
      ctx.quadraticCurveTo(0, y, w, y - length * .15);
      ctx.stroke();
      ctx.globalAlpha *= .65;
    }
    ctx.restore();
  }

  function paintSurface(outline) {
    ctx.save();
    ctx.clip(waterPath);
    for (const swimmer of fish) paintFish(outline, swimmer);
    const elapsed = time - rippleStarted;
    if (elapsed >= 0 && elapsed < 1.35) {
      for (let i = 0; i < 3; i++) {
        const step = (elapsed - i * .19) / .87;
        if (step <= 0 || step >= 1) continue;
        const radius = .05 + .86 * step;
        ctx.globalAlpha = (1 - step) * .31;
        ctx.strokeStyle = '#bce7e6';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.ellipse(outline.x, outline.y, outline.rx * radius, outline.ry * radius, 0, 0, tau);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function paint() {
    if (!width || !height) return;
    const outline = bounds();
    if (dirty) paintBackdrop(outline);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(backdrop, 0, 0, width, height);
    paintSurface(outline);
  }

  function settleScene() {
    shape = oval ? 1 : 0;
    aspect = targetAspect;
    depth = targetDepth;
    scale = targetScale;
    fish.forEach((swimmer, i) => { swimmer.visibility = i < fishCount ? 1 : 0; });
    dirty = true;
    paint();
  }

  function render(timestamp) {
    frame = 0;
    if (!canAnimate()) {
      settleScene();
      return;
    }
    const delta = previousFrame ? clamp((timestamp - previousFrame) / 1000, .001, .05) : .016;
    previousFrame = timestamp;
    time += delta;
    const smoothing = 1 - Math.exp(-delta * 7);
    const goal = oval ? 1 : 0;
    if (Math.abs(shape - goal) > .002 || Math.abs(aspect - targetAspect) > .006 || Math.abs(depth - targetDepth) > .01 || Math.abs(scale - targetScale) > .002) {
      shape += (goal - shape) * smoothing;
      aspect += (targetAspect - aspect) * smoothing;
      depth += (targetDepth - depth) * smoothing;
      scale += (targetScale - scale) * smoothing;
      dirty = true;
    }
    fish.forEach((swimmer, i) => {
      swimmer.visibility += ((i < fishCount ? 1 : 0) - swimmer.visibility) * smoothing;
    });
    paint();
    frame = requestAnimationFrame(render);
  }

  function requestPaint() {
    if (canAnimate() && !frame) frame = requestAnimationFrame(render);
  }

  function refreshPlayback() {
    if (canStartMotion()) {
      if (!frame) previousFrame = 0;
      motionUntil = performance.now() + swimDuration;
      requestPaint();
      return;
    }
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    motionUntil = 0;
    rippleStarted = -10;
    settleScene();
  }

  function resize() {
    const area = canvas.getBoundingClientRect();
    width = area.width;
    height = area.height;
    if (!width || !height) return;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = backdrop.width = Math.round(width * pixelRatio);
    canvas.height = backdrop.height = Math.round(height * pixelRatio);
    dirty = true;
    paint();
    requestPaint();
  }

  function switchShape() {
    oval = form.elements.namedItem('shape').value === 'oval';
    scene.dataset.shape = oval ? 'oval' : 'rectangle';
    const name = oval ? 'Овальный пруд' : 'Прямоугольный пруд';
    canvas.setAttribute('aria-label', name + ' с кои, вид сверху');
    refreshPlayback();
  }

  function placeScene() {
    const container = compactLayout.matches ? inlinePreview : widePreview;
    if (scene.parentElement !== container) container.append(scene);
    resize();
  }

  form.addEventListener('change', event => {
    if (event.target.name === 'shape') switchShape();
  });
  form.addEventListener('pond:volume', event => {
    const { length, width: breadth, depth: averageDepth, volume } = event.detail;
    targetAspect = clamp(length / breadth, .55, 2.65);
    targetDepth = averageDepth;
    const area = length * breadth * (form.elements.namedItem('shape').value === 'oval' ? Math.PI / 4 : 1);
    targetScale = clamp((area / 24) ** .14, .62, 1);
    fishCount = 1 + [3, 8, 16, 34, 55].filter(limit => volume >= limit).length;
    scene.dataset.fishCount = String(fishCount);
    if (canStartMotion()) rippleStarted = time;
    dirty = true;
    switchShape();
  });
  reduced.addEventListener('change', refreshPlayback);
  compactLayout.addEventListener('change', placeScene);
  document.addEventListener('visibilitychange', refreshPlayback);
  if ('IntersectionObserver' in window) {
    const visibility = new IntersectionObserver(([entry]) => {
      const isVisible = entry.intersectionRatio >= .3;
      if (visible === isVisible) return;
      visible = isVisible;
      refreshPlayback();
    }, { threshold: .3 });
    visibility.observe(scene);
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);
  waterPhoto.addEventListener('load', () => { dirty = true; paint(); });
  koiPhoto.addEventListener('load', paint);
  waterPhoto.src = 'assets/pond-water.webp';
  koiPhoto.src = 'assets/pond-koi.webp';
  scene.dataset.fishCount = String(fishCount);
  placeScene();
  refreshPlayback();
})();
