# v14 uçtan uca: ısınma kartı, oturum içi kart, Eksikler eylemleri. python3 tests/e2e_v14.py (sunucu: python3 -m http.server 8765)
import json, sys, os
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:8765/')
SHOTS = '/home/claude/shots/v14'
os.makedirs(SHOTS, exist_ok=True)
errors, fails = [], []

def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

with sync_playwright() as p:
    exe = '/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None
    b = p.chromium.launch(executable_path=exe, args=['--no-sandbox'])

    def newpage(tag, scheme='light'):
        c = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block', color_scheme=scheme)
        c.route(lambda u: not u.startswith(BASE), lambda r: r.abort())
        pg = c.new_page()
        pg.on('console', lambda m: m.type == 'error' and errors.append(f'[{tag}] {m.text}'))
        pg.on('pageerror', lambda e: errors.append(f'[{tag}] {e}'))
        pg.on('dialog', lambda d: d.accept())
        pg.goto(BASE + '#/bugun'); pg.wait_for_selector('.hero', timeout=15000); pg.wait_for_timeout(500)
        return c, pg

    ctx, page = newpage('v14')
    def ev(js): return page.evaluate(js)
    def go(r, t=600):
        if page.url == BASE + '#/' + r: page.goto(BASE + ('#/ayarlar' if r == 'bugun' else '#/bugun')); page.wait_for_timeout(250)
        page.goto(BASE + '#/' + r); page.wait_for_timeout(t)
        # v15: ikincil bölümler kapalı (Ayarlar → Gelişmiş, Eksikler → Ayrıntı); içlerini test etmek için aç
        page.evaluate("document.querySelectorAll('details.set-adv, details.more-detail').forEach(d => d.open = true)")
    def shot(n, full=False): page.screenshot(path=f'{SHOTS}/{n}.png', full_page=full)
    def st(): page.wait_for_timeout(250); return ev("JSON.parse(localStorage.getItem('yokdil.v1')||'{}')")

    # Günlük setin konuları (kural kartı olanlar)
    info = ev("""Promise.all([import('./js/views/grammar.js'), import('./js/data.js'), import('./js/views/warmup.js')]).then(async ([g, d, w]) => {
      const ids = await g.dailySet(); const qs = new Map((await d.grammar()).map(q => [q.id, q]));
      const tops = [...new Set(ids.map(id => qs.get(id).topic))];
      const ok = []; for (const t of tops) if (await w.cardData(t)) ok.push(t);
      return { ids, tops, ok }; })""")
    print('     günlük set konuları:', info['tops'], '· kartlı:', info['ok'])
    check(len(info['ok']) >= 2, 'günlük sette kural kartı olan en az 2 konu var')
    T, T2 = info['ok'][0], info['ok'][1]

    # 1) Zayıf konu yokken ısınma çıkmaz
    go('gramer/gunluk', 900)
    check(page.locator('.warm').count() == 0 and page.locator('.opt').count() >= 2, 'zayıf konu yokken ısınma yok, doğrudan soru')

    # Zayıf konu: son 14 günde T'de 3 yanlış, T2'de 2 açık hata
    seed_js = f"""Promise.all([import('./js/store.js'), import('./js/util.js'), import('./js/data.js')]).then(async ([m, u, d]) => {{
      const qs = await d.grammar(); const day = u.dayKey(); const now = Date.now();
      const a = qs.filter(q => q.topic === '{T}').slice(-3), b2 = qs.filter(q => q.topic === '{T2}').slice(-2);
      a.forEach((q, i) => m.put('grammarLog', {{ id: 'wl' + i, q: q.id, correct: false, at: now - 3600e3 + i, day, kind: 'gramer', topic: q.topic, dtype: 'bosluk', level: q.level || 1 }}));
      b2.forEach((q, i) => m.put('mistakes', {{ id: q.id, stage: 0, streak: 0, solved: false, due: u.addDays(day, 1), wrongs: 1, last: day, kind: 'gramer', topic: q.topic, dtype: 'bosluk' }}));
      m.del('sessions', 'gunluk:' + day); }})"""
    ev(seed_js); page.wait_for_timeout(300)
    go('gramer/gunluk', 1000)
    keys = [page.locator('.wcard').nth(i).get_attribute('data-key') for i in range(page.locator('.wcard').count())]
    check(page.locator('.warm').count() == 1 and set(keys) == {T, T2}, f'zayıf konular için ısınma: {keys}')
    check(page.locator('.opt').count() == 0, 'ısınma sırasında soru yok')
    btn = page.locator('.warm-go').bounding_box()
    check(btn and btn['y'] + btn['height'] <= ev("innerHeight"), f'ısınma: "sorulara geç" düğmesi her zaman ekranda ({btn})')
    wc = page.locator(f'.wcard[data-key="{T}"]')
    check(wc.locator('.wc-formula').count() == 1, 'kartta ders formülü')
    check(wc.locator('.wc-lesson').count() == 1 and page.locator('.warm-go').count() == 1, '"Dersi aç" ve "Anladım, sorulara geç" var')
    shot('isinma')
    # Dersi aç → yan panel; kapat
    wc.locator('.wc-lesson').click(); page.wait_for_timeout(500)
    check(page.locator('#sidePanel:not(.hidden)').count() == 1, '"Dersi aç" yan panelde (tam ekran) açılıyor')
    shot('isinma-ders')
    page.locator('#sidePanel .icon-x').click(); page.wait_for_timeout(300)
    check(page.locator('.warm').count() == 1, 'panel kapanınca ısınma ekranı yerinde')
    s = st()
    check(all(s['progress'].get('kkart:' + k, {}).get('lastDay') for k in [T, T2]), 'kart görülmesi progress\'e yazıldı (kkart:<konu>)')
    page.locator('.warm-go').click(); page.wait_for_timeout(500)
    check(page.locator('.opt').count() >= 2 and page.locator('.warm').count() == 0, '"Anladım" → sorular başlıyor')

    # 2) Aynı gün tekrar çıkmaz
    go('bugun', 300); go('gramer/gunluk', 900)
    check(page.locator('.warm').count() == 0 and page.locator('.opt').count() >= 2, 'aynı gün ikinci kez ısınma yok')

    # 3) "Bir hafta gösterme": dünü taklit et (lastDay dün) → kart çıkar → hafta boyunca çıkmaz
    yday_js = f"""Promise.all([import('./js/store.js'), import('./js/util.js')]).then(([m, u]) => {{ const y = u.addDays(u.dayKey(), -1);
      for (const k of ['{T}', '{T2}']) m.patch('progress', 'kkart:' + k, {{ lastDay: y }}); m.del('sessions', 'gunluk:' + u.dayKey()); }})"""
    ev(yday_js); page.wait_for_timeout(300)
    go('bugun', 300); go('gramer/gunluk', 900)
    check(page.locator(f'.wcard[data-key="{T2}"]').count() == 1, 'ertesi gün kart yeniden çıkıyor')
    page.locator(f'.wcard[data-key="{T2}"] .wc-snooze').click(); page.wait_for_timeout(300)
    s = st()
    sn = s['progress'].get('kkart:' + T2, {}).get('snoozeUntil')
    check(sn is not None and page.locator(f'.wcard[data-key="{T2}"]').count() == 0, f'"Bir hafta gösterme": kart kalktı, snoozeUntil={sn}')
    ev(yday_js); page.wait_for_timeout(300)
    go('bugun', 300); go('gramer/gunluk', 900)
    check(page.locator(f'.wcard[data-key="{T2}"]').count() == 0 and page.locator(f'.wcard[data-key="{T}"]').count() == 1, 'ertelenen konu hafta içinde çıkmıyor, diğeri çıkıyor')
    # Ayarlar: kapat
    ev(yday_js); page.wait_for_timeout(300)
    go('ayarlar', 500)
    page.locator('input[name=warmup]').uncheck(); page.wait_for_timeout(300)
    go('gramer/gunluk', 900)
    check(page.locator('.warm').count() == 0 and page.locator('.opt').count() >= 2, 'Ayarlar → ısınma kapalı: kart çıkmıyor')
    go('ayarlar', 500); page.locator('input[name=warmup]').check(); page.wait_for_timeout(300)
    shot('ayarlar-isinma', True)

    # 4) Alıştırma (tip seçince): ilgisiz tipinde zayıflık → ısınma (kişisel kural 'ilgisiz')
    ev("""Promise.all([import('./js/store.js'), import('./js/util.js')]).then(([m, u]) => { const day = u.dayKey();
      for (let i = 0; i < 3; i++) m.put('grammarLog', { id: 'il' + i, q: 'x-il' + i, correct: false, at: Date.now() - 1000 + i, day, kind: 'drill', topic: '', dtype: 'ilgisiz' }); })""")
    go('alistirma/ilgisiz', 900)
    check(page.locator('.wcard[data-key="ilgisiz"]').count() == 1, 'Alıştırma: soru tipi zayıfsa ısınma kartı (taktik + kişisel kural)')
    shot('isinma-alistirma')
    page.locator('.warm-go').click(); page.wait_for_timeout(400)

    # 5) Oturumda aynı konudan 2. yanlış → sonraki soru öncesi küçük kart
    go('gramer/pratik/' + T, 900)
    check(page.locator('.opt').count() >= 2, f'"5 soru çöz" ({T}) açıldı')
    sk = st()['sessions'].get('pratik:' + T, {}).get('keys', [])
    tops = ev(f"Promise.all({json.dumps(sk)}.map(k => import('./js/qbank.js').then(m => m.resolve(k)))).then(xs => xs.map(x => x && x.info.topic))")
    check(len(sk) == 5 and all(t == T for t in tops), f'5 soru, hepsi {T}')
    wr = set(st()['mistakes']) | {l['q'] for l in st()['grammarLog'].values() if not l['correct']}
    check(sk[0] not in wr and sum(k in wr for k in sk) <= 1, 'önce yeni sorular; yanlışlardan en fazla 1 (aynı sorular dönmesin)')
    def answer_wrong(i):
        k = sk[i]
        ans = ev(f"import('./js/qbank.js').then(m => m.resolve('{k}')).then(x => x.answer)")
        page.locator('.opt').nth((ans + 1) % page.locator('.opt').count()).click(); page.wait_for_timeout(250)
    answer_wrong(0)
    page.click('button:has-text("Sonraki")'); page.wait_for_timeout(400)
    check(page.locator('.minirule').count() == 0, '1. yanlıştan sonra küçük kart yok')
    answer_wrong(1); page.wait_for_timeout(700)
    check(page.locator('.explain .minirule').count() == 1 and page.locator('.minirule').is_visible(), 'oturumda 2. yanlış → geri bildirimde küçük kural kartı')
    shot('oturum-kart')
    page.locator('.minirule .icon-x').click(); page.wait_for_timeout(200)
    check(page.locator('.minirule').count() == 0, 'küçük kart kapatılabiliyor')
    page.click('button:has-text("Sonraki")'); page.wait_for_timeout(400)
    answer_wrong(2)
    page.click('button:has-text("Sonraki")'); page.wait_for_timeout(600)
    check(page.locator('.minirule').count() == 0, 'küçük kart oturumda tek sefer')

    # 6) Eksikler: en üstte tek kart, satır eylemleri
    go('eksikler', 900)
    check(page.locator('.best1').count() == 1 and page.locator('.best1 .best1-go').count() == 1, 'Eksikler: "Bugün en çok kazandıracak 1 şey" tek kart')
    check(page.locator('section.card').nth(1).locator('h3').inner_text() == 'Kelimeler' and page.locator('section.card').nth(1).locator('.vocab').count() == 1, 'Eksikler: bölüm sırası korunuyor (2. bölüm Kelimeler)')
    row = page.locator(f'.arow.weak[data-key="{T}"]').first
    check(row.count() == 1 and row.locator('.arow-acts .btn').count() == 2, f'zayıf konu satırında 2 düğme ({T})')
    mx = ev("Math.max(...[...document.querySelectorAll('.arow')].map(r => r.querySelectorAll(':scope > .arow-acts .btn').length), 0)")
    check(mx <= 2, f'satır başına en fazla 2 düğme ({mx})')
    check(page.locator(f'.arow[data-key="{T}"] .after-card').count() >= 1, 'kural kartından sonraki doğruluk küçük bilgi olarak')
    ov = ev("(() => { const vw = document.documentElement.clientWidth; return [...document.querySelectorAll('main .arow *, main .best1 *')].filter(e => e.offsetParent && e.getBoundingClientRect().right > vw + 1).length; })()")
    check(ov == 0, f'Eksikler satırları ekrandan taşmıyor ({ov})')
    shot('eksikler', True)
    page.locator('.best1').screenshot(path=f'{SHOTS}/eksikler-ust.png')
    # Kuralı oku → yan panel kural kartı + 5 soru
    row.locator('.act-rule').click(); page.wait_for_timeout(600)
    check(page.locator('#sidePanel:not(.hidden) .wcard').count() == 1 and page.locator('#sidePanel .side-practice').count() == 1, '"Kuralı oku" → yan panelde kural kartı + dersin tamamı')
    shot('eksikler-kural')
    page.locator('#sidePanel .side-practice').click(); page.wait_for_timeout(800)
    check(page.url.endswith('#/gramer/pratik/' + T) and page.locator('#sidePanel:not(.hidden)').count() == 0, 'panelden "5 soru çöz" → pratik ekranı')
    # ⋯ → Yanlışlarım
    go('eksikler', 900)
    r2 = page.locator(f'.arow[data-key="{T}"]').first
    r2.locator('details.more > summary').click(); page.wait_for_timeout(200)
    shot('eksikler-menu')
    wl = r2.locator('.act-wrongs')
    check(wl.count() == 1 and 'Yanlışlarım' in wl.inner_text(), f'⋯ menüsü: {wl.inner_text() if wl.count() else "-"}')
    wl.click(); page.wait_for_timeout(900)
    lab = page.inner_text('.qhead') if page.locator('.qhead').count() else ''
    check(page.url.endswith('#/gramer/yanlis/' + T) and 'Yanlış' in lab, f'"Yanlışlarım" → o konunun hata kutusu soruları ({lab.strip()[:40]})')
    # Tek düğme: kural kartı + 5 soru
    go('eksikler', 900)
    bk = page.locator('.best1-go').get_attribute('href')
    page.locator('.best1-go').click(); page.wait_for_timeout(900)
    check(page.locator('.warm .wcard').count() == 1 and page.locator('.wc-snooze').count() == 0, f'"Kural kartı + 5 soru": önce kural kartı ({bk})')
    page.locator('.warm-go').click(); page.wait_for_timeout(500)
    if page.locator('.card.resume').count(): page.click('button:has-text("Baştan başla")'); page.wait_for_timeout(300)
    check(page.locator('.opt').count() >= 2, 'sonra 5 soru (yarım oturum varsa önce "Kaldığın yerden" sorusu)')
    # Soru tipi satırı (çıkmış/özgün filtresi korunuyor) ve deneme bölümü eylemleri
    go('eksikler', 900)
    check(page.locator('.reasons-all').count() <= 1 and page.locator('.seg button:has-text("Çıkmış")').count() == 1, 'Soru tipi filtresi duruyor')
    il = page.locator('.arow[data-key="ilgisiz"]').first
    check(il.count() == 1, 'soru tipi satırında eylemler (ilgisiz)')

    # 7) Hata nedeni bağlantısı (süre / iki şık / kelime / gramer)
    for rid, want in [('sure', '#/dersler/arac/sure'), ('iki-sik', '#/dersler/arac/eleme'), ('kelime', '#/kartlar/')]:
        ev(f"""import('./js/store.js').then(m => {{ for (const r of m.all('reasons')) m.del('reasons', r.id); for (let i = 0; i < 2; i++) m.put('reasons', {{ id: 'rz{rid}' + i, reason: '{rid}', at: Date.now(), day: '2026-01-01' }}); }})""")
        go('eksikler', 800)
        href = page.locator('.reason-go').get_attribute('href') if page.locator('.reason-go').count() else None
        check(href is not None and href.startswith(want), f'en sık neden "{rid}" → {href}')
    ev("""import('./js/store.js').then(m => { for (const r of m.all('reasons')) m.del('reasons', r.id); for (let i = 0; i < 2; i++) m.put('reasons', { id: 'rg' + i, reason: 'gramer', at: Date.now(), day: '2026-01-01' }); })""")
    go('eksikler', 800)
    page.locator('.reason-go').click(); page.wait_for_timeout(600)
    check(page.locator('#sidePanel:not(.hidden) .wcard').count() == 1, 'en sık neden "gramer" → en zayıf konunun kuralı')
    page.locator('#sidePanel .icon-x').click(); page.wait_for_timeout(200)

    # 8) Deneme bölümleri: zayıf bölüm eylemleri
    ev("""import('./js/store.js').then(m => m.put('mocks', { id: 'mk1', date: '2026-11-20', name: 'T', sections: { bosluk: { d: 15, y: 5, b: 0 }, cloze: { d: 3, y: 7, b: 0 }, tamamlama: { d: 9, y: 2, b: 0 }, 'en-tr': { d: 5, y: 1, b: 0 }, 'tr-en': { d: 5, y: 1, b: 0 }, paragraf: { d: 2, y: 4, b: 0 }, ilgisiz: { d: 5, y: 1, b: 0 }, okuma: { d: 12, y: 3, b: 0 } } }))""")
    go('eksikler', 900)
    mw = page.locator('.mock-weak .arow')
    ks = [mw.nth(i).get_attribute('data-key') for i in range(mw.count())]
    check(ks[:2] == ['cloze', 'paragraf-tamamlama'], f'deneme zayıf bölümleri eylemli: {ks}')
    page.locator('.mock-weak .arow[data-key=cloze] .act-5').click(); page.wait_for_timeout(900)
    sk2 = st()['sessions'].get('pratik:cloze', {}).get('keys', [])
    check(len(sk2) >= 5 and page.locator('.opt').count() >= 2, f'deneme bölümü → 5 cloze sorusu ({len(sk2)})')

    # 9) En çok unutulan → "Bu kelimeleri çalış"
    ev("""import('./js/store.js').then(m => { const now = Date.now(), D = 86400000;
      [['decay', 'çürüme', 3, now + 5 * D], ['yield', 'verim', 2, now + 3 * D], ['abundant', 'bol', 1, now - D]].forEach(([w, tr, l, due], i) =>
        m.put('cards', { id: 'lap' + i, word: w, tr, state: 'review', lapses: l, due, interval: 5, reps: 4, ease: 2.3, createdAt: i + 1 })); })""")
    go('eksikler', 900)
    sel = page.locator('.study-sel')
    check(sel.count() == 1 and page.locator('.lap-cb').count() >= 3, 'En çok unutulan: seçim kutuları + "Bu kelimeleri çalış"')
    page.locator('.lap-cb').nth(2).uncheck(); page.wait_for_timeout(100)
    n_sel = page.locator('.lap-cb:checked').count()
    check(f'({n_sel})' in sel.inner_text(), f'seçili sayı düğmede ({sel.inner_text()})')
    due0 = st()['cards']['lap0']['due']
    sel.click(); page.wait_for_timeout(900)
    check('#/kartlar/sec/' in page.url and page.locator('.flashcard').count() == 1, 'seçili kelimelerle kart oturumu')
    shot('kelime-calis')
    words_seen = []
    for i in range(10):
        if page.locator('button:has-text("Göster")').count() == 0: break
        words_seen.append(page.inner_text('.fword'))
        page.click('button:has-text("Göster")'); page.wait_for_timeout(100)
        page.click('.grades button:last-child'); page.wait_for_timeout(250)
    check(len(words_seen) == n_sel and 'seçili kelime çalışıldı' in page.inner_text('main'), f'oturum yalnız seçilenler: {words_seen}')
    check(st()['cards']['lap0']['due'] == due0, 'vadesi gelmemiş kartın takvimi değişmedi')

    # 10) Eski veri: kkart kaydı olmayan / ayarında warmup olmayan kullanıcı bozulmaz
    ev("""import('./js/store.js').then(m => { m.put('settings', { id: 'main', theme: 'system', grammarCount: 8 }); for (const p of m.all('progress')) if (p.id.startsWith('kkart:')) m.del('progress', p.id); })""")
    go('eksikler', 800); go('gramer/gunluk', 900)
    check(page.locator('.warm').count() + page.locator('.opt').count() >= 1, 'eski biçimli ayar/progress: ekran açılıyor (varsayılan açık)')
    ctx.close()


    # ===== Kurul (orta seviye kullanıcı) düzeltmeleri =====
    ctx, page = newpage('kurul')
    def ev(js): return page.evaluate(js)
    def go(r, t=600):
        if page.url == BASE + '#/' + r: page.goto(BASE + ('#/ayarlar' if r == 'bugun' else '#/bugun')); page.wait_for_timeout(250)
        page.goto(BASE + '#/' + r); page.wait_for_timeout(t)
        # v15: ikincil bölümler kapalı (Ayarlar → Gelişmiş, Eksikler → Ayrıntı); içlerini test etmek için aç
        page.evaluate("document.querySelectorAll('details.set-adv, details.more-detail').forEach(d => d.open = true)")
    def shot(n, full=False): page.screenshot(path=f'{SHOTS}/{n}.png', full_page=full)
    def st(): page.wait_for_timeout(250); return ev("JSON.parse(localStorage.getItem('yokdil.v1')||'{}')")
    # Y1/O1: kartta iç terim yok, otomatik not kısa ve gri
    ev("""import('./js/store.js').then(m => { const now = Date.now(); for (const c of m.all('cards')) m.put('cards', { ...c, state: 'known', knownAt: 1 });
      m.put('cards', { id: 'lad', word: 'scarcity', tr: 'kıtlık', syn: ['shortage'], state: 'relearn', ladder: 1, interval: 1, ease: 2.3, reps: 3, due: now - 1000, hist: ['g','a'], note: 'anlam Claude tarafından eklendi; anlam düzeltildi: a → b (Claude)' });
      m.put('cards', { id: 'fur', word: 'furthermore', tr: 'ayrıca, üstelik', syn: ['moreover', 'in addition'], state: 'learning', interval: 0, ease: 2.5, reps: 1, due: now + 86400000, hist: ['g'] }); })""")
    go('kartlar/calis', 900)
    front = page.inner_text('.flashcard')
    check('merdiven' not in front.lower(), 'kart ön yüzünde "merdiven" yok')
    page.click('button:has-text("Göster")'); page.wait_for_timeout(200)
    back = page.inner_text('.flashcard')
    check('Claude' not in back and page.locator('.auto-note').count() == 1 and 'otomatik' in page.inner_text('.auto-note'), 'arka yüzde otomatik not kısa ve gri ("Claude" yok)')
    shot('kurul-kart-arka')
    go('kartlar', 600)
    check('merdiven' not in page.inner_text('main').lower(), 'Kartlar ekranında "merdiven" yok')
    # O13: yazarak hatırla eş anlamlı
    ev("""import('./js/store.js').then(m => { for (const c of m.all('cards')) if (c.id !== 'fur') m.put('cards', { ...c, state: 'known', ladder: null }); })""")
    go('kartlar/yaz', 900)
    page.fill('input.typein', 'moreover'); page.click('button:has-text("Kontrol")'); page.wait_for_timeout(300)
    fb = page.inner_text('.explain')
    check('Yakın' in fb and 'furthermore' in fb and page.locator('input.typein.right').count() == 1, f'yazarak: eş anlamlı yakın kabul ({fb.strip()[:60]})')
    shot('kurul-yazarak-yakin')
    # O15 + Y2 + O10: kısa deneme onayı, sonuç x/20, yanlış listesinde soru kökü
    go('deneme/yeni/mini', 900)
    check(page.locator('.kisa-go').count() == 1 and page.locator('.timer').count() == 0 and not any(k.startswith('exam:kisa') for k in st()['progress']), 'kısa deneme: önce onay, süre başlamadı')
    shot('kurul-kisa-onay')
    page.click('.kisa-go'); page.wait_for_timeout(1000)
    sat = ev("(() => { const w = document.querySelector('.reader .w'); if (!w) return 'none'; w.classList.add('saved'); return getComputedStyle(w).backgroundColor; })()")
    check(sat in ('rgba(0, 0, 0, 0)', 'transparent'), f'deneme ekranında kartındaki kelime vurgusu yok ({sat})')
    page.locator('.opt').nth(0).click(); page.click('button:has-text("Sonraki")')
    page.locator('.opt').nth(1).click()
    page.click('.readbar button:has-text("Bitir")'); page.wait_for_timeout(1000)
    hero = page.inner_text('.hero')
    check('/22' in page.inner_text('.hero .big') and 'tahmini puan' not in hero and 'sınav puanı değildir' in hero, f'kısa deneme sonucu: x/20 doğru (%), puan değil ({hero.strip()[:50]})')
    page.locator('details.secgroup > summary').first.click(); page.wait_for_timeout(200)
    qw = page.locator('details.secgroup').first.locator('.qwrong summary').first
    check(qw.locator('.qw-arrow').count() == 1, 'deneme yanlış listesi: ▸ işareti')
    shot('kurul-kisa-sonuc', True)
    # Y3/Y4: yarım deneme üst kutusu + bölüm süresi oranı
    r = ev("""Promise.all([import('./js/views/exams.js'), import('./js/kisa.js'), import('./js/strategy.js'), import('./js/data.js')]).then(async ([X, K, S, D]) => {
      const qs = Array.from({ length: 40 }, (_, i) => ({ n: i + 1, type: i < 20 ? 'bosluk' : i < 30 ? 'cloze' : i < 37 ? 'cumle-tamamlama' : i < 39 ? 'ceviri-en-tr' : 'ceviri-tr-en' }));
      const el = X.heroOf({ id: 'y' }, true, 24, qs, {});
      const tp = (await D.aids()).timePlan;
      const sp = K.scalePlan(tp, { bosluk: 20, cloze: 10, tamamlama: 7, 'en-tr': 2, 'tr-en': 1 }, S.planRows);
      const cev = S.planRows(sp).find(x => x.secs.includes('tr-en'));
      return { t: el.textContent, cev: cev ? cev.minutes : null, tot: sp.total }; })""")
    check('24/40' in r['t'] and 'Okuma bölümü yok' in r['t'] and 'puan yalnız tam' in r['t'], f'yarım deneme: 24/40, okuma yok uyarısı ({r["t"]})')
    check(r['cev'] is not None and r['cev'] <= 5, f'yarım deneme: 3 çeviri sorusuna {r["cev"]} dk (15 değil)')
    # Y5: okuma çipleri
    ev("""Promise.all([import('./js/views/reading.js')]).then(([R]) => { const box = R.newWordsBox([{ entry: { word: 'seal', tr: 'sızdırmaz hâle getirmek, mühürlemek' }, ctx: '' }, { entry: { word: 'continent', tr: 'kıta' }, ctx: '' }, { entry: { word: 'plant', tr: 'bitki; tesis, santral' }, ctx: '' }],
      { title: 'T', gloss: [{ w: 'seal', tr: 'fok balığı' }] }); box.id = 'nwtest'; const m = document.querySelector('main .page'); m.innerHTML = ''; m.append(box); })""")
    page.wait_for_timeout(300)
    chips = [page.locator('#nwtest .nw-chip').nth(i).inner_text() for i in range(page.locator('#nwtest .nw-chip').count())]
    check(any('fok balığı' in c for c in chips) and not any('mühürlemek' in c for c in chips), f'çip: sözlükçe anlamı önce ({chips})')
    check(any(c.replace('\n', ' ').strip() == 'continent kıta' for c in chips), 'çip: kelime ile anlam arasında boşluk')
    check(any(c.strip() == 'plant' for c in chips), 'çip: çok anlamlı kelimede anlam yok (panelde)')
    wrap = ev("[...document.querySelectorAll('#nwtest .nw-chip b')].every(b => b.getClientRects().length === 1)")
    check(wrap, 'çip: kelime bölünmüyor')
    check('Kartında olmayan' in page.inner_text('#nwtest'), 'başlık: "Kartında olmayan X kelime"')
    shot('kurul-okuma-cip')
    # O4/O5: okuma görevi adı kalır, süre gerçekçi
    go('bugun', 900)
    okm = page.locator('li[data-task=okuma] .tmin')
    import re as _re
    mt = _re.search(r'\d+', okm.first.text_content()) if okm.count() else None
    print('     okuma görevi:', okm.first.text_content() if okm.count() else '-')
    mins = int(mt.group(0)) if mt else 99
    check(mins <= 12, f'okuma görevi süresi gerçekçi (~{mins} dk)')
    ev("""Promise.all([import('./js/plan.js')]).then(([P]) => { P.updateDay({ readTitle: 'Okuduğum Parça' }); P.tick('okuma'); })""")
    go('bugun', 900)
    check('Okuduğum Parça' in page.locator('li[data-task=okuma]').first.text_content(), 'okuma görevi tamamlanınca okunan parçanın adı kalıyor')
    # O14: ▶ odak kendiliğinden başlamaz
    check(page.locator('.tasks .play').count() == 0 and page.locator('.tasks .task-go').count() >= 1, 'görev satırında ▶ odak yok (varsayılan)')
    page.locator('.tasks .task-go').first.click(); page.wait_for_timeout(500)
    check(page.locator('#focusPill:not(.hidden)').count() == 0, 'göreve gitmek odak sayacını başlatmıyor')
    # Y6: deneme günü (bugün kısa deneme ya da programdaki deneme) → kart + deneme, gerisi isteğe bağlı
    dd = ev("""Promise.all([import('./js/plan.js'), import('./js/tasks.js'), import('./js/util.js')]).then(async ([P, T, U]) => { const w = await P.week(); return { k: T.kisaToday(w), day: U.dayKey() }; })""")
    go('bugun', 900)
    if dd['k']:
        main_keys = [page.locator('ul.tasks:not(.extra) > li').nth(i).get_attribute('data-task') for i in range(page.locator('.page > ul.tasks:not(.extra) > li').count())]
        check(page.locator('details.optional-tasks').count() == 1 and set(main_keys) <= {'kisa', 'kart', 'deneme'}, f'deneme günü: ana liste {main_keys}, gerisi "İsteğe bağlı"')
        tot = page.inner_text('h2:has-text("Bugün")')
        dmin = 90 if dd['k'] == 'yarim' else 50
        check(int(''.join(ch for ch in tot.split('·')[-1] if ch.isdigit()) or 0) <= dmin + 15, f'deneme günü toplam süre ≤ deneme + 15 dk ({tot})')
        shot('kurul-deneme-gunu', True)
    else:
        print('     (bugün deneme günü değil: deneme günü kontrolü birim testte)')
    # Y7 + O12/#3: Eksikler kelime çerçevesi, deneme grafiğinde hedef çizgisi, "null" yok, Bugün hedef satırı
    ev("""import('./js/store.js').then(m => { m.put('mocks', { id: 'full1', date: '2026-11-20', name: 'Tam', sections: { bosluk: { d: 12, y: 8, b: 0 }, cloze: { d: 5, y: 5, b: 0 }, tamamlama: { d: 6, y: 5, b: 0 }, 'en-tr': { d: 3, y: 3, b: 0 }, 'tr-en': { d: 3, y: 3, b: 0 }, paragraf: { d: 3, y: 3, b: 0 }, ilgisiz: { d: 3, y: 3, b: 0 }, okuma: { d: 10, y: 5, b: 0 } } }); })""")
    go('eksikler', 900)
    txt = page.inner_text('main')
    check('çalıştığın kelime' in txt and 'Sağlam' in txt, 'Eksikler: "çalıştığın kelime" + "Sağlam" çerçevesi')
    check(page.locator('.chart .goalT').count() == 1 and 'Hedef 70' in txt, 'deneme grafiğinde hedef çizgisi (70)')
    check('null' not in txt, 'Eksikler: "null" yazısı yok')
    shot('kurul-eksikler', True)
    go('bugun', 900)
    gl = page.inner_text('.goalline') if page.locator('.goalline').count() else ''
    check('Son tam deneme 56' in gl and 'hedef 70' in gl and 'fark 11 soru' in gl, f'Bugün: hedef satırı ({gl})')
    # O7: ilgisiz "Senin kuralın" çıkmaz
    r = ev("import('./js/quiz.js').then(async q => [await q.ruleFor('baglac-neden-amac', ['hence', 'however']), !!(await q.ruleFor('edat-esdizim', ['at', 'in']))])")
    check(r[0] is None and r[1], 'gramer yanlışında ilgisiz kişisel kural gösterilmiyor, ilgili gösteriliyor')
    # O9: %100 konuya "zayıf" yok
    ev("""import('./js/store.js').then(m => { for (let i = 0; i < 3; i++) m.put('grammarLog', { id: 'gi' + i, q: 'gx' + i, correct: true, at: 1, day: '2026-11-01', kind: 'gramer', topic: 'gerund-infinitive', dtype: 'bosluk' }); })""")
    go('gramer', 800)
    li = page.locator('a[href="#/gramer/konu/gerund-infinitive"]')
    check(li.count() == 1 and 'zayıf' not in li.inner_text(), f'%100 konuda "zayıf" etiketi yok ({li.inner_text() if li.count() else "-"})')
    # O8: Bugün'de en fazla 1 kural kartı görevi
    ev("""Promise.all([import('./js/store.js'), import('./js/util.js')]).then(([m, u]) => { const d = u.dayKey(); for (const t of ['edat-esdizim', 'baglac-zitlik', 'relative']) for (let i = 0; i < 6; i++) m.put('grammarLog', { id: 'rw' + t + i, q: 'rq' + t + i, correct: false, at: Date.now(), day: d, kind: 'gramer', topic: t, dtype: 'bosluk' }); })""")
    go('bugun', 900)
    check(page.locator('.rule-tasks li').count() == 1 and 'yanlış' not in page.inner_text('.rule-tasks'), 'Bugün: en fazla 1 kural kartı, sayı yok')
    shot('kurul-bugun', True)
    ctx.close()

    # Koyu tema görüntüleri
    ctx, page = newpage('v14-koyu', 'dark')
    page.evaluate(seed_js.replace("m.del('sessions', 'gunluk:' + day);", "m.del('sessions', 'gunluk:' + day);"))
    page.wait_for_timeout(300)
    page.goto(BASE + '#/gramer/gunluk'); page.wait_for_timeout(1000)
    page.screenshot(path=f'{SHOTS}/isinma-koyu.png')
    page.goto(BASE + '#/eksikler'); page.wait_for_timeout(900)
    page.screenshot(path=f'{SHOTS}/eksikler-koyu.png')
    ctx.close()
    b.close()

ext = [e for e in errors if 'net::ERR_FAILED' not in e and 'ERR_INTERNET' not in e and 'Failed to load resource' not in e]
print('\nKonsol hataları:', len(ext))
for e in ext: print('  ', e)
print('Başarısız:', len(fails))
sys.exit(1 if fails or ext else 0)
