// Gizli soru paketi: GitHub'daki özel repodan (zaceby14/yokdil-ozel/paket.json) token ile çekilir.
// Paket yalnızca bu cihazın IndexedDB'sine yazılır; senkrona (gist) GİRMEZ.
import { getToken } from './sync.js';
import { savePack, validate } from './pack.js';
import { dayKey } from './util.js';

export const URL_ = 'https://api.github.com/repos/zaceby14/yokdil-ozel/contents/paket.json';
const MK = 'yokdil.privMeta';

export const meta = () => { try { return JSON.parse(localStorage.getItem(MK)) || {}; } catch { return {}; } };
const setMeta = m => localStorage.setItem(MK, JSON.stringify({ ...meta(), ...m }));

export const status = { state: 'idle', msg: '' }; // idle | loading | ok | error
const subs = new Set();
export const onStatus = f => (subs.add(f), () => subs.delete(f));
function set(state, msg = '') { status.state = state; status.msg = msg; for (const f of subs) f(status); }

let running = null;

// force: ETag'i yok say ve yeniden indir. Döner: {changed, exams?}
export function fetchPrivate({ force = false } = {}) {
  if (running) return running;
  running = run(force).finally(() => { running = null; });
  return running;
}

async function run(force) {
  const tok = getToken();
  if (!tok) { set('idle'); return { changed: false, reason: 'token' }; }
  if (!navigator.onLine) { set('error', 'Çevrimdışı'); return { changed: false }; }
  set('loading');
  const m = meta();
  const headers = { Accept: 'application/vnd.github.raw+json', Authorization: 'Bearer ' + tok };
  if (m.etag && !force) headers['If-None-Match'] = m.etag;
  try {
    const r = await fetch(URL_, { headers, cache: 'no-store' });
    if (r.status === 304) { setMeta({ at: Date.now(), day: dayKey(), err: '' }); set('ok'); return { changed: false }; }
    if (r.status === 401) throw new Error('Anahtar geçersiz');
    if (r.status === 404) throw new Error('Repo görünmüyor: anahtara "repo" yetkisi ver');
    if (r.status === 403) throw new Error('Yetki yok ya da limit doldu');
    if (!r.ok) throw new Error('GitHub ' + r.status);
    const p = validate(JSON.parse(await r.text()));
    const saved = await savePack(p, 'gizli');
    setMeta({ etag: r.headers.get('ETag') || '', at: Date.now(), day: dayKey(), n: p.exams.length, err: '' });
    set('ok');
    return { changed: true, exams: saved.exams.length };
  } catch (e) {
    const msg = e instanceof SyntaxError ? 'Paket bozuk (JSON)' : (e.message === 'Failed to fetch' ? 'Bağlantı hatası' : e.message || 'Hata');
    setMeta({ err: msg, day: dayKey() }); // günde bir deneme; elle yenileme her zaman çalışır
    set('error', msg);
    return { changed: false, error: msg };
  }
}

// Açılışta: günde en fazla bir kez
export function dailyFetch() {
  if (!getToken()) return Promise.resolve({ changed: false });
  if (meta().day === dayKey()) return Promise.resolve({ changed: false });
  return fetchPrivate();
}

export const resetMeta = () => localStorage.removeItem(MK);
