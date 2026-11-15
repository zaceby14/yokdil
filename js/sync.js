// GitHub Gist senkronu. Token yalnızca bu cihazın localStorage'ında.
import * as store from './store.js';
import { mergeState, sameState } from './merge.js';

const API = 'https://api.github.com';
const FILE = 'yokdil-sync.json';
const TK = 'yokdil.token', GK = 'yokdil.gistId', SK = 'yokdil.syncInfo';

export const status = { state: 'off', at: null, msg: '' };
const listeners = new Set();
export const onStatus = f => (listeners.add(f), () => listeners.delete(f));

function setStatus(state, msg = '') {
  status.state = state; status.msg = msg;
  if (state === 'ok') { status.at = Date.now(); localStorage.setItem(SK, JSON.stringify({ at: status.at })); }
  for (const f of listeners) f(status);
}

export const getToken = () => localStorage.getItem(TK) || '';
export function setToken(t) {
  t = (t || '').trim();
  if (t) localStorage.setItem(TK, t); else { localStorage.removeItem(TK); localStorage.removeItem(GK); }
  setStatus(t ? 'idle' : 'off');
}

async function gh(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { Authorization: 'token ' + getToken(), Accept: 'application/vnd.github+json', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) }
  });
  if (r.status === 401) throw new Error('Token geçersiz');
  if (r.status === 403) throw new Error('Yetki yok / limit');
  if (!r.ok) throw new Error('GitHub ' + r.status);
  return r.json();
}

async function findGist() {
  let id = localStorage.getItem(GK);
  if (id) return id;
  for (let page = 1; page <= 5; page++) {
    const list = await gh(`/gists?per_page=100&page=${page}`);
    const g = list.find(x => x.files && x.files[FILE]);
    if (g) { localStorage.setItem(GK, g.id); return g.id; }
    if (list.length < 100) break;
  }
  const g = await gh('/gists', { method: 'POST', body: JSON.stringify({ description: 'YÖKDİL Fen senkron', public: false, files: { [FILE]: { content: JSON.stringify(payload()) } } }) });
  localStorage.setItem(GK, g.id);
  return g.id;
}

function payload() { return { v: 1, savedAt: Date.now(), data: store.snapshot() }; }

async function readRemote(id) {
  const g = await gh('/gists/' + id);
  const f = g.files?.[FILE];
  if (!f) return {};
  let text = f.content;
  if (f.truncated && f.raw_url) text = await (await fetch(f.raw_url)).text();
  try { return JSON.parse(text).data || {}; } catch { return {}; }
}

let busy = false, again = false;

// Çek + birleştir + gerekirse gönder
export async function syncNow() {
  if (!getToken()) { setStatus('off'); return; }
  if (!navigator.onLine) { setStatus('error', 'Çevrimdışı'); return; }
  if (busy) { again = true; return; }
  busy = true; setStatus('syncing');
  try {
    let id = await findGist();
    let remote;
    try { remote = await readRemote(id); }
    catch (e) { // gist silinmiş olabilir
      if (String(e.message).includes('404')) { localStorage.removeItem(GK); id = await findGist(); remote = await readRemote(id); }
      else throw e;
    }
    const local = store.snapshot();
    const merged = mergeState(local, remote);
    if (!sameState(local, merged)) store.mergeIn(remote);
    if (!sameState(remote, merged)) {
      await gh('/gists/' + id, { method: 'PATCH', body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(payload()) } } }) });
    }
    setStatus('ok');
  } catch (e) {
    setStatus('error', e.message || 'Hata');
  } finally {
    busy = false;
    if (again) { again = false; schedule(); }
  }
}

let t = null;
export function schedule() {
  if (!getToken()) return;
  clearTimeout(t);
  setStatus('pending');
  t = setTimeout(syncNow, 5000);
}

export function init() {
  try { status.at = JSON.parse(localStorage.getItem(SK))?.at || null; } catch {}
  status.state = getToken() ? 'idle' : 'off';
  store.subscribe(info => { if (!info.silent) schedule(); });
  addEventListener('online', () => getToken() && syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && getToken()) syncNow();
  });
  if (getToken()) syncNow();
}
