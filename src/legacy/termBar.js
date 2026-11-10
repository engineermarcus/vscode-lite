const BASE = 'flex:0 0 auto;padding:7px 11px;border-radius:4px;background:var(--bg-input);border:1px solid var(--border-input);color:var(--text-bright);font:600 11px var(--font-code);min-width:26px;height:26px;';

export function buildTermBar(term, api) {
  const bar = document.createElement('div');
  bar.style.cssText = 'min-height:34px;display:flex;gap:5px;align-items:center;padding:0 5px;overflow-x:auto;overflow-y:hidden;background:var(--bg-touchbar);border-top:1px solid var(--border-color);box-sizing:border-box;scrollbar-width:none';
  const send = (d) => (term.input ? term.input(d, true) : term.paste(d));
  const btns = {};
  const mod = (term._mod = {
    ctrl: false, alt: false, shift: false,
    refresh() {
      if (btns.shift) btns.shift.style.background = mod.shift ? 'var(--accent-color)' : 'var(--bg-input)';
      if (btns.ctrl) btns.ctrl.style.background = mod.ctrl ? 'var(--accent-color)' : 'var(--bg-input)';
      if (btns.alt) btns.alt.style.background = mod.alt ? 'var(--accent-color)' : 'var(--bg-input)';
    },
  });
  const arrow = (c) => () => send('\x1b' + (term.modes && term.modes.applicationCursorKeysMode ? 'O' : '[') + c);
  const flash = (b, t) => { const o = b.textContent; b.textContent = t; setTimeout(() => (b.textContent = o), 900); };

  const defs = [
    ['Esc', () => send('\x1b')],
    ['Tab', () => send('\t')],
    ['Ctrl', () => { mod.ctrl = !mod.ctrl; mod.refresh(); }, 0, 'ctrl'],
    ['Alt', () => { mod.alt = !mod.alt; mod.refresh(); }, 0, 'alt'],
    ['Shift', () => { mod.shift = !mod.shift; mod.refresh(); }, 0, 'shift'],
    ['←', arrow('D'), 1], ['↓', arrow('B'), 1], ['↑', arrow('A'), 1], ['→', arrow('C'), 1],
    ['Home', () => send('\x1b[H')], ['End', () => send('\x1b[F')],
    ['PgUp', () => send('\x1b[5~'), 1], ['PgDn', () => send('\x1b[6~'), 1],
    ['|', () => send('|')], ['/', () => send('/')], ['-', () => send('-')], ['~', () => send('~')],
    ['^C', () => send('\x03')], ['^D', () => send('\x04')], ['^Z', () => send('\x1a')], ['^L', () => send('\x0c')],
    ['Paste', () => api.paste()],
    ['Copy', (b) => (term.hasSelection() ? api.copy() : flash(b, 'Select 1st'))],
    ['Select', (b) => { b.style.background = api.toggle(b) ? 'var(--accent-color)' : 'var(--bg-input)'; }],
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
