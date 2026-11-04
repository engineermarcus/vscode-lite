import './netRetry.js';
import { getToken, getUser, whoami, login } from './githubAuth.js';

const UPSTREAM_OWNER = 'engineermarcus';
const REPO = 'vscode-lite';
const WS_REPO = 'vscode-lite-workspace';
const WF = 'backend.yml';
const RE = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/;

const state = { key: '', http: '', ws: '', tunnel: false, owner: UPSTREAM_OWNER, repo: REPO };
let pendingKey = '';
const _fetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || '';
  if (state.key && state.http && url.startsWith(state.http)) {
    init = { ...init, headers: { ...Object.fromEntries(new Headers(init.headers || {})), 'x-session-key': state.key } };
  }
  return _fetch(input, init);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function getTargetRepo() {
  const user = getUser();
  const owner = user?.login || '';
  return { owner, repo: REPO };
}

async function alive(u, k = pendingKey) {
  if (!u || !RE.test(u)) return false;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 4000);
  try {
    const r = await fetch(u + '/api/workspace', { signal: c.signal, cache: 'no-store', headers: { 'x-session-key': k } });
    // Must return 200 OK without requiring an APP_TOKEN or returning 401
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function ghFetch(path, init = {}, owner = null, repo = null) {
  const target = owner || getTargetRepo().owner;
  const targetRepo = repo || REPO;
  const token = getToken();
  return fetch(`https://api.github.com/repos/${target}/${targetRepo}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...((init && init.headers) || {}),
    },
  });
}

/**
 * Checks for published tunnel URL from:
 * 1. The repo's 'tunnel' branch (raw.githubusercontent.com)
 * 2. The repo's 'tunnel' branch via GitHub API (for private repos)
 * 3. Fallback gist (for upstream owner)
 */
async function cachedTunnel(owner) {
  try {
    const c = JSON.parse(localStorage.getItem('tun_cache') || 'null');
    if (!c || c.owner !== owner || !RE.test(c.u) || !/^[a-f0-9]{48}$/.test(c.k) || Date.now() - c.ts > 5 * 3600e3) return null;
    const ok = await Promise.race([alive(c.u, c.k), new Promise(r => setTimeout(() => r(false), 6000))]);
    if (!ok) return null;
    pendingKey = c.k;
    return c.u;
  } catch { return null; }
}

async function fetchTunnelUrl(owner) {
  pendingKey = '';
  const cached = await cachedTunnel(owner);
  if (cached) return cached;
  if (!owner || !getToken()) return null;
  try {
    const r = await ghFetch('/contents/tunnel.json?ref=tunnel&t=' + Date.now(), { cache: 'no-store' }, owner, WS_REPO);
    if (!r.ok) return null;
    const j = await r.json();
    const t = JSON.parse(atob(String(j.content || '').replace(/\s+/g, '')));
    const u = String(t.url || '').replace(/\/$/, '');
    if (!RE.test(u) || !/^[a-f0-9]{48}$/.test(String(t.key || ''))) return null;
    pendingKey = t.key;
    return u;
  } catch {
    return null;
  }
}

const hdr = () => ({
  Authorization: 'Bearer ' + getToken(),
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
});

async function ensureWorkspaceRepo(owner, onProgress) {
  onProgress('Checking your private workspace...');
  const r = await fetch(`https://api.github.com/repos/${owner}/${WS_REPO}`, { headers: hdr() });
  if (r.ok) {
    const info = await r.json().catch(() => ({}));
    if (!info.private) throw new Error(WS_REPO + ' exists but is public. Make it private or delete it, then retry.');
    return;
  }
  if (r.status !== 404) throw new Error('Workspace check failed (' + r.status + ')');
  onProgress('Creating private workspace repo...');
  const c = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: hdr(),
    body: JSON.stringify({ name: WS_REPO, private: true, auto_init: true }),
  });
  if (!c.ok) throw new Error('Could not create private workspace (' + c.status + ')');
}

