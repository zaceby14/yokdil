// Uygulama kabuğu: tema, tohum veri, router
import * as store from './store.js';
import * as sync from './sync.js';
import { loadAll, seedUser, usedSample } from './data.js';
import { h } from './util.js';
import { applyTheme } from './theme.js';
import today from './views/today.js';
import reading from './views/reading.js';
import cards from './views/cards.js';
import grammar from './views/grammar.js';
import drills from './views/drills.js';
import panel from './views/panel.js';
import settings from './views/settings.js';
import exams from './views/exams.js';
import lessons from './views/lessons.js';

const routes = { bugun: today, okuma: reading, kartlar: cards, gramer: grammar, alistirma: drills, eksikler: panel, ayarlar: settings, cikmis: exams, dersler: lessons };
const TAB = { gramer: 'sorular', alistirma: 'sorular', cikmis: 'sorular', dersler: 'sorular' };
const view = document.getElementById('view');
let cleanup = null, current = '';

// Kullanıcının Word notları: bir kez ekle (id ile). ts=1 → senkronda uzak kayıt her zaman kazanır.
async function seed() {
  const s = await seedUser();
  const dev = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (usedSample.has('seed-user') && !dev) return; // örnek veri gerçek desteye girmesin
  const words = new Set(store.all('cards').map(c => (c.word || '').toLowerCase()));
  (s.cards || []).forEach((c, i) => {
    if (!c?.word) return;
    const id = c.id || 's:' + c.word.toLowerCase().trim().replace(/\s+/g, '-');
    if (store.raw('cards', id) || words.has(c.word.toLowerCase())) return;
    store.put('cards', {
      id, word: c.word, tr: c.tr || '', syn: c.syn || [], note: c.note || '', coll: c.coll || '', ex: c.ex || '',
      source: c.source || 'Notlarım', page: c.page || '', state: 'new', createdAt: i + 1
    }, { ts: 1, silent: true });
  });
  (s.grammarNotes || []).forEach((n, i) => {
    const o = typeof n === 'string' ? { text: n } : n || {};
    const id = o.id || 'sn:' + i;
    if (store.raw('notes', id)) return;
    store.put('notes', { id, topic: o.topic || '', title: o.title || '', text: o.text || o.note || o.rule || '', ex: o.ex || '', origin: 'seed' }, { ts: 1, silent: true });
  });
}

function setActive(name) {
  document.querySelectorAll('[data-r]').forEach(a => a.classList.toggle('active', a.dataset.r === (TAB[name] || name)));
}

async function route() {
  const [name, ...rest] = (location.hash.replace(/^#\/?/, '') || 'bugun').split('/');
  const r = routes[name] ? name : 'bugun';
  if (!routes[name] && location.hash !== '#/bugun') { history.replaceState(null, '', '#/bugun'); }
  try { cleanup?.(); } catch {}
  cleanup = null; current = r;
  setActive(r);
  view.innerHTML = '';
  const root = h('div.page');
  // null/false çocukları atla, dizileri düzleştir
  root.append = (...k) => Element.prototype.append.apply(root, k.flat(Infinity).filter(x => x != null && x !== false));
  view.append(root);
  window.scrollTo(0, 0);
  try { cleanup = (await routes[r](root, rest.map(decodeURIComponent))) || null; }
  catch (e) { console.error(e); root.append(h('div.card', h('b', 'Hata: '), String(e.message || e))); }
}

function syncDot(s) {
  const d = document.getElementById('syncDot');
  d.className = 'sync-dot ' + s.state;
  d.title = { off: 'Senkron kapalı', idle: 'Senkron hazır', pending: 'Gönderilecek', syncing: 'Senkronlanıyor', ok: 'Senkron tamam', error: 'Senkron hatası: ' + s.msg }[s.state] || '';
}

async function main() {
  store.load();
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  await loadAll();
  await seed();
  sync.onStatus(syncDot);
  sync.init();
  syncDot(sync.status);
  store.subscribe(info => {
    if (info.merged && ['bugun', 'eksikler', 'ayarlar'].includes(current)) route();
  });
  addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

main();
