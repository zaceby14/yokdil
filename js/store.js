// Tek durum deposu. localStorage "yokdil.v1": { koleksiyon: { id: kayıt } }
import { COLLECTIONS, mergeState } from './merge.js';

const KEY = 'yokdil.v1';
let state = {};
const subs = new Set();
let saveT = null;

export const DEFAULT_SETTINGS = { theme: 'system', reverse: false, newLimit: null, grammarCount: 8, autoAdd: true, readHl: true, vocabGoal: 2000, targetScore: null, secClock: true, finalMode: true, readGoal: 120, starFirst: false, warmup: true };

export function load() {
  try { state = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { state = {}; }
  for (const c of COLLECTIONS) state[c] ||= {};
  return state;
}

function persist() {
  clearTimeout(saveT); saveT = null;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('kayıt hatası', e); }
}

function changed(info) {
  clearTimeout(saveT);
  saveT = setTimeout(persist, 150);
  for (const f of subs) f(info);
}

addEventListener('pagehide', () => saveT && persist());

export const subscribe = f => (subs.add(f), () => subs.delete(f));

export function get(col, id) {
  const r = state[col]?.[id];
  return r && !r.deleted ? r : null;
}

// Silinmiş dahil ham kayıt
export const raw = (col, id) => state[col]?.[id] || null;

export function all(col) {
  return Object.values(state[col] || {}).filter(r => !r.deleted);
}

// Kaydet: updatedAt otomatik. opts.ts verilirse o zaman damgası kullanılır (seed için).
export function put(col, rec, opts = {}) {
  const now = opts.ts ?? Date.now();
  const prev = state[col][rec.id];
  const updatedAt = opts.ts != null ? now : Math.max(now, (prev?.updatedAt || 0) + 1);
  const r = { ...rec, updatedAt };
  delete r.deleted;
  state[col][rec.id] = r;
  changed({ col, id: rec.id, silent: opts.silent });
  return r;
}

export function patch(col, id, fields) {
  const prev = get(col, id) || { id };
  return put(col, { ...prev, ...fields, id });
}

export function del(col, id) {
  state[col][id] = { id, deleted: true, updatedAt: Date.now() };
  changed({ col, id });
}

export function settings() {
  return { ...DEFAULT_SETTINGS, ...(get('settings', 'main') || {}) };
}

export function setSetting(k, v) {
  patch('settings', 'main', { [k]: v });
}

// Senkron için: tüm durumu ver / dışarıdan gelenle birleştir
export function snapshot() { return JSON.parse(JSON.stringify(state)); }

export function mergeIn(other) {
  state = mergeState(state, other || {});
  for (const c of COLLECTIONS) state[c] ||= {};
  persist();
  for (const f of subs) f({ merged: true, silent: true });
}

export function resetAll() {
  state = {}; for (const c of COLLECTIONS) state[c] = {};
  persist();
}

// Göçler: her biri cihaz başına bir kez (id'ler localStorage'da). ctx: { idx (words index) }
const MK = 'yokdil.mig';
export function migrate(list, ctx = {}) {
  let done = [];
  try { done = JSON.parse(localStorage.getItem(MK)) || []; } catch {}
  const ran = [];
  for (const m of list) {
    if (done.includes(m.id)) continue;
    try { m.run({ all, get, put, del, raw }, ctx); done.push(m.id); ran.push(m.id); } catch (e) { console.warn('göç', m.id, e); }
  }
  if (ran.length) localStorage.setItem(MK, JSON.stringify(done));
  return ran;
}