async function syncSecret(owner) {
  const base = `https://api.github.com/repos/${owner}/${REPO}/actions/secrets`;
  const k = await (await fetch(base + '/public-key', { headers: hdr() })).json();
  if (!k.key) throw new Error('Could not read fork public key');
  const { default: sodium } = await import('libsodium-wrappers');
  await sodium.ready;
  const V = sodium.base64_variants.ORIGINAL;
  const box = sodium.crypto_box_seal(sodium.from_string(getToken()), sodium.from_base64(k.key, V));
  const r = await fetch(base + '/WS_TOKEN', {
    method: 'PUT',
    headers: hdr(),
    body: JSON.stringify({ encrypted_value: sodium.to_base64(box, V), key_id: k.key_id }),
  });
  if (!r.ok) throw new Error('Could not store workspace token (' + r.status + ')');
}

let mon = null;
const emit = (msg, level) => window.dispatchEvent(new CustomEvent('shell-log', { detail: { msg, level } }));

function startMonitor() {
  clearInterval(mon);
  let miss = 0;
  let last = 'OK';
  mon = setInterval(async () => {
    if (!state.tunnel) return clearInterval(mon);
    if (!(await alive(state.http, state.key))) {
      if (++miss < 3) return;
      clearInterval(mon);
      state.http = '';
      state.ws = '';
      state.tunnel = false;
      state.key = '';
      emit('Shell stopped (runner ended or 5h limit). Tap Connect shell.', 'error');
      window.dispatchEvent(new Event('tunnel-lost'));
      return;
    }
    miss = 0;
    try {
      const j = await (await fetch(state.http + '/api/sync-status', { cache: 'no-store' })).json();
      const st = String(j.status || 'OK');
      if (st !== last) {
        if (st.startsWith('FAIL')) emit('Autosave failed: ' + st.slice(5), 'error');
        else if (last.startsWith('FAIL')) emit('Autosave recovered.', 'ok');
        last = st;
      }
    } catch {}
  }, 30000);
}

function apply(u, owner = UPSTREAM_OWNER) {
  state.http = u;
  state.key = pendingKey;
  try { localStorage.setItem('tun_cache', JSON.stringify({ u, k: pendingKey, owner, ts: Date.now() })); } catch {}
  startMonitor();
  state.ws = u.replace(/^https:/, 'wss:');
  state.tunnel = true;
  state.owner = owner;
  state.repo = REPO;
}

export const baseReady = (async () => {
  const { owner, repo } = getTargetRepo();
  const u = await fetchTunnelUrl(owner, repo);
  if (u && (await alive(u))) {
    apply(u, owner);
    console.log('[tunnel] using', u);
  } else {
    console.log('[tunnel] shell offline');
  }
  return state;
})();

export const getBase = () => state;

async function runActive(owner, repo) {
  try {
    const r = await ghFetch('/actions/workflows/' + WF + '/runs?per_page=1', {}, owner, repo);
    if (!r.ok) return false;
    const j = await r.json();
    const s = j.workflow_runs?.[0]?.status;
    return ['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(s);
  } catch {
    return false;
  }
}

/**
 * Ensures the user has a fork of vscode-lite in their own GitHub account.
 * If not present, forks the upstream repo.
 */
async function ensureFork(userLogin, onProgress) {
  if (userLogin.toLowerCase() === UPSTREAM_OWNER.toLowerCase()) {
    return true;
  }

  const H = {
    Authorization: 'Bearer ' + getToken(),
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
  const repoUrl = `https://api.github.com/repos/${userLogin}/${REPO}`;

  onProgress('Checking repository in your account...');
  const check = await fetch(repoUrl, { headers: H });
  if (check.ok) {
    return true;
  }

  onProgress(`Forking ${UPSTREAM_OWNER}/${REPO} to your account...`);
  const forkRes = await fetch(`https://api.github.com/repos/${UPSTREAM_OWNER}/${REPO}/forks`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ default_branch_only: true }),
  });
  if (!forkRes.ok && forkRes.status !== 202) {
    const err = await forkRes.json().catch(() => ({}));
    throw new Error('Fork failed (' + forkRes.status + '): ' + (err.message || 'unknown error'));
  }

  let ready = false;
  for (let i = 1; i <= 45; i++) {
    onProgress(`Creating fork (${i * 2}s)...`);
    await sleep(2000);
    const r = await fetch(repoUrl, { headers: H });
    if (r.ok) { ready = true; break; }
  }
  if (!ready) throw new Error('Fork is taking too long. Wait a minute and tap Connect again.');

  try {
    await fetch(repoUrl + '/actions/permissions', {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({ enabled: true }),
    });
  } catch {}
  return true;
}

