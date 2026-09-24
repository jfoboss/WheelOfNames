'use strict';

(() => {
  const TAU = Math.PI * 2;
  const STORAGE_KEY = 'wheel-of-names:v1';
  const PALETTE = ['#2F5DE0', '#FFC21A', '#E4572E', '#16A08F', '#7B4FD8', '#F08A24'];
  const DEFAULT_TITLE = 'Колесо имён';
  const DEFAULT_TEXT = ['Аня', 'Борис', 'Вика', 'Гриша', 'Дина', 'Егор', 'Женя', 'Зоя'].join('\n');
  const DEFAULT_SETTINGS = { duration: 6, sound: true, autoRemove: false, confetti: true };

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
    let c = i % PALETTE.length;
    // the last sector must not share its color with the first one
    if (n > 1 && i === n - 1 && c === 0) c = 2;
    return PALETTE[c];
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
    const ctx = bitmap.getContext('2d');
    ctx.clearRect(0, 0, S, S);

    const c = S / 2;
    const rim = Math.max(3, S * 0.008);
    const R = c - rim;
    const n = entries.length;
    const surface = cssVar('--surface') || '#FFFFFF';
    const fontFamily = getComputedStyle(document.body).fontFamily;

    ctx.beginPath();
    ctx.arc(c, c, c, 0, TAU);
    ctx.fillStyle = surface;
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
      return;
    }

    const seg = TAU / n;
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, R, i * seg, (i + 1) * seg);
      ctx.closePath();
      ctx.fillStyle = segmentColor(i, n);
      ctx.fill();
    }

    if (n > 1 && n <= 400) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(1, dpr);
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.lineTo(c + R * Math.cos(i * seg), c + R * Math.sin(i * seg));
        ctx.stroke();
      }
    }

    // Labels: radial, aligned to the outer edge
    const inner = R * 0.26;
    const outerPad = R * 0.1; // room for the pointer
    const maxWidth = R - inner - outerPad;
    const fontPx = n === 1 ? R * 0.1 : Math.min(R * 0.085, seg * R * 0.6);
    if (fontPx < 7 * dpr) return; // too many sectors, text would be unreadable
    ctx.font = `600 ${fontPx}px ${fontFamily}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate((i + 0.5) * seg);
      ctx.fillStyle = textColorFor(segmentColor(i, n));
      ctx.fillText(fitText(ctx, entries[i], maxWidth), R - outerPad, 0);
      ctx.restore();
    }
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
      const colors = [color, ...PALETTE];
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
    const code = toBase64Url(JSON.stringify({ t: state.title, e: entries }));
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
    onEntriesChanged();
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

    el.spinBtn.addEventListener('click', spin);
    el.wheel.addEventListener('click', spin);
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
