const BASE = 'flex:0 0 auto;padding:7px 11px;border:0;border-radius:7px;background:#3b4252;color:#fff;font:600 13px monospace;min-width:38px;';

export function buildTermBar(term, api) {
  const bar = document.createElement('div');
  bar.style.cssText = 'height:40px;display:flex;gap:5px;align-items:center;padding:0 5px;overflow-x:auto;overflow-y:hidden;background:#161a23;border-top:1px solid #2b3040;box-sizing:border-box;scrollbar-width:none';
  const send = (d) => (term.input ? term.input(d, true) : term.paste(d));
  const btns = {};
  const mod = (term._mod = {
    ctrl: false, alt: false,
    refresh() {
      if (btns.ctrl) btns.ctrl.style.background = mod.ctrl ? '#2563eb' : '#3b4252';
      if (btns.alt) btns.alt.style.background = mod.alt ? '#2563eb' : '#3b4252';
    },
  });
  const arrow = (c) => () => send('\x1b' + (term.modes && term.modes.applicationCursorKeysMode ? 'O' : '[') + c);
  const flash = (b, t) => { const o = b.textContent; b.textContent = t; setTimeout(() => (b.textContent = o), 900); };

  const defs = [
    ['Esc', () => send('\x1b')],
    ['Tab', () => send('\t')],
    ['Ctrl', () => { mod.ctrl = !mod.ctrl; mod.refresh(); }, 0, 'ctrl'],
    ['Alt', () => { mod.alt = !mod.alt; mod.refresh(); }, 0, 'alt'],
    ['←', arrow('D'), 1], ['↓', arrow('B'), 1], ['↑', arrow('A'), 1], ['→', arrow('C'), 1],
    ['Home', () => send('\x1b[H')], ['End', () => send('\x1b[F')],
    ['PgUp', () => send('\x1b[5~'), 1], ['PgDn', () => send('\x1b[6~'), 1],
    ['|', () => send('|')], ['/', () => send('/')], ['-', () => send('-')], ['~', () => send('~')],
    ['^C', () => send('\x03')], ['^D', () => send('\x04')], ['^Z', () => send('\x1a')], ['^L', () => send('\x0c')],
    ['Paste', () => api.paste()],
    ['Copy', (b) => (term.hasSelection() ? api.copy() : flash(b, 'Select 1st'))],
    ['Select', (b) => { b.style.background = api.toggle(b) ? '#2563eb' : '#3b4252'; }],
    ['All', async (b) => { await api.copyAll(); flash(b, 'Copied ✓'); }],
    ['Clear', () => term.clear()],
  ];

  defs.forEach(([label, fn, rep, name]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = BASE;
    if (name) btns[name] = b;
    let t = null, iv = null, did = false;
    const stop = () => { clearTimeout(t); clearInterval(iv); };
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); did = false;
      if (rep) t = setTimeout(() => { did = true; iv = setInterval(() => fn(b), 70); }, 400);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => b.addEventListener(ev, stop));
    b.addEventListener('click', () => { if (did) { did = false; return; } fn(b); });
    bar.appendChild(b);
  });
  return bar;
}