async function dispatchWorkflow(owner, repo, onProgress) {
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const H = {
    Authorization: 'Bearer ' + getToken(),
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };

  // Fresh forks list their workflows late and start with them disabled
  for (let i = 1; i <= 10; i++) {
    const w = await fetch(`${base}/actions/workflows/${WF}`, { headers: H });
    if (w.ok) {
      const j = await w.json().catch(() => ({}));
      if (j.state && j.state !== 'active') {
        onProgress('Enabling workflow...');
        await fetch(`${base}/actions/workflows/${WF}/enable`, { method: 'PUT', headers: H });
      }
      break;
    }
    onProgress(`Waiting for workflow to appear (${i * 3}s)...`);
    await sleep(3000);
  }

  let last = 'Workflow dispatch failed';
  for (let i = 1; i <= 6; i++) {
    onProgress('Dispatching backend workflow in ' + owner + '/' + repo + '...');
    const r = await fetch(`${base}/actions/workflows/${WF}/dispatches`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ ref: 'main' }),
    });
    if (r.status === 204) return;
    const err = await r.json().catch(() => ({}));
    last = 'Workflow dispatch failed (' + r.status + '): ' + (err.message || 'unknown error');
    if (r.status !== 404 && r.status !== 422) break;
    await sleep(4000);
  }
  throw new Error(last);
}

const GH = 'https://api.github.com';
const WF_BLOB = 'e575bcf4d03b260c9a59c3862633e1b193eb5e28';

async function activeRuns(owner) {
  const r = await fetch(`${GH}/repos/${owner}/${REPO}/actions/workflows/${WF}/runs?per_page=20`, { headers: hdr(), cache: 'no-store' });
  if (!r.ok) return [];
  return ((await r.json()).workflow_runs || []).filter((x) => x.status !== 'completed');
}

async function cancelRuns(owner) {
  for (const x of await activeRuns(owner)) {
    await fetch(`${GH}/repos/${owner}/${REPO}/actions/runs/${x.id}/cancel`, { method: 'POST', headers: hdr() });
  }
  for (let i = 0; i < 20; i++) {
    if (!(await activeRuns(owner)).length) return;
    await sleep(3000);
  }
}

async function dropBranch(owner, b) {
  const r = await fetch(`${GH}/repos/${owner}/${REPO}/git/refs/heads/${b}`, { method: 'DELETE', headers: hdr() });
  return r.status === 204;
}

async function dropSecret(owner) {
  try {
    await fetch(`${GH}/repos/${owner}/${REPO}/actions/secrets/WS_TOKEN`, { method: 'DELETE', headers: hdr() });
  } catch {}
}

async function stopLegacy(owner, onProgress) {
  const r = await fetch(`${GH}/repos/${owner}/${REPO}/branches/tunnel`, { headers: hdr() });
  if (!r.ok) return;
  onProgress('Old public shell found. Stopping it...');
  await cancelRuns(owner);
  await dropBranch(owner, 'tunnel');
  onProgress('Removed old public tunnel branch.');
}

