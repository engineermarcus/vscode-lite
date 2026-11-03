const WORD = /[^\s"'`()<>|;,]/;

export function attachTermSelect(term, host) {
  let mode = false, timer = null, drag = false, longp = false;
  let sx = 0, sy = 0, lx = 0, ly = 0, anchor = 0, a0 = 0, a1 = 0, edge = null, bar = null;

  term.options.theme = {
    ...term.options.theme,
    selectionBackground: 'rgba(56,139,253,0.55)',
    selectionInactiveBackground: 'rgba(56,139,253,0.4)',
  };

  const screen = () => term.element.querySelector('.xterm-screen').getBoundingClientRect();
  const idx = (x, y) => {
    const r = screen(), w = r.width / term.cols, h = r.height / term.rows;
    const col = Math.max(0, Math.min(term.cols - 1, Math.floor((x - r.left) / w)));
    const row = Math.max(0, Math.min(term.rows - 1, Math.floor((y - r.top) / h)));
    return (row + term.buffer.active.viewportY) * term.cols + col;
  };
  const sel = (s, e) => term.select(s % term.cols, Math.floor(s / term.cols), e - s + 1);
  const word = (i) => {
    const row = Math.floor(i / term.cols), col = i % term.cols;
    const ln = term.buffer.active.getLine(row);
    if (!ln) return [i, i];
    const t = ln.translateToString(false);
    if (!WORD.test(t[col] || ' ')) return [i, i];
    let a = col, b = col;
    while (a > 0 && WORD.test(t[a - 1])) a--;
    while (b < t.length - 1 && WORD.test(t[b + 1])) b++;
    return [row * term.cols + a, row * term.cols + b];
  };
  const allText = () => {
    const b = term.buffer.active, L = [];
    for (let i = 0; i < b.length; i++) {
      const l = b.getLine(i); if (!l) continue;
      const t = l.translateToString(true);
      if (l.isWrapped && L.length) L[L.length - 1] += t; else L.push(t);
    }
    while (L.length && !L[L.length - 1].trim()) L.pop();
    return L.join('\n');
  };
  const toClip = async (t) => {
    try { await navigator.clipboard.writeText(t); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = t; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
  };
  const flash = (btn, txt) => { const o = btn.textContent; btn.textContent = txt; setTimeout(() => (btn.textContent = o), 900); };

  async function copySel() { const t = term.getSelection(); if (t.trim()) await toClip(t); term.clearSelection(); hide(); }
  async function paste() {
    let t = '';
    try { t = await navigator.clipboard.readText(); } catch { t = window.prompt('Paste here') || ''; }
    if (t) term.paste(t);
    term.clearSelection(); hide();
  }

  const mk = (l, f, st) => {
    const b = document.createElement('button');
    b.textContent = l;
    b.style.cssText = 'padding:9px 13px;border:0;border-radius:8px;background:#3b4252;color:#fff;font:600 13px sans-serif;' + (st || '');
    b.addEventListener('pointerdown', e => e.preventDefault());
    b.addEventListener('click', () => f(b));
    return b;
  };

  // floating pill inside the terminal: Select toggle + Copy all
  host.style.position = 'relative';
  const pill = document.createElement('div');
  pill.style.cssText = 'position:absolute;right:8px;bottom:8px;z-index:50;display:flex;gap:6px;opacity:.92';
  const modeBtn = mk('Select', () => {
    mode = !mode;
    modeBtn.style.background = mode ? '#2563eb' : '#3b4252';
    modeBtn.textContent = mode ? 'Selecting…' : 'Select';
    if (!mode) { term.clearSelection(); hide(); }
  });
  const allBtn = mk('Copy all', async (b) => { await toClip(allText()); flash(b, 'Copied ✓'); });
  pill.append(modeBtn, allBtn);
  host.appendChild(pill);

  function show() {
    if (!bar) {
      bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;z-index:99999;display:flex;gap:6px;padding:6px;background:#1f2430;border:1px solid #444;border-radius:10px;box-shadow:0 4px 14px #0008';
      [['Copy', copySel], ['Paste', paste], ['All', () => term.selectAll()], ['✕', () => { term.clearSelection(); hide(); }]]
        .forEach(([l, f]) => bar.appendChild(mk(l, f)));
      document.body.appendChild(bar);
    }
    const r = host.getBoundingClientRect();
    bar.style.top = (r.top + 8) + 'px';
    bar.style.right = '8px';
    bar.style.display = 'flex';
  }
  function hide() { if (bar) bar.style.display = 'none'; }
  term.onSelectionChange(() => (term.hasSelection() ? show() : hide()));

  const upd = () => { const p = idx(lx, ly); sel(Math.min(anchor, p), Math.max(anchor, p)); };
  const stopEdge = () => { clearInterval(edge); edge = null; };
  const startEdge = () => {
    stopEdge();
    edge = setInterval(() => {
      const r = screen();
      if (ly < r.top + 30) term.scrollLines(-2);
      else if (ly > r.bottom - 30) term.scrollLines(2);
      else return;
      upd();
    }, 60);
  };

  host.addEventListener('touchstart', (e) => {
    if (e.target.closest && pill.contains(e.target)) return;
    clearTimeout(timer);
    if (e.touches.length !== 1) return;
    sx = lx = e.touches[0].clientX; sy = ly = e.touches[0].clientY;
    drag = false; longp = false;
    if (mode) {
      anchor = idx(sx, sy);
      e.stopPropagation();
    } else {
      timer = setTimeout(() => {
        longp = true;
        [a0, a1] = word(idx(sx, sy));
        sel(a0, a1);
        if (navigator.vibrate) navigator.vibrate(15);
        startEdge();
      }, 400);
    }
  }, { capture: true, passive: false });

  host.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    lx = t.clientX; ly = t.clientY;
    if (mode) {
      e.preventDefault(); e.stopPropagation();
      if (!drag && Math.hypot(lx - sx, ly - sy) < 4) return;
      if (!drag) { drag = true; startEdge(); }
      upd();
      return;
    }
    if (!longp) {
      if (Math.hypot(lx - sx, ly - sy) > 10) clearTimeout(timer);
      return;
    }
    e.preventDefault(); e.stopPropagation();
    const p = idx(lx, ly);
    sel(Math.min(a0, p), Math.max(a1, p));
  }, { capture: true, passive: false });

  host.addEventListener('touchend', (e) => {
    clearTimeout(timer); stopEdge();
    if (mode) {
      e.stopPropagation();
      if (!drag && term.hasSelection()) { term.clearSelection(); hide(); }
      drag = false; return;
    }
    if (longp) { e.stopPropagation(); longp = false; return; }
    if (term.hasSelection()) { term.clearSelection(); hide(); }
  }, { capture: true });
}
