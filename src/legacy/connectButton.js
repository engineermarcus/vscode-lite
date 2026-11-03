import { baseReady, getBase, ensureTunnel, stopShell } from './tunnel.js';
import { getToken, getUser, whoami, login, logout } from './githubAuth.js';

const container = document.createElement('div');
container.id = 'shell-connect-container';
container.style.cssText =
  'position:fixed;left:56px;bottom:48px;z-index:99999;display:none;flex-direction:column;align-items:stretch;gap:8px;' +
  'background:var(--bg-touchbar);border:1px solid var(--border-color);border-radius:8px;padding:10px;box-shadow:0 4px 12px rgba(0,0,0,0.4);';

const btn = document.createElement('button');
btn.id = 'shell-connect-btn';
btn.style.cssText =
  'padding:6px 12px;border:0;border-radius:14px;font:12px system-ui,-apple-system,sans-serif;' +
  'color:var(--text-bright);background:var(--bg-input);cursor:pointer;outline:none;display:flex;align-items:center;gap:6px;transition:background 0.2s;';

const userBadge = document.createElement('button');
userBadge.id = 'shell-user-btn';
userBadge.title = 'GitHub Account';
userBadge.style.cssText =
  'padding:4px 8px;border:0;border-radius:12px;font:11px system-ui,-apple-system,sans-serif;' +
  'color:var(--text-bright);background:transparent;cursor:pointer;display:none;align-items:center;gap:5px;';

let hidden = false;
hidden = false;

const toggle = document.createElement('button');
toggle.id = 'shell-pill-toggle';
toggle.style.cssText =
  'width:26px;height:26px;border:0;border-radius:50%;background:#333;color:#ccc;' +
  'font:14px system-ui,sans-serif;cursor:pointer;padding:0;line-height:1;flex:none;';
toggle.onclick = () => {
  hidden = !hidden;
  try { localStorage.setItem('shell_pill_hidden', hidden ? '1' : '0'); } catch {}
  updateUI();
};

function applyHidden() {
  if (hidden) {
    btn.style.display = 'none';
    userBadge.style.display = 'none';
    toggle.textContent = '\u25CF';
    toggle.style.color = getBase().tunnel ? '#3fb950' : '#888';
    toggle.title = 'Show shell status';
  } else {
    btn.style.display = 'flex';
    toggle.textContent = '\u2013';
    toggle.style.color = '#ccc';
    toggle.title = 'Hide';
  }
}


container.appendChild(btn);
container.appendChild(userBadge);

let busy = false;
const log = (msg, level) => window.dispatchEvent(new CustomEvent('shell-log', { detail: { msg, level } }));

const setStatus = (text, bg, clickable = true) => {
  btn.textContent = text;
  if (bg) btn.style.background = bg;
  btn.disabled = !clickable;
  if (hidden && /^(Error|Timed out)/.test(text)) { hidden = false; applyHidden(); }
};

function updateUI() {
  container.style.display = (getToken() && open) ? 'flex' : 'none';
  profile.style.display = getToken() ? 'flex' : 'none';
  refreshProfile();
  const user = getUser();
  const token = getToken();

  if (user && token) {
    userBadge.style.display = 'inline-flex';
    userBadge.innerHTML = `
      ${user.avatar_url ? `<img src="${user.avatar_url}" style="width:16px;height:16px;border-radius:50%;" />` : ''}
      <span>@${user.login}</span>
    `;
    userBadge.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Signed in as @${user.login}.\n\nDo you want to sign out?`)) {
        setStatus('Stopping shell...', 'var(--bg-input)', false);
        stopShell((m) => log(m)).catch(() => {}).finally(() => logout());
      }
    };
  } else {
    userBadge.style.display = 'none';
  }

  if (getBase().tunnel) {
    setStatus('● Shell online', '#1f7a3a');
  } else if (!token) {
    setStatus('Sign in with GitHub', '#0e639c');
  } else {
    setStatus('○ Connect shell', 'var(--bg-input)');
  }
  applyHidden();
}

btn.onclick = async () => {
  if (busy) return;
  busy = true;
  setStatus('Connecting...', 'var(--bg-input)', false);

  try {
    if (!getToken()) {
      await login('Sign in with GitHub to start your private cloud shell.');
      updateUI();
    }
    const ok = await ensureTunnel((msg) => log(msg));
    if (ok) log('Shell online. Connecting terminal...', 'ok');
    if (ok) {
      window.dispatchEvent(new Event('tunnel-ready'));
      busy = false;
      updateUI();
      return;
    }
    log('Timed out waiting for the shell. Tap Retry.', 'error');
    setStatus('Timed out · Retry', '#a33');
  } catch (e) {
    console.error('[tunnel] connect error:', e);
    log(e.message || 'failed', 'error');
    setStatus('Error · Retry', '#a33');
  }
  busy = false;
  btn.disabled = false;
};

let open = false;
const profile = document.createElement('div');
profile.id = 'btn-profile';
profile.className = 'activity-item';
profile.title = 'Account & shell';
profile.style.cssText = 'position:relative;display:none;';
const avatar = document.createElement('span');
avatar.style.cssText = 'display:flex;align-items:center;justify-content:center;';
const dot = document.createElement('span');
dot.style.cssText = 'position:absolute;right:9px;bottom:9px;width:9px;height:9px;border-radius:50%;border:2px solid var(--bg-touchbar);background:#888;';
profile.appendChild(avatar);
profile.appendChild(dot);
profile.onclick = (e) => { e.stopPropagation(); open = !open; updateUI(); };
document.addEventListener('click', (e) => {
  if (open && !container.contains(e.target)) { open = false; updateUI(); }
});
function refreshProfile() {
  const u = getUser();
  avatar.innerHTML = u && u.avatar_url
    ? `<img src="${u.avatar_url}" style="width:24px;height:24px;border-radius:50%;" />`
    : '<i class="codicon codicon-account"></i>';
  dot.style.background = getBase().tunnel ? '#3fb950' : '#888';
}
function mountProfile() {
  const gear = document.getElementById('btn-settings');
  if (!gear) return false;
  gear.parentNode.insertBefore(profile, gear);
  document.body.appendChild(container);
  return true;
}
if (!mountProfile()) {
  const t = setInterval(() => { if (mountProfile()) clearInterval(t); }, 200);
}
setStatus('...', 'var(--bg-input)', false);

// Check current user if token exists
if (getToken()) {
  whoami().catch(() => {}).finally(() => {
    updateUI();
  });
}

baseReady.then(() => {
  updateUI();
  if (getBase().tunnel) window.dispatchEvent(new Event('tunnel-ready'));
});

// Hard gate: the app is unusable without a GitHub sign-in
let gating = false;
async function enforceLogin() {
  if (gating || getToken()) return;
  gating = true;
  try {
    await login('', { required: true });
  } catch {}
  gating = false;
  updateUI();
  if (getToken() && !getBase().tunnel) btn.click();
}

window.addEventListener('github-auth-change', () => {
  updateUI();
  enforceLogin();
});

enforceLogin();

window.addEventListener('tunnel-lost', () => { busy = false; updateUI(); });