async function dropLegacyWorkspace(owner, onProgress) {
  const b = await fetch(`${GH}/repos/${owner}/${REPO}/branches/workspace`, { headers: hdr() });
  if (!b.ok) return;
  const sha = (await b.json()).commit?.sha;
  const c = sha && (await fetch(`${GH}/repos/${owner}/${WS_REPO}/commits/${sha}`, { headers: hdr() }));
  if (c && c.ok && (await dropBranch(owner, 'workspace'))) {
    onProgress('Removed old public workspace branch (copied to your private repo).');
  } else {
    onProgress('Old public workspace branch still exists. Copy what you need, then delete it.');
  }
}

async function verifyWorkflow(owner, onProgress) {
  const url = `${GH}/repos/${owner}/${REPO}/contents/.github/workflows/${WF}?ref=main`;
  const blob = async () => {
    const r = await fetch(url, { headers: hdr(), cache: 'no-store' });
    return r.ok ? (await r.json()).sha : '';
  };
  onProgress('Verifying workflow integrity...');
  if ((await blob()) === WF_BLOB) return;
  if (owner.toLowerCase() !== UPSTREAM_OWNER.toLowerCase()) {
    onProgress('Updating your fork to the reviewed workflow...');
    await fetch(`${GH}/repos/${owner}/${REPO}/merge-upstream`, {
      method: 'POST',
      headers: hdr(),
      body: JSON.stringify({ branch: 'main' }),
    }).catch(() => {});
    await sleep(2000);
    if ((await blob()) === WF_BLOB) return;
  }
  throw new Error('Workflow in ' + owner + '/' + REPO + ' does not match the reviewed version. Your token was not sent.');
}

export async function stopShell(onProgress = () => {}) {
  const owner = getUser()?.login;
  if (!owner || !getToken()) return;
  onProgress('Stopping shell...');
  await dropSecret(owner);
  await cancelRuns(owner).catch(() => {});
  try {
    const r = await fetch(`${GH}/repos/${owner}/${WS_REPO}/keys?per_page=100`, { headers: hdr() });
    if (r.ok) {
      for (const k of await r.json()) {
        if (k.title === 'vscode-lite-runner') {
          await fetch(`${GH}/repos/${owner}/${WS_REPO}/keys/${k.id}`, { method: 'DELETE', headers: hdr() });
        }
      }
    }
  } catch {}
  clearInterval(mon);
  state.http = '';
  state.ws = '';
  state.tunnel = false;
  state.key = '';
  onProgress('Shell stopped.');
}

export async function ensureTunnel(onProgress) {
  onProgress('Checking existing tunnel...');
  let { owner, repo } = getTargetRepo();
  let u = await fetchTunnelUrl(owner, repo);
  if (u && (await alive(u))) {
    apply(u, owner);
    return true;
  }

  // Ensure user is authenticated
  if (!getToken()) {
    onProgress('Authentication required...');
    await login('Sign in with GitHub to start your private cloud shell.');
  }

  const user = await whoami();
  if (!user?.login) {
    throw new Error('Unable to verify GitHub account.');
  }
  owner = user.login;

  // Make sure repository exists in the user's account
  await ensureFork(owner, onProgress);
  await verifyWorkflow(owner, onProgress);
  await stopLegacy(owner, onProgress);
  await ensureWorkspaceRepo(owner, onProgress);
  onProgress('Storing workspace token...');
  await syncSecret(owner);
  onProgress('Workspace ready.');

  // Check if CI is already starting or running
  if (await runActive(owner, repo)) {
    onProgress('CI already starting on ' + owner + '...');
  } else {
    await dispatchWorkflow(owner, repo, onProgress);
  }

  // Poll until tunnel URL is published and alive
  for (let i = 1; i <= 60; i++) {
    onProgress(`Starting cloud shell... (${i * 3}s)`);
    await sleep(3000);
    u = await fetchTunnelUrl(owner, repo);
    if (u && (await alive(u))) {
      await dropSecret(owner);
      await dropLegacyWorkspace(owner, onProgress);
      apply(u, owner);
      return true;
    }
  }

  return false;
}

window.addEventListener('github-auth-change', () => {
  if (!getToken()) { state.http = ''; state.ws = ''; state.tunnel = false; state.owner = ''; state.key = ''; clearInterval(mon); }
});
