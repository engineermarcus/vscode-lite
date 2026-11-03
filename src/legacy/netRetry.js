const HOSTS = /(^|\.)(github\.com|githubusercontent\.com|trycloudflare\.com)$/i;
const TRIES = 6, TIMEOUT = 10000, BASE = 500, CAP = 8000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function waitOnline(max) {
  if (navigator.onLine !== false) return Promise.resolve();
  return new Promise(res => {
    const done = () => { window.removeEventListener('online', done); clearTimeout(t); res(); };
    const t = setTimeout(done, max);
    window.addEventListener('online', done);
  });
}

if (!window.__netRetry) {
  window.__netRetry = true;
  const _fetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    let url;
    try { url = new URL(typeof input === 'string' ? input : input.url, location.href); } catch { return _fetch(input, init); }
    const method = (init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
    if (!HOSTS.test(url.hostname) || (method !== 'GET' && method !== 'HEAD')) return _fetch(input, init);

    const outer = init.signal;
    let lastErr;
    for (let i = 0; i < TRIES; i++) {
      if (outer && outer.aborted) throw new DOMException('Aborted', 'AbortError');
      await waitOnline(30000);
      const ac = new AbortController();
      const onAbort = () => ac.abort();
      if (outer) outer.addEventListener('abort', onAbort, { once: true });
      const t = setTimeout(() => ac.abort(), TIMEOUT);
      try {
        const r = await _fetch(input, { ...init, signal: ac.signal });
        if (r.status < 500 && r.status !== 429) return r;
        lastErr = new Error('HTTP ' + r.status);
        if (i === TRIES - 1) return r;
      } catch (e) {
        if (outer && outer.aborted) throw e;
        lastErr = e;
      } finally {
        clearTimeout(t);
        if (outer) outer.removeEventListener('abort', onAbort);
      }
      await sleep(Math.min(CAP, BASE * 2 ** i) * (0.5 + Math.random()));
    }
    throw lastErr;
  };
}
