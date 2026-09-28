'use strict';

(() => {
  const TAU = Math.PI * 2;
  const STORAGE_KEY = 'wheel-of-names:v1';
  const IMAGE_KEY = `${STORAGE_KEY}:image`;
  const IMAGE_PX = 512; // stored center image is a square of this size
  // Wheel themes. colors: sector fills; textColors: per-sector label colors (default: contrast
  // with the fill); stroke: sector separators; rim: outer ring; pointer/hub/hubInk: CSS overrides;
  // shade: glossy radial overlay; labelPrefix: prepended to every label; image: default center
  // image (the user's own image takes precedence).
  // Built-in center images (original drawings shipped with the app, precached by sw.js)
  const PRESETS = [
    { id: 'anon', name: 'Аноним', src: 'img/anon.svg' },
    { id: 'cat', name: 'Котик', src: 'img/cat.svg' },
    { id: 'capybara', name: 'Капибара', src: 'img/capybara.svg' },
    { id: 'donut', name: 'Пончик', src: 'img/donut.svg' },
    { id: 'dice', name: 'Кубики', src: 'img/dice.svg' },
    { id: 'crystal', name: 'Шар судьбы', src: 'img/crystal.svg' },
    { id: 'clover', name: 'Клевер', src: 'img/clover.svg' },
  ];
  // settings.centerImage: 'auto' (theme image, if any) | 'none' | 'custom' (user upload) | preset id
  const CENTER_CHOICES = ['auto', 'none', 'custom', ...PRESETS.map((x) => x.id)];

  const THEMES = [
    { id: 'classic', name: 'Классика', colors: ['#2F5DE0', '#FFC21A', '#E4572E', '#16A08F', '#7B4FD8', '#F08A24'] },
    { id: 'bright', name: 'Яркая', colors: ['#3369E8', '#D50F25', '#EEB211', '#009925'], shade: true, pointer: '#D50F25' },
    { id: 'rainbow', name: 'Радуга', colors: ['#FF595E', '#FF924C', '#FFCA3A', '#8AC926', '#1982C4', '#6A4C93'], shade: true },
    { id: 'pastel', name: 'Пастель', colors: ['#A7C7E7', '#F8C8DC', '#FDF6A3', '#B5EAD7', '#C7CEEA', '#FFDAC1'], text: '#2B2F3A', stroke: 'rgba(255,255,255,0.9)', hub: '#F8C8DC', hubInk: '#2B2F3A' },
    { id: 'ocean', name: 'Море', colors: ['#03256C', '#0077B6', '#00B4D8', '#90E0EF', '#2541B2'], rim: '#03256C', pointer: '#00B4D8', hub: '#90E0EF', hubInk: '#03256C', shade: true },
    { id: 'autumn', name: 'Осень', colors: ['#9C2C13', '#D9531E', '#F2A541', '#6B8E23', '#8B5A2B'], rim: '#5A2E14', pointer: '#5A2E14', hub: '#F2A541', hubInk: '#3B1D0C' },
    { id: 'mono', name: 'Монохром', colors: ['#1F2430', '#3B4252', '#5E6779', '#8A93A6', '#C9CED8'], stroke: 'rgba(255,255,255,0.6)', hub: '#1F2430', hubInk: '#FFFFFF' },
    { id: 'imageboard', name: 'Имиджборд', colors: ['#F0E0D6', '#FFFFEE', '#D6DAF0', '#EEF2FF'], textColors: ['#789922'], labelPrefix: '>', stroke: '#D9BFB7', rim: '#800000', pointer: '#117743', hub: '#800000', hubInk: '#FFFFEE', image: 'img/anon.svg' },
    { id: 'neon', name: 'Неон', colors: ['#12132B', '#1D1F45'], textColors: ['#39FF14', '#FF2E97', '#00E5FF', '#FFE600'], stroke: '#FF2E97', rim: '#FF2E97', pointer: '#00E5FF', hub: '#FF2E97', hubInk: '#12132B' },
  ];
  const DEFAULT_TITLE = 'Колесо имён';
  const DEFAULT_TEXT = ['Аня', 'Борис', 'Вика', 'Гриша', 'Дина', 'Егор', 'Женя', 'Зоя'].join('\n');
  const DEFAULT_SETTINGS = {
    duration: 6, sound: true, autoRemove: false, confetti: true,
    theme: 'classic', imageSize: 0.34, imageRotate: true,
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    title: $('title'),
    entries: $('entries'),
    count: $('count'),
    wrap: $('wheelWrap'),
    wheel: $('wheel'),
    pointer: $('pointer'),
    spinBtn: $('spinBtn'),
    hint: $('hint'),
    results: $('results'),
    resultsEmpty: $('resultsEmpty'),
    resultsCount: $('resultsCount'),
    restoreBtn: $('restoreBtn'),
    clearResultsBtn: $('clearResultsBtn'),
    shuffleBtn: $('shuffleBtn'),
    sortBtn: $('sortBtn'),
    dedupeBtn: $('dedupeBtn'),
    duration: $('duration'),
    durationOut: $('durationOut'),
    sound: $('sound'),
    autoRemove: $('autoRemove'),
    confettiOn: $('confettiOn'),
    dialog: $('winnerDialog'),
    winnerCard: $('winnerCard'),
    winnerName: $('winnerName'),
    removeWinnerBtn: $('removeWinnerBtn'),
    closeWinnerBtn: $('closeWinnerBtn'),
    confetti: $('confetti'),
    toast: $('toast'),
    installBtn: $('installBtn'),
    shareBtn: $('shareBtn'),
    fullscreenBtn: $('fullscreenBtn'),
    themes: $('themes'),
    imagePresets: $('imagePresets'),
    imagePickBtn: $('imagePickBtn'),
    imageRemoveBtn: $('imageRemoveBtn'),
    imageFile: $('imageFile'),
    imageSize: $('imageSize'),
    imageSizeOut: $('imageSizeOut'),
    imageRotate: $('imageRotate'),
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');

  // ---------- state ----------
  const state = loadState();
  let entries = parseEntries(state.text);
  let rotation = 0;
  let spinning = false;
  let bitmap = null;
  let dpr = 1;
  let pendingWinner = null;
  let theme = THEMES[0];
  let customImage = null; // { img, src } uploaded by the user
  let bundledImage = null; // { img, src } theme or preset image for the current choice
  const bundledImages = new Map(); // src -> Promise<HTMLImageElement>
  const currentImage = () => (state.settings.centerImage === 'custom' ? customImage : bundledImage);
  let hubBitmap = null; // center image pre-rendered as a circle at the current size

  function loadState() {
    const base = { title: DEFAULT_TITLE, text: DEFAULT_TEXT, results: [], removed: [], settings: { ...DEFAULT_SETTINGS } };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return base;
      return {
        title: typeof saved.title === 'string' ? saved.title : base.title,
        text: typeof saved.text === 'string' ? saved.text : base.text,
        results: Array.isArray(saved.results) ? saved.results.filter((r) => r && typeof r.name === 'string') : [],
        removed: Array.isArray(saved.removed) ? saved.removed.filter((n) => typeof n === 'string') : [],
        settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) },
      };
    } catch {
      return base;
    }
  }

  let saveTimer = 0;
  function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* private mode / quota */ }
    }, 150);
  }

  function parseEntries(text) {
    return text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }

  function setEntries(list) {
    el.entries.value = list.join('\n');
    onEntriesChanged();
  }

  function onEntriesChanged() {
    state.text = el.entries.value;
    entries = parseEntries(state.text);
    el.count.textContent = String(entries.length);
    updateControls();
    renderBitmap();
    draw();
    saveState();
  }

  // ---------- fair randomness ----------
  function randomUint32() {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0];
  }

  // Uniform on [0, n) without modulo bias
  function randomInt(n) {
    const limit = Math.floor(0x100000000 / n) * n;
    let x;
    do { x = randomUint32(); } while (x >= limit);
    return x % n;
  }

  function randomFloat() {
    return randomUint32() / 0x100000000;
  }

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const mod = (a, n) => ((a % n) + n) % n;

  // ---------- wheel rendering ----------
  function segmentColor(i, n) {
    const colors = theme.colors;
    let c = i % colors.length;
    // the last sector must not share its color with the first one (nor with its other neighbour)
    if (n > 1 && i === n - 1 && c === 0 && colors.length > 2) {
      c = (n - 2) % colors.length === 1 ? 2 : 1;
    }
    return colors[c];
  }

  function labelColor(i, n) {
    if (theme.textColors) return theme.textColors[i % theme.textColors.length];
    return theme.text || textColorFor(segmentColor(i, n));
  }

  function textColorFor(hex) {
    const v = parseInt(hex.slice(1), 16);
    const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.62 ? '#18213A' : '#FFFFFF';
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let lo = 0, hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid; else hi = mid - 1;
    }
    return lo > 0 ? text.slice(0, lo) + '…' : '';
  }

  function resize() {
    const rect = el.wrap.getBoundingClientRect();
    const size = Math.floor(Math.min(rect.width, rect.height));
    if (!size) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const px = Math.round(size * dpr);
    if (el.wheel.width !== px) {
      el.wheel.width = px;
      el.wheel.height = px;
    }
    renderBitmap();
    draw();
  }

  // The wheel is drawn once into an offscreen canvas; spinning only rotates the bitmap
  function renderBitmap() {
    const S = el.wheel.width;
    if (!S) return;
    if (!bitmap || bitmap.width !== S) {
      bitmap = document.createElement('canvas');
      bitmap.width = S;
      bitmap.height = S;
    }
    renderHub();
    const ctx = bitmap.getContext('2d');
    ctx.clearRect(0, 0, S, S);

    const c = S / 2;
    const rim = Math.max(3, S * 0.008);
    const R = c - rim;
    const n = entries.length;
    const fontFamily = getComputedStyle(document.body).fontFamily;

    ctx.beginPath();
    ctx.arc(c, c, c, 0, TAU);
    ctx.fillStyle = theme.rim || cssVar('--surface') || '#FFFFFF';
    ctx.fill();

    if (n === 0) {
      ctx.beginPath();
      ctx.arc(c, c, R, 0, TAU);
      ctx.fillStyle = cssVar('--line') || '#D3D9E6';
      ctx.fill();
      ctx.fillStyle = cssVar('--muted') || '#5B6680';
      ctx.font = `600 ${Math.round(R * 0.07)}px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Добавьте участников', c, c + R * 0.42);
    } else {
      drawSectors(ctx, c, R, n, fontFamily);
    }

    if (hubBitmap && state.settings.imageRotate) {
      ctx.drawImage(hubBitmap, c - hubBitmap.width / 2, c - hubBitmap.height / 2);
    }
  }

  function drawSectors(ctx, c, R, n, fontFamily) {
    const seg = TAU / n;
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, R, i * seg, (i + 1) * seg);
      ctx.closePath();
      ctx.fillStyle = segmentColor(i, n);
      ctx.fill();
    }

    if (theme.shade) {
      const g = ctx.createRadialGradient(c, c, R * 0.15, c, c, R);
      g.addColorStop(0, 'rgba(255,255,255,0.16)');
      g.addColorStop(0.7, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.16)');
      ctx.beginPath();
      ctx.arc(c, c, R, 0, TAU);
      ctx.fillStyle = g;
      ctx.fill();
    }

    if (n > 1 && n <= 400) {
      ctx.strokeStyle = theme.stroke || 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(1, dpr);
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.lineTo(c + R * Math.cos(i * seg), c + R * Math.sin(i * seg));
        ctx.stroke();
      }
    }

    // Labels: radial, aligned to the outer edge, starting outside the center image
    const hubR = hubBitmap ? hubBitmap.width / 2 : 0;
    const inner = Math.max(R * 0.26, hubR + R * 0.05);
    const outerPad = R * 0.1; // room for the pointer
    const maxWidth = R - inner - outerPad;
    const fontPx = n === 1 ? R * 0.1 : Math.min(R * 0.085, seg * R * 0.6);
    if (fontPx < 7 * dpr || maxWidth <= fontPx) return; // unreadable: too many sectors or too big an image
    const font = (px) => `600 ${px}px ${fontFamily}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      // long names first shrink (down to 50%), only then get an ellipsis
      const label = (theme.labelPrefix || '') + entries[i];
      ctx.font = font(fontPx);
      const width = ctx.measureText(label).width;
      // 3% slack: glyph hinting makes the rescaled text a hair wider than the linear estimate
      if (width > maxWidth) ctx.font = font(Math.max(fontPx * 0.5, (fontPx * maxWidth * 0.97) / width));
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate((i + 0.5) * seg);
      ctx.fillStyle = labelColor(i, n);
      ctx.fillText(fitText(ctx, label, maxWidth), R - outerPad, 0);
      ctx.restore();
    }
  }

  // Center image as a ready-to-blit circle with a ring
  function renderHub() {
    const S = el.wheel.width;
    const image = currentImage();
    if (!image || !S) {
      hubBitmap = null;
      return;
    }
    const d = Math.round(S * state.settings.imageSize);
    if (!hubBitmap || hubBitmap.width !== d) {
      hubBitmap = document.createElement('canvas');
      hubBitmap.width = d;
      hubBitmap.height = d;
    }
    const ctx = hubBitmap.getContext('2d');
    const r = d / 2;
    const ring = Math.max(2, S * 0.008);
    ctx.clearRect(0, 0, d, d);
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r - ring / 2, 0, TAU);
    ctx.clip();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, d, d);
    ctx.drawImage(image.img, 0, 0, d, d);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(r, r, r - ring / 2, 0, TAU);
    ctx.lineWidth = ring;
    ctx.strokeStyle = theme.rim || cssVar('--surface') || '#FFFFFF';
    ctx.stroke();
  }

  function draw() {
    const ctx = el.wheel.getContext('2d');
    const S = el.wheel.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, S, S);
    if (!bitmap) return;
    ctx.translate(S / 2, S / 2);
    ctx.rotate(rotation);
    ctx.drawImage(bitmap, -S / 2, -S / 2);
    if (hubBitmap && !state.settings.imageRotate) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(hubBitmap, (S - hubBitmap.width) / 2, (S - hubBitmap.height) / 2);
    }
  }

  // The pointer is on the right (angle 0). Which sector is under it at rotation rot:
  function indexAt(rot, n) {
    return Math.floor(mod(-rot, TAU) / (TAU / n)) % n;
  }

  // ---------- sound ----------
  const audio = (() => {
    let ctx = null;
    let last = 0;

    function unlock() {
      if (!state.settings.sound) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!ctx) ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume();
    }

    function blip(freq, dur, type, vol, delay = 0) {
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }

    return {
      unlock,
      tick() {
        if (!ctx || !state.settings.sound) return;
        const now = performance.now();
        if (now - last < 35) return;
        last = now;
        blip(1700, 0.03, 'square', 0.04);
      },
      fanfare() {
        if (!ctx || !state.settings.sound) return;
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => blip(f, 0.28, 'triangle', 0.12, i * 0.09));
      },
    };
  })();

  let lastFlick = 0;
  function onTick() {
    audio.tick();
    if (reduceMotion.matches || !el.pointer.animate) return;
    const now = performance.now();
    if (now - lastFlick < 60) return;
    lastFlick = now;
    el.pointer.animate([{ rotate: '-20deg' }, { rotate: '0deg' }], { duration: 110, easing: 'ease-out' });
  }

  // ---------- spinning ----------
  // The winner is chosen BEFORE the animation via crypto.getRandomValues,
  // then the stop angle is computed inside the winner's sector.
  const easeOut = (t) => 1 - Math.pow(1 - t, 4);

  function spin() {
    if (spinning || entries.length === 0 || el.dialog.open) return;
    audio.unlock();

    const snapshot = entries.slice();
    const n = snapshot.length;
    const seg = TAU / n;
    const winner = randomInt(n);
    const offset = (0.12 + 0.76 * randomFloat()) * seg; // not right at the sector boundary
    const target = -(winner * seg + offset);
    const start = rotation;
    const quick = reduceMotion.matches;
    const duration = quick ? 1200 : state.settings.duration * 1000;
    const turns = quick ? 1 : Math.max(2, Math.round(state.settings.duration * 0.8));
    const end = start + mod(target - start, TAU) + turns * TAU;

    spinning = true;
    updateControls();

    let lastIdx = indexAt(start, n);
    const t0 = performance.now();

    const frame = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      rotation = start + (end - start) * easeOut(t);
      draw();
      const idx = indexAt(rotation, n);
      if (idx !== lastIdx) {
        lastIdx = idx;
        onTick();
      }
      if (t < 1) {
        requestAnimationFrame(frame);
        return;
      }
      rotation = mod(end, TAU);
      draw();
      spinning = false;
      updateControls();
      onWinner(snapshot[winner], winner, segmentColor(winner, n));
    };
    requestAnimationFrame(frame);
  }

  function onWinner(name, index, color) {
    state.results.push({ name, at: Date.now() });
    if (state.settings.autoRemove) {
      removeEntry(index, name);
      pendingWinner = null;
    } else {
      pendingWinner = { index, name };
    }
    renderResults();
    saveState();

    el.winnerName.textContent = name;
    el.winnerCard.style.setProperty('--winner-color', color);
    el.removeWinnerBtn.hidden = state.settings.autoRemove;
    el.dialog.showModal();
    el.closeWinnerBtn.focus();

    audio.fanfare();
    if (state.settings.confetti && !reduceMotion.matches) confetti.burst(color);
  }

  function removeEntry(index, name) {
    const list = parseEntries(el.entries.value);
    const i = list[index] === name ? index : list.indexOf(name);
    if (i < 0) return;
    list.splice(i, 1);
    state.removed.push(name);
    setEntries(list);
    renderResults();
  }

  function updateControls() {
    el.spinBtn.disabled = spinning || entries.length === 0;
    el.entries.readOnly = spinning;
    [el.shuffleBtn, el.sortBtn, el.dedupeBtn].forEach((b) => { b.disabled = spinning || entries.length < 2; });
    document.body.classList.toggle('is-spinning', spinning);
  }

  // ---------- results ----------
  const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

  function renderResults() {
    el.results.replaceChildren(...state.results.map((r) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'r-name';
      name.textContent = r.name;
      const time = document.createElement('time');
      const d = new Date(r.at);
      time.dateTime = d.toISOString();
      time.textContent = timeFmt.format(d);
      li.append(time, name);
      return li;
    }));
    el.resultsCount.textContent = String(state.results.length);
    el.resultsEmpty.hidden = state.results.length > 0;
    el.clearResultsBtn.disabled = state.results.length === 0;
    el.restoreBtn.hidden = state.removed.length === 0;
    el.results.scrollTop = el.results.scrollHeight;
  }

  // ---------- confetti ----------
  const confetti = (() => {
    const ctx = el.confetti.getContext('2d');
    let parts = [];
    let raf = 0;
    let prev = 0;

    function burst(color) {
      const w = window.innerWidth, h = window.innerHeight;
      const d = Math.min(window.devicePixelRatio || 1, 2);
      el.confetti.width = Math.round(w * d);
      el.confetti.height = Math.round(h * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      const colors = [color, ...theme.colors];
      for (let i = 0; i < 170; i++) {
        parts.push({
          x: w / 2 + (Math.random() - 0.5) * 80,
          y: h * 0.42,
          vx: (Math.random() - 0.5) * 18,
          vy: -Math.random() * 15 - 5,
          r: Math.random() * TAU,
          vr: (Math.random() - 0.5) * 0.35,
          w: 6 + Math.random() * 6,
          h: 9 + Math.random() * 8,
          c: colors[i % colors.length],
          age: 0,
        });
      }
      if (!raf) {
        prev = performance.now();
        raf = requestAnimationFrame(step);
      }
    }

    function step(now) {
      const k = Math.min(3, (now - prev) / 16.67);
      prev = now;
      const w = window.innerWidth, h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      parts = parts.filter((p) => p.y < h + 40 && p.age < 260);
      for (const p of parts) {
        p.vx *= Math.pow(0.985, k);
        p.vy = p.vy * Math.pow(0.985, k) + 0.38 * k;
        p.x += p.vx * k;
        p.y += p.vy * k;
        p.r += p.vr * k;
        p.age += k;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, Math.max(1, p.h * Math.abs(Math.cos(p.age * 0.12))));
        ctx.restore();
      }
      raf = parts.length ? requestAnimationFrame(step) : 0;
      if (!raf) ctx.clearRect(0, 0, w, h);
    }

    return { burst };
  })();

  // ---------- toasts ----------
  let toastTimer = 0;
  function toast(text, action) {
    clearTimeout(toastTimer);
    el.toast.replaceChildren(document.createTextNode(text));
    if (action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = action.label;
      b.addEventListener('click', action.onClick);
      el.toast.append(b);
    }
    el.toast.hidden = false;
    if (!action) toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2600);
  }

  // ---------- share link ----------
  function toBase64Url(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(s) {
    let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
  }

  async function shareList() {
    const payload = { t: state.title, e: entries, th: state.settings.theme };
    // the uploaded image is not shared (too big for a link); bundled choices are
    if (state.settings.centerImage !== 'custom') payload.ci = state.settings.centerImage;
    const code = toBase64Url(JSON.stringify(payload));
    // the list goes into the fragment (#), so it is never sent to the server
    const url = `${location.origin}${location.pathname}#list=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Ссылка со списком скопирована');
    } catch {
      window.prompt('Скопируйте ссылку:', url);
    }
  }

  function importFromHash() {
    const m = location.hash.match(/^#list=([A-Za-z0-9_-]+)$/);
    if (!m) return;
    try {
      const data = JSON.parse(fromBase64Url(m[1]));
      if (!Array.isArray(data.e)) throw new Error('bad payload');
      const list = data.e.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
      state.text = list.join('\n');
      if (typeof data.t === 'string' && data.t.trim()) state.title = data.t.slice(0, 60);
      if (THEMES.some((t) => t.id === data.th)) state.settings.theme = data.th;
      if (data.ci !== 'custom' && CENTER_CHOICES.includes(data.ci)) state.settings.centerImage = data.ci;
      toast(`Загружен список из ссылки: ${list.length}`);
    } catch {
      toast('Ссылка повреждена, открыт ваш прежний список');
    }
    history.replaceState(null, '', location.pathname + location.search);
  }

  // The link was opened in a tab where the app is already running
  function onHashChange() {
    if (spinning || el.dialog.open || !location.hash.startsWith('#list=')) return;
    importFromHash();
    el.title.value = state.title;
    document.title = state.title.trim() || DEFAULT_TITLE;
    el.entries.value = state.text;
    applyTheme();
    onEntriesChanged();
  }

  // ---------- appearance: theme and center image ----------
  function applyTheme() {
    theme = THEMES.find((t) => t.id === state.settings.theme) || THEMES[0];
    const style = el.wrap.style;
    [['--pointer', theme.pointer], ['--hub-bg', theme.hub], ['--hub-ink', theme.hubInk]].forEach(([prop, value]) => {
      if (value) style.setProperty(prop, value); else style.removeProperty(prop);
    });
    const input = el.themes.querySelector(`input[value="${theme.id}"]`);
    if (input) input.checked = true;
    refreshCenterImage();
  }

  // Source of the bundled image for the current choice (null for 'none' and 'custom')
  function bundledSrc() {
    const choice = state.settings.centerImage;
    if (choice === 'none' || choice === 'custom') return null;
    const preset = PRESETS.find((x) => x.id === choice);
    return preset ? preset.src : theme.image || null;
  }

  function refreshCenterImage() {
    const src = bundledSrc();
    if (!bundledImage || bundledImage.src !== src) bundledImage = null;
    updateImageControls();
    renderBitmap();
    draw();
    if (!src || bundledImage) return;
    if (!bundledImages.has(src)) bundledImages.set(src, loadImage(src));
    bundledImages.get(src).then((img) => {
      if (bundledSrc() !== src) return; // the choice changed while loading
      bundledImage = { img, src };
      updateImageControls();
      renderBitmap();
      draw();
    }).catch(() => bundledImages.delete(src));
  }

  function setCenterChoice(choice) {
    state.settings.centerImage = choice;
    saveState();
    refreshCenterImage();
  }

  function buildImagePicker() {
    const options = [
      { id: 'auto', name: 'Как в теме' },
      { id: 'none', name: 'Нет' },
      ...PRESETS,
      { id: 'custom', name: 'Своя' },
    ];
    el.imagePresets.replaceChildren(...options.map((o) => {
      const label = document.createElement('label');
      label.className = 'pick';
      label.dataset.choice = o.id;
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'centerImage';
      input.value = o.id;
      input.addEventListener('change', () => setCenterChoice(o.id));
      const thumb = document.createElement('span');
      thumb.className = 'pick-thumb';
      if (o.src) {
        const img = document.createElement('img');
        img.src = o.src;
        img.alt = '';
        thumb.append(img);
      }
      const name = document.createElement('span');
      name.textContent = o.name;
      label.append(input, thumb, name);
      return label;
    }));
  }

  function buildThemePicker() {
    el.themes.replaceChildren(...THEMES.map((t) => {
      const label = document.createElement('label');
      label.className = 'theme';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'theme';
      input.value = t.id;
      input.addEventListener('change', () => {
        state.settings.theme = t.id;
        applyTheme();
        saveState();
      });
      const swatch = document.createElement('span');
      swatch.className = 'theme-swatch';
      const step = 360 / Math.max(t.colors.length * 2, 6);
      const stops = [];
      for (let i = 0; i * step < 360; i++) {
        stops.push(`${t.colors[i % t.colors.length]} ${i * step}deg ${(i + 1) * step}deg`);
      }
      swatch.style.setProperty('background', `conic-gradient(${stops.join(', ')})`);
      swatch.style.setProperty('border-color', t.rim || 'var(--surface)');
      const name = document.createElement('span');
      name.textContent = t.name;
      label.append(input, swatch, name);
      return label;
    }));
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image decode failed'));
      img.src = src;
    });
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  // Center-crops the file to a square, downsizes it and stores it as a data: URL
  // (blob: URLs are not allowed by the CSP, data: is).
  async function setCenterImage(file) {
    if (!file || !/^image\//.test(file.type)) {
      toast('Это не картинка');
      return;
    }
    let data;
    try {
      const src = await loadImage(await readAsDataUrl(file));
      const w = src.naturalWidth || IMAGE_PX;
      const h = src.naturalHeight || IMAGE_PX;
      const side = Math.min(w, h);
      const cv = document.createElement('canvas');
      cv.width = IMAGE_PX;
      cv.height = IMAGE_PX;
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, (w - side) / 2, (h - side) / 2, side, side, 0, 0, IMAGE_PX, IMAGE_PX);
      data = cv.toDataURL('image/webp', 0.9);
      if (!data.startsWith('data:image/webp')) data = cv.toDataURL('image/png');
      customImage = { img: await loadImage(data), src: data };
      state.settings.centerImage = 'custom';
      saveState();
    } catch {
      toast('Не удалось открыть картинку');
      return;
    }
    try {
      localStorage.setItem(IMAGE_KEY, data);
      toast('Картинка установлена');
    } catch {
      toast('Картинка установлена, но не сохранится после перезагрузки: не хватает места в браузере');
    }
    updateImageControls();
    renderBitmap();
    draw();
  }

  function removeCenterImage() {
    customImage = null;
    try { localStorage.removeItem(IMAGE_KEY); } catch { /* ignore */ }
    if (state.settings.centerImage === 'custom') setCenterChoice('auto');
    else updateImageControls();
  }

  function updateImageControls() {
    const has = Boolean(currentImage());
    const choice = state.settings.centerImage;
    const input = el.imagePresets.querySelector(`input[value="${choice}"]`);
    if (input) input.checked = true;
    // "Своя" tile exists only while there is an uploaded image; "Как в теме" previews the theme image
    const customTile = el.imagePresets.querySelector('[data-choice="custom"]');
    customTile.hidden = !customImage;
    setTileImage(customTile, customImage && customImage.src);
    setTileImage(el.imagePresets.querySelector('[data-choice="auto"]'), theme.image);
    el.imageRemoveBtn.disabled = !customImage;
    el.imageSize.disabled = !has;
    el.imageRotate.disabled = !has;
    el.wrap.classList.toggle('has-image', has);
    el.wrap.style.setProperty('--hub-size', `${state.settings.imageSize * 100}%`);
  }

  function setTileImage(tile, src) {
    const thumb = tile.querySelector('.pick-thumb');
    let img = thumb.querySelector('img');
    if (!src) {
      if (img) img.remove();
      return;
    }
    if (!img) {
      img = document.createElement('img');
      img.alt = '';
      thumb.append(img);
    }
    if (img.getAttribute('src') !== src) img.src = src;
  }

  async function restoreCenterImage(data) {
    try {
      customImage = { img: await loadImage(data), src: data };
    } catch {
      if (state.settings.centerImage === 'custom') state.settings.centerImage = 'auto';
    }
    refreshCenterImage();
  }

  function setupAppearance() {
    const size = Number(state.settings.imageSize);
    state.settings.imageSize = Number.isFinite(size) ? Math.min(0.5, Math.max(0.2, size)) : DEFAULT_SETTINGS.imageSize;
    let stored = null;
    try { stored = localStorage.getItem(IMAGE_KEY); } catch { /* ignore */ }
    // Before 1.2 an uploaded image was always shown: keep it for existing users
    if (!CENTER_CHOICES.includes(state.settings.centerImage)) state.settings.centerImage = stored ? 'custom' : 'auto';
    if (state.settings.centerImage === 'custom' && !stored) state.settings.centerImage = 'auto';
    buildThemePicker();
    buildImagePicker();
    el.imageSize.value = String(Math.round(state.settings.imageSize * 100));
    el.imageSizeOut.textContent = `${el.imageSize.value}%`;
    el.imageRotate.checked = state.settings.imageRotate;

    el.imagePickBtn.addEventListener('click', () => el.imageFile.click());
    el.imageFile.addEventListener('change', () => {
      const file = el.imageFile.files && el.imageFile.files[0];
      el.imageFile.value = '';
      if (file) setCenterImage(file);
    });
    el.imageRemoveBtn.addEventListener('click', removeCenterImage);
    el.imageSize.addEventListener('input', () => {
      state.settings.imageSize = Number(el.imageSize.value) / 100;
      el.imageSizeOut.textContent = `${el.imageSize.value}%`;
      el.wrap.style.setProperty('--hub-size', `${el.imageSize.value}%`);
      renderBitmap();
      draw();
      saveState();
    });
    el.imageRotate.addEventListener('change', () => {
      state.settings.imageRotate = el.imageRotate.checked;
      renderBitmap();
      draw();
      saveState();
    });

    // Drop an image file straight onto the wheel
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    el.wrap.addEventListener('dragover', (e) => {
      if (!hasFiles(e) || spinning) return;
      e.preventDefault();
      el.wrap.classList.add('drop-target');
    });
    el.wrap.addEventListener('dragleave', () => el.wrap.classList.remove('drop-target'));
    el.wrap.addEventListener('drop', (e) => {
      el.wrap.classList.remove('drop-target');
      if (!hasFiles(e) || spinning) return;
      e.preventDefault();
      setCenterImage(e.dataTransfer.files[0]);
    });

    applyTheme();
    if (stored) restoreCenterImage(stored);
  }

  // ---------- tabs ----------
  function setupTabs() {
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const select = (tab) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        $(t.getAttribute('aria-controls')).hidden = !on;
      });
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (e) => {
        const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!dir) return;
        const next = tabs[(i + dir + tabs.length) % tabs.length];
        select(next);
        next.focus();
      });
    });
  }

  // ---------- PWA ----------
  function setupPwa() {
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      el.installBtn.hidden = false;
    });
    el.installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      el.installBtn.hidden = true;
    });
    window.addEventListener('appinstalled', () => {
      el.installBtn.hidden = true;
      toast('Приложение установлено');
    });

    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
        let hadController = Boolean(navigator.serviceWorker.controller);
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!hadController) { hadController = true; return; }
          toast('Доступна новая версия', { label: 'Обновить', onClick: () => location.reload() });
        });
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      } catch (err) {
        console.warn('Service worker registration failed:', err);
      }
    });
  }

  // ---------- init ----------
  function init() {
    importFromHash();

    el.title.value = state.title;
    document.title = state.title || DEFAULT_TITLE;
    el.entries.value = state.text;
    el.duration.value = String(state.settings.duration);
    el.durationOut.textContent = `${state.settings.duration} с`;
    el.sound.checked = state.settings.sound;
    el.autoRemove.checked = state.settings.autoRemove;
    el.confettiOn.checked = state.settings.confetti;

    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    el.hint.textContent = coarse ? 'Нажмите на колесо' : `Нажмите на колесо или ${isMac ? '⌘' : 'Ctrl'}+Enter`;
    if (!document.fullscreenEnabled) el.fullscreenBtn.hidden = true;

    el.title.addEventListener('input', () => {
      state.title = el.title.value;
      document.title = state.title.trim() || DEFAULT_TITLE;
      saveState();
    });
    el.title.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.title.blur(); });

    el.entries.addEventListener('input', onEntriesChanged);
    el.shuffleBtn.addEventListener('click', () => setEntries(shuffle(entries)));
    el.sortBtn.addEventListener('click', () => setEntries(entries.slice().sort((a, b) => a.localeCompare(b, 'ru'))));
    el.dedupeBtn.addEventListener('click', () => {
      const seen = new Set();
      const list = entries.filter((x) => {
        const key = x.toLocaleLowerCase('ru');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const removed = entries.length - list.length;
      setEntries(list);
      toast(removed ? `Убрано повторов: ${removed}` : 'Повторов нет');
    });

    // The whole wheel (canvas, pointer, hub) is one big spin button
    el.wrap.addEventListener('click', spin);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        spin();
      }
    });

    el.closeWinnerBtn.addEventListener('click', () => el.dialog.close());
    el.removeWinnerBtn.addEventListener('click', () => {
      if (pendingWinner) removeEntry(pendingWinner.index, pendingWinner.name);
      pendingWinner = null;
      el.dialog.close();
    });
    el.dialog.addEventListener('close', () => {
      pendingWinner = null;
      el.spinBtn.focus();
    });

    el.restoreBtn.addEventListener('click', () => {
      setEntries([...entries, ...state.removed]);
      toast(`Возвращено в список: ${state.removed.length}`);
      state.removed = [];
      renderResults();
      saveState();
    });
    el.clearResultsBtn.addEventListener('click', () => {
      if (!window.confirm('Очистить список результатов?')) return;
      state.results = [];
      state.removed = [];
      renderResults();
      saveState();
    });

    el.duration.addEventListener('input', () => {
      state.settings.duration = Number(el.duration.value);
      el.durationOut.textContent = `${state.settings.duration} с`;
      saveState();
    });
    el.sound.addEventListener('change', () => { state.settings.sound = el.sound.checked; saveState(); });
    el.autoRemove.addEventListener('change', () => { state.settings.autoRemove = el.autoRemove.checked; saveState(); });
    el.confettiOn.addEventListener('change', () => { state.settings.confetti = el.confettiOn.checked; saveState(); });

    el.shareBtn.addEventListener('click', shareList);
    el.fullscreenBtn.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    });
    document.addEventListener('fullscreenchange', () => {
      document.body.classList.toggle('focus', Boolean(document.fullscreenElement));
    });

    window.addEventListener('hashchange', onHashChange);
    darkScheme.addEventListener('change', () => { renderBitmap(); draw(); });
    new ResizeObserver(resize).observe(el.wrap);

    setupTabs();
    setupPwa();
    setupAppearance();
    onEntriesChanged();
    renderResults();

    // initial position: pointer in the middle of the first sector, not on a boundary
    if (entries.length) {
      rotation = -Math.PI / entries.length;
      draw();
    }
  }

  init();
})();
