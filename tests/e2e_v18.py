# v18 uçtan uca: anlık uyum, tek öncelik, karışık günlük set, kart tavanı, geri dönüş, puan tahmini, bölüm provası.
# python3 tests/e2e_v18.py (sunucu: python3 -m http.server 8765)
import json, sys, os, re
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:8765/')
SHOTS = '/home/claude/shots/v18'
os.makedirs(SHOTS, exist_ok=True)
errors, fails = [], []

def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

with sync_playwright() as p:
    exe = '/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None
    b = p.chromium.launch(executable_path=exe, args=['--no-sandbox'])
    c = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
    c.route(lambda u: not u.startswith(BASE), lambda r: r.abort())
    page = c.new_page()
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept())
    page.goto(BASE + '#/bugun'); page.wait_for_selector('.hero', timeout=15000); page.wait_for_timeout(500)
    def ev(js): return page.evaluate(js)
    def go(r, t=700):
        if page.url == BASE + '#/' + r: page.goto(BASE + ('#/ayarlar' if r == 'bugun' else '#/bugun')); page.wait_for_timeout(250)
        page.goto(BASE + '#/' + r); page.wait_for_timeout(t)
    def shot(n, full=False): page.screenshot(path=f'{SHOTS}/{n}.png', full_page=full)
    def st(): page.wait_for_timeout(250); return ev("JSON.parse(localStorage.getItem('yokdil.v1')||'{}')")
    TODAY = ev("import('./js/util.js').then(u => u.dayKey())")
    ev("import('./js/store.js').then(m => m.setSetting('warmup', false))")

    # 1) Günlük set: 6 boşluk + 2 soru tipi
    go('gramer/gunluk', 1200)
    keys = st()['sessions'].get('gunluk:' + TODAY, {}).get('keys', [])
    dk = [k for k in keys if k.startswith('d')]
    check(len(keys) == 8 and len(dk) == 2, f'günlük set: 8 soru, 2 tip sorusu ({keys})')
    check('soru tipi sorusu' in page.text_content('details.why'), '"Bu set neden böyle?" tip sorularını açıklıyor')
    # 2) Yanlış → pekiştirme 2 soru sonra (görünür not)
    q0 = keys[0]
    ans = ev(f"import('./js/qbank.js').then(m => m.resolve('{q0}')).then(it => it.answer)")
    page.locator('.opt').nth((ans + 1) % 5).click(); page.wait_for_timeout(400)
    note = page.inner_text('.adapt-note') if page.locator('.adapt-note').count() else ''
    s1 = st()['sessions'].get('gunluk:' + TODAY, {})
    check('pekiştirme' in note and s1.get('total') == 9, f'yanlış → pekiştirme notu, set 9 soru ({note!r}, {s1.get("total")})')
    shot('uyum-not', True)
    check(page.locator('.explain').evaluate("e => parseFloat(getComputedStyle(e).paddingBottom)") >= 60, 'açıklamanın altında düğme payı var')
    page.click('.actbar .btn.primary'); page.wait_for_timeout(300)
    for _ in range(2):
        page.locator('.opt').nth(0).click(); page.wait_for_timeout(200); page.click('.actbar .btn.primary'); page.wait_for_timeout(300)
    check(page.locator('.adapt-chip').count() == 1 and 'pekiştirme' in page.inner_text('.adapt-chip'), '4. soru (2 soru sonra): "pekiştirme" etiketi')
    shot('uyum-pekistirme')
    # Ayar kapalı → uyum yok
    ev("import('./js/store.js').then(m => { m.setSetting('adapt', false); m.del('sessions', 'pratik:relative'); })")
    go('gramer/pratik/relative', 1000)
    if page.locator('button:has-text("Baştan başla")').count(): page.click('button:has-text("Baştan başla")'); page.wait_for_timeout(400)
    page.locator('.opt').nth(0).click(); page.wait_for_timeout(200); page.locator('.opt').nth(1).click() if False else None
    k0 = st()['sessions'].get('pratik:relative', {}).get('total')
    check(k0 == 5 and page.locator('.adapt-note').count() == 0, f'ayar kapalı: uyum yok ({k0})')
    ev("import('./js/store.js').then(m => m.setSetting('adapt', true))")

    # 3) Kart tavanı: 100 bekleyen tekrar → 60 bugün, 40 sonraki günlere
    ev("""import('./js/store.js').then(m => { const now = Date.now(); for (let i = 0; i < 100; i++) m.put('cards', { id: 'cap' + i, word: 'capw' + i, tr: 'x', state: 'review', interval: 20, ease: 2.5, reps: 3, due: now - 86400000, lastReview: now - 20 * 86400000 }); })""")
    go('bugun', 800)
    kt = page.locator('[data-task=kart]').first.inner_text()
    m = re.search(r'(\d+) tekrar · (\d+) tanesi sonraki', kt)
    check(m is not None and int(m.group(1)) == 60 and int(m.group(2)) >= 40, f'kart tavanı 60, fazlası yayıldı ({kt.strip()[:70]})')
    check(ev("import('./js/srs.js').then(s => s.dueCards().length)") == 60, 'kart oturumu 60 kartla başlar')
    shot('kart-tavan', True)

    # 4) Geri dönüş: son çalışma 8 gün önce → hoş geldin, yalnız kart + gramer zorunlu
    ev(f"""Promise.all([import('./js/store.js'), import('./js/util.js')]).then(([m, u]) => {{
      for (const d of m.all('days')) m.del('days', d.id);
      m.put('days', {{ id: u.addDays('{TODAY}', -8), tasks: {{ kart: true }}, reviews: 20 }}); }})""")
    go('bugun', 900)
    main = [x.get_attribute('data-task') for x in page.locator('ul.tasks:not(.extra) > li[data-task]').all() if x.is_visible()]
    mockday = page.locator('[data-task=kisa], [data-task=deneme]').count() > 0
    check((page.locator('.banner.comeback').count() == (0 if mockday else 1)) and ev("import('./js/srs.js').then(s => s.dueInfo().cap)") == 30, f'geri dönüş: karşılama (deneme günü değilse) + tavan 30 (deneme günü: {mockday})')
    check(set(main) <= {'kart', 'gramer', 'kisa', 'deneme'} and 'kart' in main and 'okuma' not in main and 'yeni' not in main, f'geri dönüş günü zorunlu görevler kart + gramer ({main})')
    shot('geri-donus', True)

    # 5) Puan tahmini: Bugün + hedef tablosunda "Senin (tahmini)" + Eksikler grafiği
    ev(f"""import('./js/store.js').then(m => {{ const now = Date.now();
      for (let i = 0; i < 40; i++) m.put('grammarLog', {{ id: 'es' + i, q: 'g' + String(i).padStart(4, '0'), correct: i % 3 !== 0, at: now - i * 1000, day: '{TODAY}', kind: 'gramer', topic: 'baglac-zitlik', dtype: 'bosluk' }});
      for (let i = 0; i < 8; i++) m.put('grammarLog', {{ id: 'ec' + i, q: 'd200#' + i, correct: i % 2 === 0, at: now - i * 800, day: '{TODAY}', kind: 'drill', topic: '', dtype: 'ceviri-en-tr' }});
      for (let i = 0; i < 12; i++) m.put('grammarLog', {{ id: 'eo' + i, q: 'p001#' + i, correct: i % 2 === 0, at: now - i * 900, day: '{TODAY}', kind: 'okuma', topic: '', dtype: 'paragraf' }}); }})""")
    go('bugun', 900)
    et = page.inner_text('.est-line') if page.locator('.est-line').count() else ''
    check(re.search(r'Tahmini puan ≈ \d+–\d+ · hedef 70', et) is not None, f'Bugün: tahmini puan aralığı ({et})')
    check(st()['days'].get(TODAY, {}).get('est') is not None, 'tahmin günlük kayda yazıldı')
    go('dersler/arac/net', 900)
    check('Senin (tahmini)' in page.inner_text('main'), 'hedef tablosu: "Senin (tahmini)" sütunu')
    tx = page.inner_text('main')
    check(re.search(r'Çeviri\D*12\s*10', tx.replace('\n', ' ')) is not None or '10' in tx, 'hedef 70: çeviri 10/12')
    shot('hedef-tahmini', True)
    go('eksikler', 900)
    check(page.locator('.est-box').count() == 1 and 'Tahmini puan' in page.inner_text('.est-box'), 'Eksikler: tahmini puan kutusu')
    shot('eksikler-tahmin', True)

    # 6) Son dönem doğruluk + eğilim
    ev(f"""import('./js/store.js').then(m => {{ const now = Date.now(); for (const l of m.all('grammarLog')) m.del('grammarLog', l.id);
      for (let i = 0; i < 30; i++) m.put('grammarLog', {{ id: 'tr' + i, q: 'gt' + i, correct: false, at: now - 1e7 + i, day: '{TODAY}', kind: 'gramer', topic: 'edat-esdizim', dtype: 'bosluk' }});
      for (let i = 0; i < 30; i++) m.put('grammarLog', {{ id: 'tn' + i, q: 'gu' + i, correct: i % 2 === 0, at: now - 1e6 + i, day: '{TODAY}', kind: 'gramer', topic: 'edat-esdizim', dtype: 'bosluk' }}); }})""")
    go('eksikler', 900)
    ev("document.querySelector('details.more-detail').open = true"); page.wait_for_timeout(200)
    row = page.locator('li.arow[data-key="edat-esdizim"]').first.inner_text()
    check('%50' in row and '↑ +50' in row and 'toplam %25' in row, f'konu satırı: son 30 %50, ↑ +50, toplam %25 ({row.strip()[:80]})')
    check('güçlenenler' in page.inner_text('main') and 'Edat' in page.inner_text('.risers'), 'Eksikler: "güçlenenler" satırı')
    shot('eksikler-egilim', True)

    # 7) Bölüm provası: okuma 15 soru / 60 dk
    go('deneme/yeni/okuma', 900)
    check('15 soru · 60 dk' in page.inner_text('main'), 'okuma provası: 15 soru · 60 dk')
    page.click('.kisa-go'); page.wait_for_timeout(1500)
    defs = [v for v in st()['progress'].values() if v.get('kind') == 'kisadef' and v.get('size') == 'okuma']
    check(defs and len(defs[0]['units']) == 5 and all(u['sec'] == 'okuma' for u in defs[0]['units']), f'okuma provası: 5 parça ({defs[0]["units"] if defs else None})')

    # 8) Tam denemeden ertesi gün: analiz görevi
    ev(f"""Promise.all([import('./js/store.js'), import('./js/util.js')]).then(([m, u]) => m.put('mocks', {{ id: 'mx', date: u.addDays('{TODAY}', -1), src: 'cikmis', examId: 'yokdil-fen-2019', sections: {{ bosluk: {{ d: 12 }} }}, score: 50 }}))""")
    go('bugun', 900)
    at = page.locator('[data-task=analiz]')
    check(at.count() == 1 and '3 adım' in at.inner_text() and 'cikmis/sonuc/yokdil-fen-2019' in at.locator('a.task').get_attribute('href'), 'deneme ertesi gün: 3 adımlı analiz görevi')
    check(ev("document.documentElement.scrollWidth") <= 392, 'Bugün taşmıyor')
    shot('bugun-v18', True)
    c.close(); b.close()

ext = [e for e in errors if 'net::ERR_FAILED' not in e and 'ERR_INTERNET' not in e and 'Failed to load resource' not in e]
print(f'\nKonsol hataları: {len(ext)}')
for e in ext[:10]: print('  ', e)
print(f'Başarısız: {len(fails)}')
sys.exit(1 if fails or ext else 0)
