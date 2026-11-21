// Uygulama kabuğu: tema, tohum veri, router
import * as store from './store.js';
import * as sync from './sync.js';
import { loadAll, seedUser, usedSample, wordIndex } from './data.js';
import { MIGRATIONS } from './migrations.js';
import { h, toast } from './util.js';
import { applyTheme } from './theme.js';
import { migrateContent } from './contentrev.js';
import today from './views/today.js';
import reading from './views/reading.js';
import cards from './views/cards.js';
import grammar from './views/grammar.js';
import drills from './views/drills.js';
import panel from './views/panel.js';
import settings from './views/settings.js';
import exams from './views/exams.js';
import lessons from './views/lessons.js';
import notes from './views/notes.js';
import { setCtx } from './ctx.js';
import { initNotes } from './notes.js';
import { initFocus, eveTip } from './focus.js';
import { dailyFetch } from './private.js';

const routes = { bugun: today, okuma: reading, kartlar: cards, gramer: grammar, alistirma: drills, eksikler: panel, ayarlar: settings, cikmis: exams, dersler: lessons, notlar: notes };
const TAB = { gramer: 'sorular', alistirma: 'sorular', cikmis: 'sorular' };
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
  setCtx(null);
  document.body.classList.remove('qmode');
  document.body.dataset.route = [r, ...rest].join('-');
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
  d.title = { off: 'Senkron kapalı (anahtar yok)', idle: 'Senkron hazır', pending: 'Senkron: gönderilecek değişiklik var', syncing: 'Senkronlanıyor…', ok: 'Senkron tamam', error: 'Senkron yapılamadı (bağlantı?): ' + s.msg }[s.state] || '';
}

async function main() {
  store.load();
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  await loadAll();
  await seed();
  await migrateContent().catch(e => console.warn('içerik güncelleme', e));
  try { store.migrate(MIGRATIONS, { idx: await wordIndex() }); } catch (e) { console.warn('göç', e); }
  sync.onStatus(syncDot);
  sync.init();
  syncDot(sync.status);
  document.getElementById('syncDot').addEventListener('click', e => toast(e.currentTarget.title || 'Senkron'));
  store.subscribe(info => {
    if (info.merged && ['bugun', 'eksikler', 'ayarlar'].includes(current)) route();
  });
  addEventListener('hashchange', route);
  initNotes();
  initFocus();
  keyboardWatch();
  route();
  eveTip();
  // Gizli soru paketi: günde en fazla bir kez (token varsa)
  dailyFetch().then(r => { if (r?.changed && current === 'cikmis') route(); }).catch(() => {});
  registerSW();
}

// Klavye açıkken alt çubuk ve Not düğmesi içeriği kapatmasın
function keyboardWatch() {
  const isField = el => el && (el.tagName === 'TEXTAREA' || el.isContentEditable ||
    (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'file', 'range'].includes(el.type)));
  document.addEventListener('focusin', e => { if (isField(e.target)) document.body.classList.add('kb'); });
  document.addEventListener('focusout', () => setTimeout(() => { if (!isField(document.activeElement)) document.body.classList.remove('kb'); }, 50));
}

// Service worker: yeni sürüm hazır olunca bant göster, dokununca skipWaiting + yenile
function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) location.reload(); });
  const band = w => {
    if (document.getElementById('updBand')) return;
    const b = h('div.updband', { id: 'updBand' }, h('span.grow', 'Yeni sürüm hazır'),
      h('button.btn.small.primary', { onclick: () => { reloading = true; w.postMessage({ type: 'skip' }); setTimeout(() => location.reload(), 1500); } }, 'Yenile'));
    document.body.append(b);
  };
  navigator.serviceWorker.register('sw.js').then(reg => {
    if (reg.waiting && navigator.serviceWorker.controller) band(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) band(w); });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}

main();
