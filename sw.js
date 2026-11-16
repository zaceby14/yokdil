// Service worker: uygulama kabuğu önbellekte, data/ ağ öncelikli
const VER = 'yokdil-v5';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/util.js', 'js/merge.js', 'js/store.js', 'js/data.js', 'js/plan.js', 'js/srs.js', 'js/mistakes.js',
  'js/sync.js', 'js/lookup.js', 'js/quiz.js', 'js/charts.js', 'js/qbank.js', 'js/theme.js', 'js/tappable.js', 'js/md.js', 'js/pack.js',
  'js/vocab.js', 'js/autocard.js', 'js/swipe.js',
  'js/views/today.js', 'js/views/reading.js', 'js/views/cards.js', 'js/views/grammar.js', 'js/views/drills.js',
  'js/views/panel.js', 'js/views/settings.js', 'js/views/hub.js', 'js/views/exams.js', 'js/views/lessons.js',
  'js/views/scan.js', 'js/views/gap.js',
  'js/ctx.js', 'js/speak.js', 'js/private.js', 'js/side.js', 'js/notes.js', 'js/focus.js', 'js/memory.js', 'js/contentrev.js',
  'js/views/notes.js', 'js/views/memory.js'
];

// Yeni sürüm: önbelleği HTTP önbelleğini atlayarak doldur; sayfa "Yenile" deyince devreye gir
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('message', e => { if (e.data?.type === 'skip') self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // API'lere dokunma
  if (url.pathname.includes('/data/')) {
    // Ağ öncelikli; başarılıysa önbelleğe yaz
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const c = r.clone(); caches.open(VER).then(x => x.put(req, c)); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || new Response('', { status: 504 }))));
    return;
  }
  // Kabuk: yalnızca bu sürümün önbelleği (karışık sürüm olmasın); yoksa ağ
  e.respondWith(caches.open(VER).then(c => c.match(req, { ignoreSearch: true })).then(hit => hit || fetch(req).then(r => {
    if (r.ok && SHELL.some(s => url.pathname.endsWith('/' + s.replace('./', '')))) { const c = r.clone(); caches.open(VER).then(x => x.put(req, c)); }
    return r;
  }).catch(() => caches.open(VER).then(c => c.match('index.html')))));
});
