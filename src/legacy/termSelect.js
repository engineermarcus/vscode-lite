const WORD = /[^\s"'`()<>|;,]/;

export function attachTermSelect(term, host) {
  let timer = null, active = false, sx = 0, sy = 0, a0 = 0, a1 = 0, bar = null;

  term.options.theme = {
    ...term.options.theme,
    selectionBackground: 'rgba(56,139,253,0.55)',
    selectionInactiveBackground: 'rgba(56,139,253,0.35)',
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

  async function copy() {
    const t = term.getSelection();
    if (!t.trim()) return hide();
    try { await navigator.clipboard.writeText(t); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = t; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    term.clearSelection(); hide();
  }
  async function paste() {
    let t = '';
    try { t = await navigator.clipboard.readText(); }
    catch { t = window.prompt('Paste here') || ''; }
    if (t) term.paste(t);
    term.clearSelection(); hide();
  }
  function show() {
    if (!bar) {
      bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;z-index:99999;display:flex;gap:6px;padding:6px;background:#1f2430;border:1px solid #444;border-radius:10px;box-shadow:0 4px 14px #0008;font:600 13px sans-serif';
      [['Copy', copy], ['Paste', paste], ['All', () => term.selectAll()], ['✕', () => { term.clearSelection(); hide(); }]]
        .forEach(([l, f]) => {
          const b = document.createElement('button');
          b.textContent = l;
          b.style.cssText = 'padding:9px 13px;border:0;border-radius:8px;background:#3b4252;color:#fff';
          b.addEventListener('pointerdown', e => e.preventDefault());
          b.addEventListener('click', f);
          bar.appendChild(b);
        });
      document.body.appendChild(bar);
    }
    const r = host.getBoundingClientRect();
    bar.style.top = (r.top + 8) + 'px';
    bar.style.right = '8px';
    bar.style.display = 'flex';
  }
  function hide() { if (bar) bar.style.display = 'none'; }

  term.onSelectionChange(() => (term.hasSelection() ? show() : hide()));

  host.addEventListener('touchstart', (e) => {
    clearTimeout(timer);
    if (e.touches.length !== 1) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; active = false;
    timer = setTimeout(() => {
      active = true;
      [a0, a1] = word(idx(sx, sy));
      sel(a0, a1);
      if (navigator.vibrate) navigator.vibrate(15);
    }, 450);
  }, { capture: true, passive: true });

  host.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (!active) {
      if (Math.hypot(t.clientX - sx, t.clientY - sy) > 10) clearTimeout(timer);
      return;
    }
    e.preventDefault(); e.stopPropagation();
    const r = screen();
    if (t.clientY < r.top + 24) term.scrollLines(-1);
    else if (t.clientY > r.bottom - 24) term.scrollLines(1);
    const p = idx(t.clientX, t.clientY);
    sel(Math.min(a0, p), Math.max(a1, p));
  }, { capture: true, passive: false });

  host.addEventListener('touchend', (e) => {
    clearTimeout(timer);
    if (active) { e.stopPropagation(); active = false; return; }
    if (term.hasSelection()) { term.clearSelection(); hide(); }
  }, { capture: true });
}
