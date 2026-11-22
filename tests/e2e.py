# Uçtan uca duman testi: python3 tests/e2e.py (sunucu: python3 -m http.server 8765)
import json, sys, os, re
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:8765/')
SHOTS = '/home/claude/shots/v11'
os.makedirs(SHOTS, exist_ok=True)
ROUTES = ['bugun', 'okuma', 'kartlar', 'kartlar/liste', 'kartlar/ekle', 'gramer', 'alistirma', 'cikmis', 'dersler', 'eksikler', 'ayarlar', 'notlar', 'kartlar/yaz', 'kartlar/hafiza']
errors = []
fails = []

def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

def attach(page, tag):
    page.on('console', lambda m: m.type == 'error' and errors.append(f'[{tag}] {m.text}'))
    page.on('pageerror', lambda e: errors.append(f'[{tag}] {e}'))

# v15: Ayarlar → Gelişmiş ve Eksikler → Ayrıntı varsayılan kapalı (tests/e2e_v15.py denetler); eski akışlar içlerini kullandığı için açılır
OPEN_DETAILS = """new MutationObserver(() => document.querySelectorAll('details.set-adv:not([data-o]), details.more-detail:not([data-o])').forEach(d => { d.open = true; d.dataset.o = 1; }))
  .observe(document, { childList: true, subtree: true });"""

with sync_playwright() as p:
    exe = '/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None
    b = p.chromium.launch(executable_path=exe, args=['--no-sandbox'])
    for name, vp, mobile in [('mobil', {'width': 390, 'height': 844}, True), ('masaustu', {'width': 1280, 'height': 860}, False)]:
        for scheme in (['light', 'dark'] if mobile else ['light']):
            ctx = b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, color_scheme=scheme, service_workers='block')
            # Dış ağ yok: çevrimiçi öneri sessizce atlanmalı
            ctx.route(lambda u: not u.startswith(BASE), lambda r: r.abort())
            page = ctx.new_page(); attach(page, f'{name}-{scheme}')
            for r in ROUTES:
                page.goto(BASE + '#/' + r); page.wait_for_timeout(450)
                page.screenshot(path=f'{SHOTS}/{name}-{scheme}-{r.replace("/", "_")}.png', full_page=True)
            ctx.close()

    # --- Akış testi (mobil)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
    ctx.add_init_script(OPEN_DETAILS)
    ctx.route(lambda u: not u.startswith(BASE), lambda r: r.abort())
    page = ctx.new_page(); attach(page, 'akis')
    page.goto(BASE + '#/bugun'); page.wait_for_timeout(500)
    page.on('dialog', lambda d: d.accept())
    def st():
        page.wait_for_timeout(300)
        return page.evaluate("JSON.parse(localStorage.getItem('yokdil.v1')||'{}')")
    page.wait_for_timeout(300)
    s = st()
    seeded = [c for c in s.get('cards', {}).values() if c['id'].startswith('s:')]
    check(len(seeded) > 0, f'seed kartları eklendi ({len(seeded)})')
    notes = list(s.get('notes', {}).values())
    check(len(notes) > 0, f'seed kural notları eklendi ({len(notes)})')
    page.reload(); page.wait_for_timeout(500)
    check(len([c for c in st()['cards'].values() if c['id'].startswith('s:')]) == len(seeded), 'seed tekrar eklenmiyor')

    # Manuel kart ekle
    page.goto(BASE + '#/kartlar/ekle'); page.wait_for_timeout(300)
    inputs = page.locator('main input')
    inputs.nth(0).fill('corrosion'); inputs.nth(1).fill('korozyon'); inputs.nth(2).fill('rust, decay')
    page.locator('main select').select_option('Ikigai'); page.locator('main input[placeholder=sayfa]').fill('42')
    page.click('text=Ekle >> nth=-1'); page.wait_for_timeout(400)
    s = st()
    card = next((c for c in s['cards'].values() if c.get('word') == 'corrosion'), None)
    check(card is not None and card.get('source') == 'Ikigai' and card.get('page') == '42', 'manuel kart eklendi (kaynak+sayfa)')

    # Tekrar oturumu: tüm kartları "İyi" ile geç (ilk kart "Tekrar")
    page.goto(BASE + '#/kartlar/yeni'); page.wait_for_timeout(400)
    page.screenshot(path=f'{SHOTS}/akis-kart-on.png')
    first = True
    for i in range(60):
        if page.locator('button:has-text("Göster")').count() == 0: break
        page.click('button:has-text("Göster")')
        if i == 0: page.screenshot(path=f'{SHOTS}/akis-kart-arka.png')
        page.click('.g-again' if first else '.g-good'); first = False
        page.wait_for_timeout(60)
    s = st()
    reviewed = [c for c in s['cards'].values() if c.get('reps', 0) > 0]
    check(len(reviewed) > 0, f'kartlar tekrar edildi ({len(reviewed)})')
    day = next(iter(s['days'].values()), {})
    check(day.get('reviews', 0) > 0, f'gün kaydı: {day.get("reviews")} tekrar, {day.get("newDone")} yeni')

    page.goto(BASE + '#/eksikler'); page.wait_for_timeout(400)
    txt = page.inner_text('main')
    learning = re.search(r'Öğreniliyor (\d+)', page.locator('section.card').nth(1).inner_text()).group(1)
    check(int(learning) > 0, f'panelde öğreniliyor/olgun sayısı: {learning}')
    page.screenshot(path=f'{SHOTS}/akis-panel-kart.png', full_page=True)

    # Gramer: yanlış cevap → hata kutusu
    page.goto(BASE + '#/gramer/gunluk'); page.wait_for_timeout(400)
    wrong = False
    for i in range(12):
        if page.locator('.opt').count() == 0: break
        page.locator('.opt').nth(i % 5).click(); page.wait_for_timeout(80)
        if page.locator('.opt.wrong').count():
            wrong = True; page.wait_for_timeout(300); page.screenshot(path=f'{SHOTS}/akis-gramer-yanlis.png')
            print('     (Konuyu aç linki: %s)' % ('var' if page.locator('a:has-text("Konuyu aç")').count() else 'yok - bu konunun dersi yok'))
            break
        page.click('button:has-text("Sonraki"), button:has-text("Bitir")'); page.wait_for_timeout(80)
    check(wrong, 'gramer sorusu yanlış cevaplandı')
    s = st()
    ms = [m for m in s['mistakes'].values() if not m.get('solved')]
    check(len(ms) == 1 and ms[0]['kind'] == 'gramer', f'hata kutusuna düştü: {[m["id"] for m in ms]}')
    page.goto(BASE + '#/gramer'); page.wait_for_timeout(300)
    check('açık' not in page.inner_text('main') and 'hata' in page.inner_text('main').lower(), 'Gramer ekranı: birikmiş hata sayısı yok, yalnız bugünkü tekrar')
    check('Kural notlarım' in page.inner_text('main'), 'Kural notlarım görünüyor')
    page.fill('main textarea', 'Test notu: whereas = oysa'); page.click('button:has-text("Not ekle")'); page.wait_for_timeout(200)
    check(any('whereas' in (n.get('text') or '') for n in st()['notes'].values()), 'kural notu eklendi')

    # Alıştırma: yanlış → aynı hata kutusu
    page.goto(BASE + '#/alistirma/cloze'); page.wait_for_timeout(400)
    for i in range(10):
        if page.locator('.opt').count() == 0: break
        page.locator('.opt').nth(4).click(); page.wait_for_timeout(60)
        if page.locator('.opt.wrong').count(): break
        page.click('button:has-text("Sonraki"), button:has-text("Bitir")'); page.wait_for_timeout(60)
    check(any(m.get('kind') == 'drill' for m in st()['mistakes'].values()), 'alıştırma yanlışı hata kutusunda')

    # Okuma: kelimeye dokun → panel → karta ekle; öbek seçimi
    page.goto(BASE + '#/okuma'); page.wait_for_timeout(300)
    page.locator('a[href^="#/okuma/p/"]').first.click(); page.wait_for_timeout(500)
    ws = page.locator('.reader .w')
    check(ws.count() > 20, f'metin kelimelere bölündü ({ws.count()})')
    target = ws.nth(3); word = target.inner_text()
    target.click(); page.wait_for_timeout(1200)
    check(page.locator('.sheet:not(.hidden)').count() == 1, f'alt panel açıldı ({word})')
    ctxv = page.locator('.sheet textarea').input_value()
    check(len(ctxv) > len(word), 'bağlam cümlesi otomatik dolu')
    page.screenshot(path=f'{SHOTS}/akis-okuma-panel.png')
    page.locator('.sheet input').nth(1).fill('test anlam')
    page.click('.sheet button.primary'); page.wait_for_timeout(300)
    check(page.locator('.reader .w.saved').count() >= 1, 'kaydedilen kelime vurgulandı')
    # Öbek: Öbek düğmesi → iki dokunuş
    page.click('button:has-text("Öbek")')
    ws.nth(8).click(); ws.nth(10).click(); page.wait_for_timeout(600)
    ph = page.locator('.sheet .wordin').input_value()
    check(len(ph.split()) >= 2, f'öbek seçildi: "{ph}"')
    page.click('.sheet button.primary'); page.wait_for_timeout(300)
    check(any(' ' in (c.get('word') or '') and c.get('ctx') for c in st()['cards'].values()), 'öbek karta eklendi (bağlamlı)')
    # Uzun basma ile öbek (masaüstü fare benzetimi)
    box = ws.nth(14).bounding_box()
    page.mouse.move(box['x'] + 3, box['y'] + 5); page.mouse.down(); page.wait_for_timeout(650); page.mouse.up()
    ws.nth(16).click(); page.wait_for_timeout(500)
    ph2 = page.locator('.sheet .wordin').input_value()
    check(len(ph2.split()) >= 2, f'uzun basma öbeği: "{ph2}"')
    page.screenshot(path=f'{SHOTS}/akis-okuma-obek.png')
    page.click('.sheet .icon-x')

    # Kendi metnini yapıştır
    page.goto(BASE + '#/okuma/yeni'); page.wait_for_timeout(300)
    page.fill('input[placeholder="Başlık"]', 'Ikigai bölüm 1')
    page.locator('main select').select_option('Ikigai'); page.fill('input[placeholder="Sayfa"]', '12')
    page.fill('main textarea', 'According to Japanese people, everyone has an ikigai. Finding it requires patience.\n\nOur ikigai is hidden deep inside each of us.')
    page.click('button:has-text("Kaydet ve oku")'); page.wait_for_timeout(400)
    check(page.locator('.reader .w').count() > 10, 'kendi metni açıldı')
    page.goto(BASE + '#/okuma'); page.wait_for_timeout(300)
    check('Ikigai bölüm 1' in page.inner_text('main'), 'metin listede kalıyor')

    # Deneme sonucu gir
    page.goto(BASE + '#/eksikler'); page.wait_for_timeout(300)
    page.click('button:has-text("Deneme sonucu gir")')
    nums = page.locator('table.mock input')
    check(nums.count() == 16, f'8 bölüm × D/Y ({nums.count()} kutu)')
    for k in range(8): nums.nth(k * 2).fill(str([12, 6, 7, 3, 4, 3, 3, 8][k])); nums.nth(k * 2 + 1).fill('2')
    est = page.locator('table.mock + p b').inner_text()
    check(est.replace(',', '.') == '57.5', f'tahmini puan 46×1,25 = {est}')
    page.click('button:has-text("Kaydet")'); page.wait_for_timeout(300)
    page.screenshot(path=f'{SHOTS}/akis-panel-deneme.png', full_page=True)
    check(len(st()['mocks']) == 1, 'deneme kaydedildi')


    # --- Alıştırma menüsü: tüm tipler + ilerleme
    page.goto(BASE + '#/alistirma'); page.wait_for_timeout(400)
    lis = page.locator('main ul.list li')
    check(lis.count() == 9, f'alıştırma menüsünde 9 tip ({lis.count()})')
    check('Cümlede boşluk' in page.inner_text('main') and 'Paragraf (okuma)' in page.inner_text('main'), 'bosluk + paragraf tipleri menüde')
    check(page.locator('.prog').count() == 9, 'tip başına ilerleme çubuğu')
    check(page.locator('.tabs a.active span').inner_text() == 'Sorular', 'alt menü: Sorular sekmesi aktif')
    page.screenshot(path=f'{SHOTS}/akis-alistirma-menu.png', full_page=True)
    page.goto(BASE + '#/alistirma/paragraf'); page.wait_for_timeout(400)
    check(page.locator('.stem .reader .w').count() > 10, 'paragraf alıştırması: metin dokunulabilir')

    # --- Gramer dersleri
    page.goto(BASE + '#/dersler'); page.wait_for_timeout(400)
    n_l = page.locator('main ul.list li').count()
    check(n_l >= 2, f'ders listesi ({n_l})')
    page.locator('main ul.list li a').first.click(); page.wait_for_timeout(400)
    check(page.locator('.lesson').count() >= 1, 'ders blokları görünüyor')
    check(page.locator('.lesson b, .lesson table, .lesson li').count() > 0, 'markdown (kalın/liste/tablo) çevrildi')
    check('<script' not in page.inner_html('.lesson'), 'markdown güvenli')
    page.screenshot(path=f'{SHOTS}/akis-ders.png', full_page=True)
    if page.locator('button:has-text("Teste başla")').count():
        page.click('button:has-text("Teste başla")'); page.wait_for_timeout(200)
        for i in range(10):
            if page.locator('.opt').count() == 0: break
            page.locator('.opt').nth(i % 5).click(); page.wait_for_timeout(60)
            if page.locator('.opt.wrong').count(): break
            page.click('button:has-text("Sonraki"), button:has-text("Bitir")'); page.wait_for_timeout(60)
        check(any(k.startswith('ders:') for k in st()['mistakes']), 'ders testi yanlışı hata kutusunda')
    page.goto(BASE + '#/dersler'); page.wait_for_timeout(300)
    page.locator('main ul.list li a').first.click(); page.wait_for_timeout(300)
    page.click('button:has-text("Okudum")'); page.wait_for_timeout(300)
    check(page.locator('main ul.list li.done').count() >= 1, 'okundu işareti')

    # --- Çıkmış sorular: paket yok → açıklama; yükle → deneme
    page.goto(BASE + '#/cikmis'); page.wait_for_timeout(400)
    check(page.locator('a[href*="osym.gov.tr/TR,23801"]').count() == 1, 'paket yokken ÖSYM linki')
    page.screenshot(path=f'{SHOTS}/akis-cikmis-bos.png', full_page=True)
    page.set_input_files('main input[type=file]', '/tmp/ornek-paket.json'); page.wait_for_timeout(800)
    check('Örnek Deneme 1' in page.inner_text('main'), 'paket yüklendi (IndexedDB)')
    check('Diyalog' not in page.inner_text('main'), 'diyalog tipi varsayılan gizli')
    page.screenshot(path=f'{SHOTS}/akis-cikmis-liste.png', full_page=True)
    page.reload(); page.wait_for_timeout(600)
    check('Örnek Deneme 1' in page.inner_text('main'), 'paket yeniden açılışta duruyor')
    page.click('a:has-text("Tam deneme")'); page.wait_for_timeout(500)
    check(page.locator('.timer').inner_text().startswith('2:59') or page.locator('.timer').inner_text().startswith('3:00'), f'180 dk sayaç ({page.locator(".timer").inner_text()})')
    # Soru 1: doğru (B), soru 2: yanlış (A), soru 21: işaretle boş, kalan: A
    page.locator('.opt').nth(1).click(); page.click('button:has-text("Sonraki")')
    page.locator('.opt').nth(0).click(); page.click('button:has-text("Bölüm sonu")'); page.wait_for_timeout(150)
    check(page.locator('.interim').count() == 1 and 'Bölüm sonu' in page.inner_text('.interim'), 'sınav: bölüm sonu ara ekranı'); page.click('button:has-text("Sonraki bölüm")')
    check(page.locator('.stem .reader .w').count() > 5, 'cloze metni dokunulabilir')
    check(page.locator('.chip:has-text("cevap kesin değil")').count() == 0, 'doğrulanmış soruda etiket yok')
    page.click('button:has-text("İşaretle")'); page.click('button:has-text("Sonraki")')
    check(page.locator('.chip:has-text("cevap kesin değil")').count() == 1, 'keySource=claude etiketi')
    # Metinde kelimeye dokun → karta ekle
    page.locator('.stem .reader .w').nth(0).click(); page.wait_for_timeout(800)
    check(page.locator('#wordSheet:not(.hidden)').count() == 1, 'çıkmış metinde kelime paneli')
    page.click('#wordSheet button.primary'); page.wait_for_timeout(200)
    page.click('button:has-text("Optik")'); page.wait_for_timeout(200)
    check(page.locator('.optik button.flag').count() == 1 and page.locator('.optik button.ans').count() == 2, 'optik form: 2 cevap, 1 işaret')
    page.screenshot(path=f'{SHOTS}/akis-cikmis-sinav.png', full_page=True)
    page.click('.optik button:has-text("66")'); page.wait_for_timeout(200)
    page.locator('.opt').nth(1).click()
    page.click('.readbar button:has-text("Bitir")'); page.wait_for_timeout(800)
    txt = page.inner_text('main')
    check('#/cikmis/sonuc/' in page.url, 'sonuç ekranı')
    check('2,5' in txt, 'tahmini puan 2 doğru × 1,25 = 2,5')
    page.screenshot(path=f'{SHOTS}/akis-cikmis-sonuc.png', full_page=True)
    s = st()
    xm = [m for m in s['mocks'].values() if m.get('src') == 'cikmis']
    check(len(xm) == 1 and xm[0]['score'] == 2.5, 'sonuç deneme geçmişine yazıldı')
    check(xm and xm[0]['sections']['bosluk'] == {'d': 1, 'y': 1, 'b': 0, 'n': 2}, f'bölüm bazında D/Y/B: {xm[0]["sections"].get("bosluk") if xm else None}')
    check('ornek-1:2' in s['mistakes'], 'çıkmış yanlışı hata kutusunda (examId:n)')
    raw = page.evaluate("localStorage.getItem('yokdil.v1')")
    check('Water freezes' not in raw and 'expansion joints' not in raw and 'Because' not in raw.split('"cards"')[0], 'soru metinleri localStorage/senkrona girmiyor')
    r = page.evaluate("import('./js/qbank.js').then(m => m.resolve('ornek-1:2')).then(x => x && x.q)")
    check(r and 'theory is new' in r, 'hata kutusu çıkmış soruyu IndexedDB\'den çözüyor')
    # Hata kutusu yarın: zamanı 1 gün ileri al
    page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('yokdil.v1')); for (const m of Object.values(s.mistakes)) m.due = '2000-01-01'; for (const d of Object.values(s.days || {})) delete d.hset; localStorage.setItem('yokdil.v1', JSON.stringify(s)); })()")
    page.goto(BASE + '#/gramer/hata'); page.reload(); page.wait_for_timeout(800)
    check(page.locator('.opt').count() == 5, 'hata kutusu soruları açıyor (gramer+alıştırma+ders+çıkmış)')
    page.screenshot(path=f'{SHOTS}/akis-hata-kutusu.png', full_page=True)
    page.goto(BASE + '#/cikmis/tip/paragraf'); page.wait_for_timeout(500)
    check(page.locator('.stem .reader .w').count() > 5, 'tip modu: paragraf metni')
    page.locator('.opt').nth(0).click(); page.wait_for_timeout(200)
    check(page.locator('.explain:not(.hidden)').count() == 1, 'tip modu: anında geri bildirim')
    page.goto(BASE + '#/eksikler'); page.wait_for_timeout(400)
    page.click('.seg button:has-text("Çıkmış")'); page.wait_for_timeout(200)
    check('Cloze' in page.inner_text('main') or 'Cümlede' in page.inner_text('main'), 'panel tip doğruluğu: çıkmış filtresi')
    page.screenshot(path=f'{SHOTS}/akis-panel-cikmis.png', full_page=True)
    # Ayar: diyalog göster
    page.goto(BASE + '#/ayarlar'); page.wait_for_timeout(300)
    page.click('text=Diyalog sorularını da göster'); page.wait_for_timeout(200)
    page.goto(BASE + '#/cikmis'); page.wait_for_timeout(400)
    check('Diyalog' in page.inner_text('main'), 'ayarla diyalog görünür')

    # Bugün: görev tikleme + yoğun gün
    page.goto(BASE + '#/bugun'); page.wait_for_timeout(300)
    page.click('button:has-text("Yoğun gün")'); page.wait_for_timeout(200)
    check(page.locator('.tasks li').count() == 2, 'yoğun gün: 2 görev')
    page.screenshot(path=f'{SHOTS}/akis-bugun-yogun.png', full_page=True)

    # Ayarlar: tema koyu, dışa aktar
    page.goto(BASE + '#/ayarlar'); page.wait_for_timeout(300)
    page.click('.seg button:has-text("Koyu")'); page.wait_for_timeout(200)
    check(page.evaluate("document.documentElement.dataset.theme") == 'dark', 'elle koyu tema')
    with page.expect_download() as dl: page.click('button:has-text("Yedeği indir")')
    data = json.load(open(dl.value.path()))
    check('cards' in data['data'], 'dışa aktarma JSON')
    page.screenshot(path=f'{SHOTS}/akis-ayarlar-koyu.png', full_page=True)
    ctx.close()

    # ================= v3 akışları (temiz bağlam) =================
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
    ctx.add_init_script(OPEN_DETAILS)
    ctx.route(lambda u: not u.startswith(BASE), lambda r: r.abort())
    page = ctx.new_page(); attach(page, 'v3')
    page.on('dialog', lambda d: d.accept())
    page.goto(BASE + '#/bugun'); page.wait_for_timeout(600)
    def st():
        page.wait_for_timeout(300)
        return page.evaluate("JSON.parse(localStorage.getItem('yokdil.v1')||'{}')")
    def ev(js): return page.evaluate(js)
    def drag(sel, dx):
        bb = page.locator(sel).bounding_box()
        x, y = bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2
        page.mouse.move(x, y); page.mouse.down()
        for k in range(1, 9): page.mouse.move(x + dx * k / 8, y + 2)
        page.mouse.up(); page.wait_for_timeout(250)
    check(page.locator('a[href="#/kartlar/tara"]').count() >= 1, 'Bugün: "Kelime tara" girişi')
    page.screenshot(path=f'{SHOTS}/v3-bugun.png', full_page=True)

    # 1) "Biliyorum, gösterme"
    page.goto(BASE + '#/kartlar/yeni'); page.wait_for_timeout(600)
    left0 = page.locator('.flash .small.muted').first.inner_text().split(' ')[0]
    w0 = page.locator('.fword').inner_text()
    check(page.locator('button:has-text("Biliyorum, gösterme")').count() == 1, 'yeni kartta "Biliyorum, gösterme"')
    page.screenshot(path=f'{SHOTS}/v3-kart-biliyorum.png')
    page.click('button:has-text("Biliyorum, gösterme")'); page.wait_for_timeout(500)
    s = st()
    kc = [c for c in s['cards'].values() if c.get('word') == w0]
    check(kc and kc[0]['state'] == 'known', f'"{w0}" known oldu')
    day = next(iter(s.get('days', {}).values()), {})
    check(not day.get('newDone'), 'biliyorum günlük yeni kotasını yemedi')
    left1 = page.locator('.flash .small.muted').first.inner_text().split(' ')[0]
    check(left0 == left1 and page.locator('.fword').inner_text() != w0, f'yerine sıradaki kelime geldi ({left0} → {left1})')
    check(not any(c['id'] == kc[0]['id'] for c in ev("import('./js/srs.js').then(m => m.dueCards())")), 'known kart tekrar kuyruğunda değil')
    # Tek el akışı: karta dokun → göster, sağa kaydır → İyi
    wcur = page.locator('.fword').inner_text()
    page.locator('.flashcard .fword').click(); page.wait_for_timeout(200)
    check(page.locator('.grades:not(.hidden)').count() == 1, 'karta dokununca arka yüz açıldı')
    drag('.flashcard', 160)
    s = st()
    cc = [c for c in s['cards'].values() if c.get('word') == wcur]
    check(cc and cc[0].get('reps') == 1 and cc[0]['state'] == 'review' and cc[0].get('hist') == ['g'], f'sağa kaydırma = İyi ({wcur})')
    # Klavye: boşluk + 1 (Tekrar)
    page.keyboard.press(' '); page.wait_for_timeout(100); page.keyboard.press('1'); page.wait_for_timeout(300)
    check(any(c.get('hist') == ['a'] for c in st()['cards'].values()), 'klavye: boşluk + 1 = Tekrar')

    # Liste: Bildiklerim filtresi + geri al
    page.goto(BASE + '#/kartlar/liste'); page.wait_for_timeout(400)
    page.locator('main select').nth(1).select_option('known'); page.wait_for_timeout(200)
    check(page.locator('main ul.list li').count() == 1 and w0 in page.inner_text('main ul.list'), 'Bildiklerim filtresi')
    page.screenshot(path=f'{SHOTS}/v3-liste-bildiklerim.png', full_page=True)
    page.click('main ul.list button:has-text("Geri al")'); page.wait_for_timeout(300)
    kc = [c for c in st()['cards'].values() if c.get('word') == w0]
    check(kc[0]['state'] == 'new' and kc[0].get('front'), 'geri al → yeni kuyruğun önü')

    # 2) Hızlı tarama
    page.goto(BASE + '#/kartlar'); page.wait_for_timeout(400)
    check(page.locator('a[href="#/kartlar/tara"]').count() == 1, 'Kartlar: "Kelime tara" girişi')
    page.screenshot(path=f'{SHOTS}/v3-kartlar-ana.png', full_page=True)
    page.goto(BASE + '#/kartlar/tara'); page.wait_for_timeout(500)
    check(page.locator('.scan-card').count() == 1 and '1 / 50' in page.inner_text('.scan-card'), 'tarama: 50\'lik grup')
    check(page.locator('.scan-tr.hidden').count() == 1, 'anlam gizli')
    page.click('button:has-text("Anlamı gör")')
    page.screenshot(path=f'{SHOTS}/v3-tarama.png')
    scanned = []
    for act in ['y', 'y', 'n', 'y', 'n']:
        scanned.append((page.locator('.scan-card .fword').inner_text(), act))
        page.click('.scan-btns .yes' if act == 'y' else '.scan-btns .no'); page.wait_for_timeout(120)
    scanned.append((page.locator('.scan-card .fword').inner_text(), 'y')); drag('.scan-card', 170)
    scanned.append((page.locator('.scan-card .fword').inner_text(), 'n')); drag('.scan-card', -170)
    check('8 / 50' in page.inner_text('.scan-card'), 'kaydırma ile tarama (sağ/sol)')
    page.click('button:has-text("Geri al")'); page.wait_for_timeout(200)
    check('7 / 50' in page.inner_text('.scan-card'), 'tarama: geri al')
    scanned.pop()
    s = st()
    byw = {c.get('word'): c for c in s['cards'].values()}
    okk = all((byw.get(w, {}).get('state') == ('known' if a == 'y' else 'new')) for w, a in scanned)
    check(okk, f'tarama sonuçları kaydedildi ({len(scanned)})')
    q = ev("import('./js/srs.js').then(m => m.newQueue()).then(q => q.map(x => x.card ? x.card.word : x.word.word))")
    nos = [w for w, a in scanned if a == 'n']
    check(q[:len(nos) + 1][1:] == nos or q[:len(nos)] == nos or set(nos) <= set(q[:len(nos) + 1]), f'bilmiyorum → yeni kuyruğun önünde: {q[:4]}')
    for k in range(44):
        page.click('.scan-btns .yes'); page.wait_for_timeout(40)
    check('50 kelime daha' in page.inner_text('main') and page.locator('.scan-more.primary').count() == 1, 'tarama grup sonu özeti (ana düğme "Devam")')
    page.screenshot(path=f'{SHOTS}/v3-tarama-sonu.png', full_page=True)

    # 3) Mezuniyet: 7 öğrenilmiş kart → haftada en fazla 5 kontrol; bu hafta tekrar edilen gelmez
    ev("""import('./js/store.js').then(m => { const now = Date.now();
      for (let i = 0; i < 7; i++) m.put('cards', { id: 'gt' + i, word: 'gradword' + i, tr: 'x', state: 'review', interval: 60, ease: 2.5,
        hist: ['g','g','g'], due: now - 86400000, lastReview: now - 40 * 86400000, reps: 6 });
      m.put('cards', { id: 'gtr', word: 'gradrecent', tr: 'x', state: 'review', interval: 60, hist: ['g','g','g'], due: now - 1000, lastReview: now });
      m.put('cards', { id: 'gmat', word: 'matureword', tr: 'x', state: 'review', interval: 30, hist: ['g','g','g'], due: now - 1000, lastReview: now - 30 * 86400000 }); })""")
    page.reload(); page.wait_for_timeout(600)
    due = ev("import('./js/srs.js').then(m => m.dueCards().map(c => c.id))")
    gt = [d for d in due if d.startswith('gt')]
    check(len([d for d in gt if d != 'gtr']) == 5 and 'gtr' not in due, f'öğrenilmiş kartlardan haftalık 5 kontrol ({len(gt)})')
    check('gmat' in due, 'olgun (öğrenilmemiş) kart normal kuyrukta')
    page.goto(BASE + '#/eksikler'); page.wait_for_timeout(500)
    txt = page.inner_text('main')
    check('çalıştığın kelime' in txt and 'hedef 2000' in txt and page.locator('.goal-line').count() == 1, 'Eksikler: çalıştığın kelime + sağlam + ara hedef çizgisi')
    page.screenshot(path=f'{SHOTS}/v3-eksikler-kelime.png', full_page=True)

    # 4a) Yanlış cevap → otomatik kart
    before = len(st()['cards'])
    page.goto(BASE + '#/gramer/konu/kelime'); page.wait_for_timeout(500)
    item = None
    for i in range(8):
        if page.locator('.opt').count() == 0: break
        page.locator('.opt').nth(4 if i % 2 else 3).click(); page.wait_for_timeout(150)
        if page.locator('.opt.wrong').count():
            item = True; break
        page.click('button:has-text("Sonraki"), button:has-text("Bitir")'); page.wait_for_timeout(100)
    page.wait_for_timeout(400)
    check(item and 'kelime karta eklendi' in (page.locator('#toast').inner_text() or ''), f'toast: {page.locator("#toast").inner_text() if page.locator("#toast").count() else "-"}')
    page.screenshot(path=f'{SHOTS}/v3-otomatik-kart.png')
    s = st()
    hc = [c for c in s['cards'].values() if 'hata' in (c.get('tags') or [])]
    right = [c for c in hc if c.get('ctx')]
    check(len(hc) >= 1 and len(s['cards']) > before, f'yanlıştan kart eklendi ({[c["word"] for c in hc]})')
    if right:
        check(right[0]['word'].lower() in right[0]['ctx'].lower() and '----' not in right[0]['ctx'], f'bağlam: doğru kelime boşlukta: {right[0]["ctx"]}')
    else:  # doğru şıkkın kartı zaten vardı → sadece yanlış şık eklenir
        check(any('doğrusu' in (c.get('note') or '') for c in hc), 'yanlış şık kartı (doğru şık zaten kartta)')
    # Ayardan kapat → eklenmez
    ev("import('./js/store.js').then(m => m.setSetting('autoAdd', false))")
    n1 = len(st()['cards'])
    page.goto(BASE + '#/bugun'); page.wait_for_timeout(200)
    page.goto(BASE + '#/gramer/konu/kelime'); page.wait_for_timeout(400)
    if page.locator('button:has-text("Baştan başla")').count(): page.click('button:has-text("Baştan başla")'); page.wait_for_timeout(200)
    for i in range(8):
        if page.locator('.opt').count() == 0: break
        page.locator('.opt').nth(2).click(); page.wait_for_timeout(100)
        if page.locator('.opt.wrong').count(): break
        page.click('button:has-text("Sonraki"), button:has-text("Bitir")'); page.wait_for_timeout(80)
    page.wait_for_timeout(400)
    check(len(st()['cards']) == n1, 'ayar kapalıyken otomatik kart yok')
    ev("import('./js/store.js').then(m => m.setSetting('autoAdd', true))")
    # Anlam eksik rozeti
    ev("import('./js/store.js').then(m => m.put('cards', { id: 'cnox', word: 'zzunknownword', tr: '', state: 'new', source: 'Hata', tags: ['hata'], createdAt: Date.now() }))")
    page.goto(BASE + '#/kartlar/liste'); page.wait_for_timeout(300)
    page.locator('main select').nth(1).select_option('eksik'); page.wait_for_timeout(200)
    check(page.locator('main ul.list .chip:has-text("anlam eksik")').count() >= 1, '"anlam eksik" rozeti + filtre')

    # 4b) Okumada vurgulama + parça sonu
    page.goto(BASE + '#/okuma'); page.wait_for_timeout(400)
    check(page.locator('.suggest').count() == 1, 'okuma: önerilen parça kartı')
    page.locator('main ul.list a[href^="#/okuma/p/"]').first.click(); page.wait_for_timeout(800)
    unk = page.locator('.reader .w.unk').count()
    check(unk > 0, f'bilinmeyen çekirdek kelimeler işaretli ({unk})')
    # Bilinen (known) kelime işaretlenmez
    first_unk = page.locator('.reader .w.unk').first.inner_text()
    page.screenshot(path=f'{SHOTS}/v3-okuma-vurgu.png')
    page.wait_for_timeout(23000)  # gerçekçi hız (≤600 k/dk) için
    page.click('button:has-text("Soruları çöz")'); page.wait_for_timeout(200)
    for i in range(6):
        if page.locator('.opt:not([disabled])').count() == 0: break
        page.locator('.opt').nth(0).click(); page.wait_for_timeout(120)
        page.click('button:has-text("Sonraki"), button:has-text("Bitir")'); page.wait_for_timeout(150)
    page.wait_for_timeout(500)
    txt = page.inner_text('main')
    check('Kartında olmayan' in txt, 'parça sonu: "Kartında olmayan X kelime"')
    check('kelime/dk' in txt, 'okuma hızı gösterildi')
    rec = [r for r in st()['progress'].values() if r.get('kind') == 'read']
    check(rec and rec[0]['wpm'] > 0 and rec[0]['total'] >= 1, f'okuma kaydı: {rec[0]["wpm"] if rec else None} k/dk, {rec[0]["right"] if rec else ""}/{rec[0]["total"] if rec else ""}')
    page.locator('.newwords .chip.pick').first.click()
    page.screenshot(path=f'{SHOTS}/v3-okuma-sonu.png', full_page=True)
    n2 = len(st()['cards'])
    page.click('button:has-text("Seçilenleri ekle (1)")'); page.wait_for_timeout(300)
    s = st()
    check(len(s['cards']) == n2 + 1 and any(c.get('source') == 'Okuma' and c.get('ctx') and c.get('front') for c in s['cards'].values()), 'parça sonu: seçilen kelime karta eklendi')
    # Ayar: vurgu kapalı
    ev("import('./js/store.js').then(m => m.setSetting('readHl', false))")
    page.reload(); page.wait_for_timeout(700)
    check(page.locator('.reader .w.unk').count() == 0, 'ayarla vurgu kapanıyor')
    ev("import('./js/store.js').then(m => m.setSetting('readHl', true))")
    page.goto(BASE + '#/eksikler'); page.wait_for_timeout(400)
    check('kelime/dk ortalama' in page.inner_text('main'), 'Eksikler: okuma hızı')

    # 5) Boşluk doldurma oyunu
    page.goto(BASE + '#/kartlar/bosluk'); page.wait_for_timeout(400)
    pool = ev("import('./js/views/gap.js').then(m => m.gapPool().length)")
    if pool < 20:
        check('açılır' in page.inner_text('main'), f'20 kart altında kilitli ({pool})')
        ev("""fetch('data/words.json').then(r => r.json()).then(ws => import('./js/store.js').then(m => {
          let n = 0; const now = Date.now();
          for (const w of ws) { if (n >= 30) break; if (/\\s/.test(w.word) || !w.ex || !new RegExp('\\\\b' + w.word + '\\\\b', 'i').test(w.ex)) continue;
            if (m.get('cards', 'w:' + w.id)) continue;
            m.put('cards', { id: 'w:' + w.id, wid: w.id, word: w.word, tr: w.tr, pos: w.pos, ex: w.ex, state: 'review', interval: 4, ease: 2.5, reps: 2, due: now + 3 * 86400000, lastReview: now - 86400000, hist: ['g','g'] }); n++; }
        }))""")
        page.wait_for_timeout(400)
    page.goto(BASE + '#/kartlar'); page.wait_for_timeout(300)
    check(page.locator('a[href="#/kartlar/bosluk"]').count() == 1, 'Kartlar: boşluk doldurma açık (≥20 kart)')
    DUEJS = "Object.values(JSON.parse(localStorage.getItem('yokdil.v1')).cards).filter(c => ['learning','relearn','review'].includes(c.state) && c.due <= Date.now() + 1000).length"
    page.wait_for_timeout(400)
    due_before = ev(DUEJS)
    page.goto(BASE + '#/kartlar/bosluk'); page.wait_for_timeout(800)
    check(page.locator('.opt').count() == 5 and '----' in page.inner_text('.q'), 'boşluk oyunu: 5 şık, ---- cümle')
    page.screenshot(path=f'{SHOTS}/v3-bosluk.png')
    wrongId = None
    for i in range(10):
        if page.locator('.opt').count() == 0: break
        qtext = page.inner_text('.q')
        page.locator('.opt').nth(0).click(); page.wait_for_timeout(120)
        if page.locator('.opt.wrong').count():
            wrongId = True; break
        page.click('button:has-text("Sonraki"), button:has-text("Bitir")'); page.wait_for_timeout(100)
    page.wait_for_timeout(300)
    page.screenshot(path=f'{SHOTS}/v3-bosluk-yanlis.png')
    s = st()
    due_after = ev(DUEJS)
    check(wrongId and due_after == due_before + 1, f'boşluk yanlışı → kart bugüne çekildi ({due_before} → {due_after})')
    check(not any(m.startswith('gap:') for m in s.get('mistakes', {})), 'boşluk oyunu gramer hata kutusunu kirletmiyor')
    ctx.close()

    # forms.json: kart arka yüzü (extra) + okuma panelinde "Halleri:"
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
    ctx.add_init_script(OPEN_DETAILS)
    ctx.route(lambda u: not u.startswith(BASE), lambda r: r.abort())
    page = ctx.new_page(); attach(page, 'forms')
    page.goto(BASE + '#/bugun'); page.wait_for_timeout(600)
    fw = page.evaluate("""fetch('data/forms.json').then(r => r.ok ? r.json() : {}).then(f => import('./js/store.js').then(m => {
      const k = Object.keys(f).find(k => !k.includes(' ') && f[k].family && f[k].family.length && f[k].ex && f[k].ex.length);
      if (!k) return null;
      m.put('cards', { id: 'cf', word: k, tr: 'deneme', state: 'review', interval: 2, ease: 2.5, reps: 1, due: Date.now() - 1000, hist: ['g'] });
      return k; }))""")
    if fw:
        page.wait_for_timeout(300)
        page.goto(BASE + '#/kartlar/calis'); page.wait_for_timeout(700)
        check(page.locator('.fword').inner_text() == fw, f'forms kartı ilk sırada ({fw})')
        page.click('button:has-text("Göster")'); page.wait_for_timeout(300)
        check(page.locator('.back .extra .exrow').count() >= 1 and 'örnek cümleler' in page.inner_text('.back').lower(), 'kart arkası: örnek cümleler (forms.json)')
        check(page.locator('.back .extra .famrow').count() >= 1, 'kart arkası: diğer halleri')
        page.screenshot(path=f'{SHOTS}/kart-arka-ornek.png', full_page=True)
        page.goto(BASE + '#/okuma'); page.wait_for_timeout(300)
        page.goto(BASE + '#/okuma/p/p001'); page.wait_for_timeout(700)
        got = ''
        ws = page.locator('.reader .w.unk')
        for i in range(min(15, ws.count())):
            ws.nth(i).click(); page.wait_for_timeout(500)
            got = page.locator('.sheet .formsline').inner_text()
            if 'Halleri' in got: break
        check('Halleri:' in got, f'okuma paneli: "{got[:50]}"')
        page.screenshot(path=f'{SHOTS}/okuma-panel-halleri.png')
    else:
        check(False, 'forms.json yok')
    ctx.close()

    # ================= v4 akışları =================
    PACK = '/home/claude/private/cikmis-paket.json'
    PACK_BODY = open(PACK, 'rb').read()
    API = 'https://api.github.com/repos/zaceby14/yokdil-ozel/contents/paket.json'
    gh_calls = []
    def gh_route(route):
        req = route.request
        cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Accept, If-None-Match',
                'Access-Control-Expose-Headers': 'ETag'}
        if req.method == 'OPTIONS':
            return route.fulfill(status=204, headers=cors)
        hd = req.headers
        gh_calls.append({'auth': hd.get('authorization', ''), 'accept': hd.get('accept', ''), 'inm': hd.get('if-none-match', '')})
        if hd.get('if-none-match') == '"v1"':
            return route.fulfill(status=304, headers={**cors, 'ETag': '"v1"'})
        route.fulfill(status=200, body=PACK_BODY, headers={**cors, 'ETag': '"v1"', 'Content-Type': 'application/vnd.github.raw+json'})

    def v4ctx(vp, mobile, tag, hour=None):
        c = b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, service_workers='block')
        c.add_init_script(OPEN_DETAILS)
        c.route(lambda u: not u.startswith(BASE), lambda r: r.abort())
        c.route(API, gh_route)
        if hour is not None:
            c.add_init_script(f"Date.prototype.getHours = function () {{ return {hour}; }};")
        pg = c.new_page(); attach(pg, tag)
        pg.on('dialog', lambda d: d.accept())
        return c, pg

    ctx, page = v4ctx({'width': 390, 'height': 844}, True, 'v4-mobil', hour=10)
    def st():
        page.wait_for_timeout(250)
        return page.evaluate("JSON.parse(localStorage.getItem('yokdil.v1')||'{}')")
    def ev(js): return page.evaluate(js)
    page.goto(BASE + '#/bugun'); page.wait_for_timeout(700)

    # 2) Menü: alt çubuk 5 öğe, Dersler ayrı, Eksikler üst ikonda ve Bugün'de
    vis_tabs = page.locator('nav.tabs a:visible')
    check(vis_tabs.count() == 5 and [vis_tabs.nth(i).inner_text() for i in range(5)] == ['Bugün', 'Okuma', 'Kartlar', 'Sorular', 'Dersler'], 'mobil alt çubuk: Bugün · Okuma · Kartlar · Sorular · Dersler')
    check(page.locator('header a[href="#/eksikler"]:visible').count() == 1 and page.locator('main a[href="#/eksikler"]').count() >= 1, 'Eksikler: üst ikon + Bugün ekranı')
    page.click('nav.tabs a[href="#/dersler"]'); page.wait_for_timeout(300)
    check(page.locator('nav.tabs a.active span').inner_text() == 'Dersler', 'Dersler sekmesi aktif')
    page.screenshot(path=f'{SHOTS}/m-dersler.png', full_page=True)

    # 1) Gizli sorular: token yok → tek satır + düğme
    page.goto(BASE + '#/cikmis'); page.wait_for_timeout(400)
    check("Ayarlar'dan GitHub anahtarını gir" in page.inner_text('main') and page.locator('main a[href="#/ayarlar"]').count() == 1, 'token yok: "Soruları görmek için…" satırı + düğme')
    page.screenshot(path=f'{SHOTS}/m-cikmis-tokensiz.png', full_page=True)
    page.click('main a[href="#/ayarlar"]'); page.wait_for_timeout(300)
    check(page.locator('a[href*="scopes=gist,repo"]').count() == 1 and 'Tek anahtar' in page.inner_text('main'), 'Ayarlar: tek anahtar rehberi (gist+repo)')
    page.fill('input[type=password]', 'ghp_testtoken123')
    page.click('button:has-text("Kaydet")'); page.wait_for_timeout(2500)
    check(len(gh_calls) >= 1 and gh_calls[0]['auth'] == 'Bearer ghp_testtoken123' and gh_calls[0]['accept'] == 'application/vnd.github.raw+json', f'GitHub isteği: Bearer + raw accept ({gh_calls[:1]})')
    NEX = len(json.loads(PACK_BODY)['exams'])
    check(f'{NEX} sınav' in page.inner_text('main'), f'Ayarlar: "{NEX} sınav" indirildi')
    page.screenshot(path=f'{SHOTS}/m-ayarlar-anahtar.png', full_page=True)
    page.goto(BASE + '#/cikmis'); page.wait_for_timeout(800)
    check('2019-YÖKDİL Fen' in page.inner_text('main'), 'Çıkmış: gizli paketten sınavlar listede')
    page.screenshot(path=f'{SHOTS}/m-cikmis-gizli.png', full_page=True)
    n0 = len(gh_calls)
    page.click('button:has-text("Soruları güncelle")'); page.wait_for_timeout(1200)
    check(len(gh_calls) == n0 + 1, 'Soruları güncelle: yeni istek')
    # Açılışta günde bir: yeniden yüklemede istek yok
    page.reload(); page.wait_for_timeout(900)
    check(len(gh_calls) == n0 + 1, 'açılışta aynı gün ikinci indirme yok')
    ev("(() => { const m = JSON.parse(localStorage.getItem('yokdil.privMeta')); m.day = '2000-01-01'; localStorage.setItem('yokdil.privMeta', JSON.stringify(m)); })()")
    page.reload(); page.wait_for_timeout(1200)
    check(len(gh_calls) == n0 + 2 and gh_calls[-1]['inm'] == '"v1"', 'ertesi gün: If-None-Match ile kontrol (304)')
    raw = ev("localStorage.getItem('yokdil.v1')")
    check('intensive cultivation' not in raw, 'gizli soru metni localStorage/senkronda yok')

    # 3) Ders paneli: soru oturumundan ayrılmadan açılır, geri tuşu paneli kapatır
    page.goto(BASE + '#/gramer/gunluk'); page.wait_for_timeout(600)
    page.locator('.opt').nth(0).click(); page.wait_for_timeout(150)
    page.click('button:has-text("Sonraki")'); page.wait_for_timeout(150)
    q_before = page.inner_text('.qhead .muted')
    url_before = page.url
    page.click('.qbar .lesson-btn'); page.wait_for_timeout(500)
    check(page.locator('#sidePanel:not(.hidden)').count() == 1 and page.url == url_before, 'Ders paneli açıldı, sayfa değişmedi')
    page.screenshot(path=f'{SHOTS}/m-ders-panel.png')
    page.go_back(); page.wait_for_timeout(400)
    check(page.locator('#sidePanel.hidden').count() == 1 and page.url == url_before and page.inner_text('.qhead .muted') == q_before, f'geri tuşu: panel kapandı, aynı soru ({q_before})')
    page.click('.qbar .lesson-btn'); page.wait_for_timeout(300)
    page.click('#sidePanel .icon-x'); page.wait_for_timeout(300)
    check(page.url == url_before and page.locator('.opt').count() >= 2, '× ile kapat: aynı soruya dönüldü')
    # Yanlış cevapta "Konuyu aç" de paneli açar
    for k in range(5):
        page.locator('.opt').nth(k).click(); page.wait_for_timeout(120)
        if page.locator('.opt.wrong').count() or page.locator('.opt.right').count(): break
    page.wait_for_timeout(300)
    if page.locator('.lesson-link').count():
        page.click('.lesson-link'); page.wait_for_timeout(300)
        check(page.locator('#sidePanel:not(.hidden)').count() == 1 and page.url == url_before, '"Konuyu aç" panelde, test gitmedi')
        page.click('#sidePanel .icon-x'); page.wait_for_timeout(200)

    # 3) Oturum kaydı: başka sekmeye git, dön → Kaldığın yerden devam et
    s = st()
    sess = [x for x in s.get('sessions', {}).values() if not x.get('deleted')]
    check(any(x['id'].startswith('gunluk:') and x['i'] >= 1 for x in sess), 'oturum ilerlemesi kaydedildi (sessions)')
    page.click('nav.tabs a[href="#/okuma"]'); page.wait_for_timeout(300)
    page.goto(BASE + '#/bugun'); page.wait_for_timeout(400)
    check(page.locator('a.banner.resume').count() >= 1, 'Bugün: "Yarım kaldı → Devam" bandı')
    page.click('a.banner.resume'); page.wait_for_timeout(400)
    check(page.locator('button:has-text("Devam et")').count() == 1 and 'Kaldığın yerden' in page.inner_text('main'), '"Kaldığın yerden devam et" kartı')
    page.screenshot(path=f'{SHOTS}/m-devam.png')
    page.click('button:has-text("Devam et")'); page.wait_for_timeout(400)
    check(page.inner_text('.qhead .muted') == q_before and page.locator('.opt.right').count() == 1, f'aynı soru, verilen cevap korunmuş ({page.inner_text(".qhead .muted")})')
    # Tarayıcı geri/ileri: oturum bozulmaz
    page.go_back(); page.wait_for_timeout(300); page.go_forward(); page.wait_for_timeout(500)
    if page.locator('button:has-text("Devam et")').count(): page.click('button:has-text("Devam et")'); page.wait_for_timeout(300)
    check(page.inner_text('.qhead .muted') == q_before, 'geri/ileri sonrası aynı soru')

    # 4) Hızlı not: oturumu bozmadan, bağlam = soru kimliği
    page.click('button:has-text("Sonraki")'); page.wait_for_timeout(200)
    qkey_label = page.inner_text('.qhead .muted')
    page.click('#noteTop'); page.wait_for_timeout(300)
    check(page.locator('#noteSheet:not(.hidden) textarea').count() == 1, 'Not paneli açıldı')
    check(ev("document.body.classList.contains('kb')"), 'klavye açık: body.kb')
    check(not page.locator('nav.tabs').is_visible(), 'klavye açıkken alt çubuk gizli')
    page.fill('#noteSheet textarea', 'whereas - oysa\nnevertheless - yine de')
    page.screenshot(path=f'{SHOTS}/m-not-panel.png')
    page.click('#noteSheet button:has-text("Kaydet")'); page.wait_for_timeout(300)
    check(page.inner_text('.qhead .muted') == qkey_label and page.locator('.opt').count() >= 2, 'not sonrası aynı soru (oturum bozulmadı)')
    s = st()
    qn = [n for n in s['notes'].values() if n.get('kind') == 'quick' and not n.get('deleted')]
    check(len(qn) == 1 and qn[0]['ctx']['type'] == 'soru' and qn[0]['ctx']['key'] and 'Günlük' in qn[0]['ctx']['label'], f'not bağlamı: {qn[0]["ctx"] if qn else None}')
    # Notlar ekranı: karta çevir (toplu), tamamlandı, düzenle, ara
    page.goto(BASE + '#/notlar'); page.wait_for_timeout(400)
    check(page.locator('.qnote').count() == 1, 'Notlar ekranında listelendi')
    nc = len(st()['cards'])
    page.click('.qnote button:has-text("Karta çevir")'); page.wait_for_timeout(200)
    page.click('.qnote button:has-text("Hepsini karta ekle (2)")'); page.wait_for_timeout(600)
    s = st()
    check(len(s['cards']) == nc + 2 and any(c.get('word') == 'whereas' and c.get('tr') == 'oysa' for c in s['cards'].values()), 'toplu karta çevir: 2 kart (kelime - anlam)')
    page.click('.qnote button:has-text("Düzenle")'); page.fill('.qnote textarea', 'The hydrolysis step is slow'); page.click('.qnote button:has-text("Kaydet")'); page.wait_for_timeout(200)
    page.click('.qnote button:has-text("Karta çevir")'); page.wait_for_timeout(200)
    page.click('.qnote .chip.pick:has-text("hydrolysis")'); page.click('.qnote button:has-text("Seçilenleri karta ekle (1)")'); page.wait_for_timeout(500)
    check(any(c.get('word') == 'hydrolysis' for c in st()['cards'].values()), 'kelime seçip karta çevir')
    page.click('.qnote button:has-text("Tamamlandı")'); page.wait_for_timeout(200)
    check(page.locator('.qnote').count() == 0 and any(n.get('done') for n in st()['notes'].values() if n.get('kind') == 'quick'), 'Tamamlandı → Açık listesinden çıktı')
    page.click('.seg button:has-text("Hepsi")'); page.fill('input[type=search]', 'hydro'); page.wait_for_timeout(200)
    check(page.locator('.qnote').count() == 1, 'notlarda ara')
    page.screenshot(path=f'{SHOTS}/m-notlar.png', full_page=True)

    # 5) Soru ekranında kelimeye dokun → panel; şık satırı = seç; şıktaki kelimeye uzun bas = panel
    page.goto(BASE + '#/gramer/konu/kelime'); page.wait_for_timeout(500)
    if page.locator('button:has-text("Baştan başla")').count(): page.click('button:has-text("Baştan başla")'); page.wait_for_timeout(200)
    page.locator('.q .w').nth(1).click(); page.wait_for_timeout(600)
    check(page.locator('#wordSheet:not(.hidden)').count() == 1, 'soru kökünde kelimeye dokun → kelime paneli')
    check(page.locator('.opt.right, .opt.wrong').count() == 0, 'dokunmak cevap seçmedi')
    page.click('#wordSheet .icon-x'); page.wait_for_timeout(150)
    bb = page.locator('.opt .w').first.bounding_box()
    page.mouse.move(bb['x'] + 3, bb['y'] + 4); page.mouse.down(); page.wait_for_timeout(650); page.mouse.up(); page.wait_for_timeout(500)
    check(page.locator('#wordSheet:not(.hidden)').count() == 1 and page.locator('.opt.right, .opt.wrong').count() == 0, 'şıkta uzun bas → kelime paneli, cevap seçilmedi')
    page.screenshot(path=f'{SHOTS}/m-soru-kelime.png')
    page.click('#wordSheet .icon-x'); page.wait_for_timeout(150)
    page.locator('.opt').nth(0).locator('.ol').click(); page.wait_for_timeout(300)
    check(page.locator('.opt.right').count() == 1, 'şık harfine dokun → seçildi')
    page.locator('.q .w').nth(1).click(); page.wait_for_timeout(600)
    ctxv = page.locator('#wordSheet textarea').input_value()
    check('----' not in ctxv and len(ctxv) > 10, f'cevaptan sonra bağlam boşluk doldurulmuş: "{ctxv[:60]}"')
    page.click('#wordSheet .icon-x'); page.wait_for_timeout(150); page.locator('.opt .w').first.click(); page.wait_for_timeout(500)
    check(page.locator('#wordSheet:not(.hidden)').count() == 1, 'cevaptan sonra şıktaki kelimeye dokun → panel')
    page.click('#wordSheet .icon-x')

    # 6) Merdiven: "Tekrar" → ladder; çift dokunuş tek kayıt
    ev("""import('./js/store.js').then(m => { const now = Date.now();
      m.put('cards', { id: 'lad1', word: 'scarcity', tr: 'kıtlık', syn: ['shortage', 'lack'], ex: 'The scarcity of water limits growth.', state: 'review', interval: 10, ease: 2.5, reps: 3, due: now - 1000, hist: ['g','g','g'] });
      for (const [i, w] of ['abundant','robust','feasible','viable','inherent'].entries()) m.put('cards', { id: 'lr' + i, word: w, tr: 'x' + i, syn: [['plentiful'],['sturdy'],['practicable'],['workable'],['intrinsic']][i], state: 'review', interval: 3, ease: 2.5, reps: 2, due: now + 2 * 86400000, hist: ['g'] }); })""")
    page.goto(BASE + '#/kartlar/calis'); page.wait_for_timeout(600)
    for k in range(40):
        if page.locator('.fword').count() == 0: break
        if page.locator('.fword').inner_text().startswith('scarcity'): break
        page.click('button:has-text("Göster")'); page.click('.g-good'); page.wait_for_timeout(60)
    check(page.locator('.fword .say').count() in (0, 1), 'kart ön yüzü: hoparlör ikonu (destek varsa)')
    page.click('button:has-text("Göster")'); page.wait_for_timeout(100)
    page.locator('.g-again').dblclick(); page.wait_for_timeout(300)
    c = st()['cards']['lad1']
    check(c.get('ladder') == 0 and c.get('reps') == 4, f'Tekrar → merdiven (ladder=0), çift dokunuş tek kayıt (reps {c.get("reps")})')
    page.screenshot(path=f'{SHOTS}/m-kart-merdiven.png')

    # 6) Alıştırmalar: yazarak, eş anlam, kelime ailesi, hafıza turu
    page.goto(BASE + '#/kartlar'); page.wait_for_timeout(500)
    check('Alıştırmalar' in page.inner_text('main') and page.locator('a[href="#/kartlar/yaz"]').count() == 1, 'Kartlar: Alıştırmalar bölümü')
    page.screenshot(path=f'{SHOTS}/m-kartlar-alistirmalar.png', full_page=True)
    page.goto(BASE + '#/kartlar/yaz'); page.wait_for_timeout(600)
    check(page.locator('.typein').count() == 1, 'yazarak hatırla: giriş kutusu')
    page.click('button:has-text("İpucu")')
    check(len(page.locator('.typein').input_value()) == 1, 'ipucu: ilk harf')
    page.screenshot(path=f'{SHOTS}/m-yazarak.png')
    tr_shown = page.inner_text('.typecard .ftr')
    cards_now = st()['cards']
    target = next((c for c in cards_now.values() if c.get('tr') == tr_shown and not c.get('deleted')), None)
    page.fill('.typein', 'zzzz'); page.click('button:has-text("Kontrol")'); page.wait_for_timeout(300)
    c2 = st()['cards'].get(target['id']) if target else None
    check(page.locator('.typein.wrong').count() == 1 and c2 and c2.get('wrongDay') and c2['due'] <= ev('Date.now()'), 'yanlış yazım → kart bugüne (wrongDay)')
    page.click('button:has-text("Sonraki"), button:has-text("Bitir")'); page.wait_for_timeout(300)
    if page.locator('.typecard').count():
        tr2 = page.inner_text('.typecard .ftr')
        t2 = next((c for c in st()['cards'].values() if c.get('tr') == tr2), None)
        if t2:
            w = t2['word']; typo = w[:-1] + ('x' if w[-1] != 'x' else 'y') if len(w) >= 5 else w
            page.fill('.typein', typo); page.press('.typein', 'Enter'); page.wait_for_timeout(200)
            check(page.locator('.typein.right').count() == 1, f'küçük yazım hatası kabul ({typo} ~ {w})')
    page.goto(BASE + '#/kartlar/es'); page.wait_for_timeout(600)
    check(page.locator('.opt').count() == 5 and 'Anlamca en yakın' in page.inner_text('.q'), 'eş anlam: 5 şık')
    page.screenshot(path=f'{SHOTS}/m-es-anlam.png')
    page.goto(BASE + '#/kartlar/aile'); page.wait_for_timeout(600)
    txt = page.inner_text('main')
    check(page.locator('.opt').count() >= 3 or 'aile' in txt.lower(), 'kelime ailesi: soru ya da boş durum mesajı')
    page.goto(BASE + '#/bugun'); page.wait_for_timeout(500)
    check('Hafıza turu' in page.inner_text('main'), 'Bugün: Hafıza turu görevi')
    page.click('a[href="#/kartlar/hafiza"]'); page.wait_for_timeout(700)
    check(page.locator('.typein, .opt').count() >= 1, 'hafıza turu açıldı')
    page.screenshot(path=f'{SHOTS}/m-hafiza-turu.png')

    # 7) Aktif okuma: paragraf sonu ana fikir kutusu → nota düşer
    page.goto(BASE + '#/okuma/p/p001'); page.wait_for_timeout(700)
    ideas = page.locator('.reader details.idea')
    check(ideas.count() >= 2, f'her paragraf sonunda "Ana fikir?" ({ideas.count()})')
    ideas.first.locator('summary').click()
    ideas.first.locator('textarea').fill('Malzeme ısınınca genleşir.')
    ideas.first.locator('button:has-text("Kaydet")').click(); page.wait_for_timeout(300)
    check(any(n.get('ctx', {}).get('para') == 0 and n.get('text') == 'Malzeme ısınınca genleşir.' for n in st()['notes'].values() if n.get('kind') == 'quick'), 'ana fikir notlara düştü (paragraf bağlamı)')
    page.click('#noteTop'); page.wait_for_timeout(200)
    check('Okuma' in page.inner_text('#noteSheet'), 'okumada not bağlamı: parça')
    page.click('#noteSheet .icon-x')
    page.screenshot(path=f'{SHOTS}/m-aktif-okuma.png', full_page=True)

    # 7) Odak oturumu → mola ekranı, dakikalar gün kaydına
    page.goto(BASE + '#/bugun'); page.wait_for_timeout(400)
    page.click('button.focus-start'); page.wait_for_timeout(400)
    check(page.locator('#focusPill:not(.hidden)').count() == 1 and 'Odak' in page.locator('#focusPill').text_content(), 'odak sayacı başladı')
    ev("(() => { const s = JSON.parse(localStorage.getItem('yokdil.focus')); s.startedAt -= 26 * 60000; s.endsAt -= 26 * 60000; localStorage.setItem('yokdil.focus', JSON.stringify(s)); })()")
    page.reload(); page.wait_for_timeout(1500)
    check(page.locator('.breakscreen').count() == 1 and page.locator('.brk-tip').inner_text() != '', 'mola ekranı + öneri')
    page.screenshot(path=f'{SHOTS}/m-mola.png')
    d = [x for x in st()['days'].values() if x.get('focusMin')]
    check(d and d[0]['focusMin'] == 25, f'odak dakikaları gün kaydında ({d[0]["focusMin"] if d else 0})')
    page.click('.breakscreen button:has-text("Bitir")'); page.wait_for_timeout(300)
    check(page.locator('.breakscreen').count() == 0, 'mola bitir')
    page.goto(BASE + '#/eksikler'); page.wait_for_timeout(400)
    check('odak: son 7 günde 25 dk' in page.inner_text('main'), 'Eksikler: odak dakikaları')

    # Boş veri: dersler/gramer yüklenemezse kısa mesaj
    ctx.route('**/data/lessons.json', lambda r: r.abort())
    ctx.route('**/data/dev-sample/lessons.json', lambda r: r.abort())
    page.reload(); page.wait_for_timeout(600)
    page.goto(BASE + '#/dersler'); page.wait_for_timeout(500)
    check('yüklenemedi' in page.inner_text('main') and page.locator('main button:has-text("Yenile")').count() == 1, 'boş Dersler: ne yapacağını söyleyen mesaj')
    ctx.close()

    # İçerik güncelleme migration: düzenlenmemiş çekirdek kart tazelenir, SRS korunur
    ctx, page = v4ctx({'width': 390, 'height': 844}, True, 'v4-migr', hour=10)
    page.goto(BASE + '#/bugun'); page.wait_for_timeout(600)
    w0 = page.evaluate("fetch('data/words.json').then(r => r.json()).then(ws => ws[0])")
    page.evaluate(f"""import('./js/store.js').then(m => {{
      m.put('cards', {{ id: 'w:{w0['id']}', wid: '{w0['id']}', word: {json.dumps(w0['word'])}, tr: 'ESKI', syn: [], state: 'review', interval: 7, due: 4242, ease: 2.2, hist: ['g'] }});
      m.put('cards', {{ id: 'w:keep', wid: '{w0['id']}x', word: 'keepme', tr: 'benim', userEdited: true, state: 'new' }});
      localStorage.removeItem('yokdil.dataRev'); }})""")
    page.wait_for_timeout(400); page.reload(); page.wait_for_timeout(900)
    s = page.evaluate("JSON.parse(localStorage.getItem('yokdil.v1'))")
    c = s['cards']['w:' + w0['id']]
    check(c['tr'] == w0['tr'] and c['due'] == 4242 and c['interval'] == 7 and c['ease'] == 2.2, f'migration: anlam tazelendi ({c["tr"]}), SRS korundu')
    check(s['cards']['w:keep']['tr'] == 'benim', 'migration: elle düzenlenen karta dokunulmadı')
    ctx.close()

    # Akşam ipucu (17:00 sonrası, günde bir) + masaüstü yan panel ve menü
    ctx, page = v4ctx({'width': 1280, 'height': 860}, False, 'v4-masaustu', hour=19)
    page.goto(BASE + '#/bugun'); page.wait_for_timeout(800)
    check(page.locator('.evetip').count() == 1 and 'Uykun mu geldi' in page.inner_text('.evetip'), 'akşam ipucu gösterildi')
    page.screenshot(path=f'{SHOTS}/d-bugun-aksam.png')
    page.reload(); page.wait_for_timeout(700)
    check(page.locator('.evetip').count() == 0, 'akşam ipucu günde bir kez')
    side = [page.locator('nav.tabs a:visible').nth(i).inner_text() for i in range(page.locator('nav.tabs a:visible').count())]
    check(side == ['Bugün', 'Okuma', 'Kartlar', 'Sorular', 'Dersler', 'Eksikler', 'Notlar'], f'masaüstü yan menü: {side}')
    page.goto(BASE + '#/alistirma/bosluk'); page.wait_for_timeout(700)
    page.click('.qbar .lesson-btn'); page.wait_for_timeout(500)
    pb = page.locator('#sidePanel').bounding_box(); ob = page.locator('.opts').bounding_box()
    check(pb and ob and ob['x'] + ob['width'] <= pb['x'] + 1, 'masaüstü: ders sağ panelde, sorular solda açık')
    page.locator('.opt').nth(0).click(); page.wait_for_timeout(200)
    check(page.locator('#sidePanel:not(.hidden)').count() == 1 and page.locator('.opt.right').count() == 1, 'panel açıkken soru cevaplanabiliyor')
    page.screenshot(path=f'{SHOTS}/d-ders-yan-panel.png')
    for r in ['bugun', 'kartlar', 'notlar', 'cikmis', 'dersler', 'okuma/p/p001', 'eksikler']:
        page.goto(BASE + '#/' + r); page.wait_for_timeout(450)
        page.screenshot(path=f'{SHOTS}/d-{r.replace("/", "_")}.png', full_page=True)
    # Çıkmış sınav: kalan süre kaydedilir, şıkta uzun bas = kelime paneli
    page.evaluate("localStorage.setItem('yokdil.token', 'ghp_x')")
    page.goto(BASE + '#/ayarlar'); page.wait_for_timeout(300)
    page.click('button:has-text("Soruları güncelle")'); page.wait_for_timeout(2000)
    page.goto(BASE + '#/cikmis/sinav/yokdil-fen-2019'); page.wait_for_timeout(2600)
    bb = page.locator('.opt .w').first.bounding_box()
    page.mouse.move(bb['x'] + 3, bb['y'] + 4); page.mouse.down(); page.wait_for_timeout(650); page.mouse.up(); page.wait_for_timeout(400)
    check(page.locator('#wordSheet:not(.hidden)').count() == 1 and page.locator('.opt.chosen').count() == 0, 'deneme: şıkta uzun bas → panel, seçim yok')
    page.click('#wordSheet .icon-x')
    page.locator('.opt').nth(0).click(); page.wait_for_timeout(200)
    page.screenshot(path=f'{SHOTS}/d-cikmis-sinav.png')
    page.goto(BASE + '#/bugun'); page.wait_for_timeout(300)
    pr = page.evaluate("JSON.parse(localStorage.getItem('yokdil.v1')).progress['exam:yokdil-fen-2019']")
    check(pr and pr.get('elapsed', 0) >= 1 and pr['answers'].get('1') == 0, f'deneme: geçen süre ve cevap kaydedildi ({pr.get("elapsed") if pr else None} sn)')
    page.goto(BASE + '#/cikmis/sinav/yokdil-fen-2019'); page.wait_for_timeout(500)
    check(page.locator('.opt.chosen').count() == 1, 'denemeye dönünce cevap duruyor')
    ctx.close()

    # Mobil ekran görüntüleri (390x844)
    ctx, page = v4ctx({'width': 390, 'height': 844}, True, 'v4-shots', hour=10)
    for r in ['bugun', 'kartlar', 'dersler', 'notlar', 'gramer/gunluk', 'okuma/p/p001']:
        page.goto(BASE + '#/' + r); page.wait_for_timeout(450)
        page.screenshot(path=f'{SHOTS}/m-{r.replace("/", "_")}.png', full_page=True)
    ctx.close()

    # ================= v6: kurul raporu regresyonları =================
    ctx, page = v4ctx({'width': 390, 'height': 844}, True, 'v6', hour=21)
    def st():
        page.wait_for_timeout(250)
        return page.evaluate("JSON.parse(localStorage.getItem('yokdil.v1')||'{}')")
    def ev(js): return page.evaluate(js)
    def shot(n, full=False): page.screenshot(path=f'{SHOTS}/{n}.png', full_page=full)
    # Ana eylem düğmesi gerçekten tıklanabilir mi (Not düğmesi / bildirim / alt çubuk üstünde değil)?
    def reachable(sel, toast=True):
        loc = page.locator(sel).first
        if loc.count() == 0 or not loc.is_visible(): return False
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)"); page.wait_for_timeout(150)
        if toast: ev("import('./js/util.js').then(m => m.toast('+2 kelime karta eklendi'))"); page.wait_for_timeout(120)
        loc.scroll_into_view_if_needed(); page.wait_for_timeout(100)
        return page.evaluate("""(sel) => { const b = document.querySelector(sel); const r = b.getBoundingClientRect();
          const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.right - 6, r.top + r.height / 2], [r.left + 6, r.top + r.height / 2]];
          return pts.every(([x, y]) => { const e = document.elementFromPoint(x, y); return e && (e === b || b.contains(e)); }); }""", sel)
    page.goto(BASE + '#/bugun'); page.wait_for_timeout(800)
    page.evaluate("localStorage.setItem('yokdil.token', 'ghp_x')")
    page.goto(BASE + '#/ayarlar'); page.wait_for_timeout(300)
    page.click('button:has-text("Soruları güncelle")'); page.wait_for_timeout(2200)

    # A1) Soru ekranlarında Sonraki/Kontrol her zaman tıklanabilir
    def answer_first():
        page.locator('.opt').nth(0).click(); page.wait_for_timeout(250)
    for r in ['gramer/gunluk', 'alistirma/cloze', 'alistirma/cumle-tamamlama', 'alistirma/paragraf', 'alistirma/ceviri-en-tr', 'cikmis/tip/cloze', 'cikmis/tip/paragraf', 'okuma/p/p001']:
        page.goto(BASE + '#/' + r); page.wait_for_timeout(700)
        if page.locator('button:has-text("Baştan başla")').count(): page.click('button:has-text("Baştan başla")'); page.wait_for_timeout(200)
        if r.startswith('okuma'):
            page.click('button:has-text("Soruları çöz")'); page.wait_for_timeout(300)
        check(page.locator('#noteFab').is_visible() == False and page.locator('#noteTop').is_visible(), f'{r}: Not düğmesi üst çubukta (FAB gizli)')
        answer_first()
        ok = reachable('.actbar .btn.primary:not(.hidden)')
        check(ok, f'{r}: "Sonraki" tıklanabilir (toast + sayfa sonu)')
        shot('v6-erisim-' + r.replace('/', '_'))
    # Sınav modu: uzun cloze sorusunda Sonraki
    page.goto(BASE + '#/cikmis/sinav/yokdil-fen-2019'); page.wait_for_timeout(900)
    for n in ['25', '40', '70']:
        if page.locator('.optik.hidden').count(): page.click('button:has-text("Optik")')
        page.click(f'.optik button:text-is("{n}")'); page.wait_for_timeout(250)
        check(reachable('.exam-nav .main-act'), f'sınav soru {n}: Sonraki/Bölüm sonu tıklanabilir')
    shot('v6-sinav-uzun-soru')
    page.goto(BASE + '#/kartlar/yaz'); page.wait_for_timeout(600)
    if page.locator('.typein').count():
        check(reachable('.actbar .main-act'), 'yazarak hatırla: Kontrol tıklanabilir')

    # A9) Sınav: bölüm seçici, bölüm sonu ara sonuç + kilit, Bugün'de "Yarım kaldı"
    page.goto(BASE + '#/cikmis'); page.wait_for_timeout(700)
    check(page.locator('details.secpick').count() >= 5, 'Çıkmış: "Bölüm bölüm çöz" seçici')
    import re as _re
    check(not _re.search(r'(^|· )0 soru', page.inner_text('main'), _re.M), 'boş set listede yok')
    shot('v6-cikmis-liste', True)
    page.goto(BASE + '#/cikmis/sinav/yokdil-fen-2020-1/cloze'); page.wait_for_timeout(900)
    qn = page.inner_text('.qhead .muted')
    check(qn.startswith('Soru 21'), f'bölüm başlat: cloze ilk soru ({qn})')
    check(page.locator('.secstrip .chip').count() >= 7 and page.locator('.secstrip .chip.on').count() == 1, 'bölüm şeridi')
    for k in range(10):
        page.locator('.opt').nth(k % 5).click(); page.wait_for_timeout(80)
        if page.locator('button:has-text("Bölüm sonu")').count(): break
        page.click('.exam-nav button:has-text("Sonraki")'); page.wait_for_timeout(80)
    page.click('button:has-text("Bölüm sonu")'); page.wait_for_timeout(200)
    shot('v6-bolum-sonu')
    page.click('button:has-text("Bölümü kontrol et")'); page.wait_for_timeout(400)
    check(page.locator('.interim table.mock').count() == 1, 'bölüm sonu: D/Y/B ara sonuç')
    pr = st()['progress']['exam:yokdil-fen-2020-1']
    check(pr['locked'] and not pr.get('done'), 'bölüm kilitlendi, sınav yarım')
    check(any(k.startswith('yokdil-fen-2020-1:') for k in st()['mistakes']), 'bölüm yanlışları hata kutusunda')
    page.click('.secstrip .chip >> nth=1'); page.wait_for_timeout(300)
    check(page.locator('.opts.locked').count() == 1 and page.locator('.opt.right').count() == 1, 'kilitli bölüm: doğru şık görünüyor')
    page.click('button:has-text("Optik")'); page.wait_for_timeout(200)
    check(page.locator('.optik .optik-h').count() >= 7, 'optikte bölüm başlıkları')
    shot('v6-optik', True)
    page.goto(BASE + '#/bugun'); page.wait_for_timeout(700)
    check(page.locator('.exam-resume').count() == 1, 'Bugün: deneme için "Yarım kaldı" bandı')
    shot('v6-bugun-yarim-deneme', True)
    # Tam sınavı bitir → sonuç: bölüm grupları, bölüm yanlışlarını çöz, zayıf bölüm dersi
    page.goto(BASE + '#/cikmis/sinav/yokdil-fen-2020-1'); page.wait_for_timeout(700)
    page.click('.readbar button:has-text("Bitir")'); page.wait_for_timeout(1200)
    check(page.locator('.secgroup').count() >= 3 and page.locator('.secgroup[open]').count() == 0, 'sonuç: yanlışlar bölüm bölüm, kapalı')
    page.click('tr.secrow >> nth=1'); page.wait_for_timeout(400)
    check(page.locator('.secgroup[open]').count() == 1, 'bölüm satırına dokun → o bölümün yanlışları')
    check(page.locator('.weak-lesson').count() == 1, 'zayıf bölüm için ders önerisi')
    shot('v6-sonuc', True)
    page.locator('.secgroup[open] .retry-sec').click(); page.wait_for_timeout(700)
    check('#/cikmis/yanlis/' in page.url and page.locator('.opt').count() == 5, 'bu bölümün yanlışlarını tekrar çöz')
    day = st()['days']
    check(any(d.get('mock') for d in day.values()), 'deneme günü gün kaydına yazıldı (seri)')
    # Tipe göre: kaynak filtresi, "Cevap: X" satırı yok
    page.goto(BASE + '#/cikmis/tip/bosluk'); page.wait_for_timeout(700)
    check(page.locator('.srcseg a').count() == 3 and page.locator('.srcseg a.active').inner_text().startswith('ÖSYM'), 'tip: kaynak filtresi (varsayılan ÖSYM)')
    lbl = page.inner_text('.qhead')
    check('Remzi' not in lbl, f'ÖSYM filtresinde yayınevi sorusu yok ({lbl[:40]})')
    answer_first()
    check(not page.inner_text('.explain').strip().startswith('Cevap:'), 'açıklamasız soruda "Cevap: X" satırı yok')
    page.click('.srcseg a:has-text("Yayınevi")'); page.wait_for_timeout(600)
    if page.locator('button:has-text("Baştan başla")').count(): page.click('button:has-text("Baştan başla")'); page.wait_for_timeout(200)
    check('Remzi' in page.inner_text('.qhead'), 'Yayınevi filtresi')
    shot('v6-tip-kaynak')

    # A10) Ders düğmesi soru tipinin taktik dersini açar
    page.goto(BASE + '#/alistirma/ceviri-en-tr'); page.wait_for_timeout(600)
    if page.locator('button:has-text("Baştan başla")').count(): page.click('button:has-text("Baştan başla")'); page.wait_for_timeout(200)
    page.click('.qbar .lesson-btn'); page.wait_for_timeout(500)
    t = page.inner_text('#sidePanel .side-head')
    check('Dersler' not in t and page.locator('#sidePanel .lesson').count() >= 1, f'çeviri sorusu → çeviri taktik dersi ({t.strip()[:40]})')
    shot('v6-ders-ceviri')
    page.click('#sidePanel .icon-x'); page.wait_for_timeout(200)

    # B) İpucu: cevaptan önce, kullanım kaydedilir; Eksikler'de ayrı
    page.goto(BASE + '#/gramer/konu/zaman-uyumu'); page.wait_for_timeout(600)
    if page.locator('button:has-text("Baştan başla")').count(): page.click('button:has-text("Baştan başla")'); page.wait_for_timeout(300)
    page.wait_for_timeout(400)
    check(page.locator('.hint-btn:not(.hidden)').count() == 1, 'İpucu düğmesi cevaptan önce')
    page.click('.hint-btn'); page.wait_for_timeout(300)
    check(page.locator('.hintbox:not(.hidden)').count() == 1 and len(page.inner_text('.hintbox')) > 8, 'ipucu gösterildi (hint/formula)')
    shot('v6-ipucu')
    page.locator('.opt.right, .opt').nth(0).click(); page.wait_for_timeout(300)
    logs = [l for l in st()['grammarLog'].values() if l.get('hint')]
    check(len(logs) == 1, 'ipucu kullanımı kaydedildi')
    # Çift boşluklu soru: iki boşluk, "x / y" şıklar
    dq = ev("fetch('data/grammar.json').then(r => r.json()).then(g => g.find(q => q.double))")
    if dq:
        ev(f"import('./js/store.js').then(m => m.put('sessions', {{ id: 'konu:cift', name: 'x', route: '#/gramer/konu/cift', i: 0, picks: {{}}, done: false, keys: ['{dq['id']}'], total: 1, at: 1 }}))")
        page.goto(BASE + f"#/gramer/konu/{dq['topic']}"); page.wait_for_timeout(500)
        r = ev(f"import('./js/qbank.js').then(m => m.resolve('{dq['id']}')).then(it => ({{ d: it.double, o: it.options[0] }}))")
        check(r['d'] and ' / ' in r['o'], f'çift boşluk öğesi: {r}')
        ev(f"""import('./js/quiz.js').then(q => import('./js/qbank.js').then(b => b.resolve('{dq['id']}').then(it => {{
          const m = document.querySelector('main .page'); m.innerHTML = ''; const d = document.createElement('div'); d.id = 'dq'; m.append(d); q.runQuiz(d, [it], {{}}); }})))""")
        page.wait_for_timeout(500)
        check(page.locator('#dq .q .blank').count() == 2 and ' / ' in page.inner_text('#dq .opt >> nth=0'), 'çift boşluk: 2 boşluk + "x / y" şıklar')
        shot('v6-cift-bosluk')
    # Kişisel kural kartı yanlışta otomatik
    rq = ev("fetch('data/grammar.json').then(r => r.json()).then(g => g.find(q => q.topic === 'edat-esdizim' && !q.double && /^(at|in|by|under)$/i.test(String(q.options[q.answer]).trim())))")
    ev(f"""import('./js/quiz.js').then(q => import('./js/qbank.js').then(b => b.resolve('{rq['id']}').then(it => {{
      const m = document.querySelector('main .page'); m.innerHTML = ''; const d = document.createElement('div'); d.id = 'rq'; m.append(d); q.runQuiz(d, [it], {{ auto: false }}); }})))""")
    page.wait_for_timeout(400)
    page.locator('#rq .opt').nth((rq['answer'] + 1) % 5).click(); page.wait_for_timeout(600)
    check(page.locator('#rq .rulecard').count() == 1, 'yanlışta kişisel kural kartı göründü')
    shot('v6-kisisel-kural')
    page.locator('#rq .actbar .btn').click(); page.wait_for_timeout(500)
    check(page.locator('#rq .wronglist').count() == 1 and page.locator('#rq .retry-wrong').count() == 1, 'bitiş: yanlış listesi + "Yanlışları tekrar çöz"')
    page.wait_for_timeout(400)
    check(page.locator('#rq .next-task, #rq .endnext a').count() == 1, 'bitiş: sıradaki görev düğmesi')
    page.locator('#rq .wronglist details summary').first.click(); page.wait_for_timeout(200)
    shot('v6-bitis-ekrani', True)
    page.click('#rq .retry-wrong'); page.wait_for_timeout(300)
    check(page.locator('#rq .opt').count() == 5, 'yanlışları tekrar çöz açıldı')
    page.goto(BASE + '#/eksikler'); page.wait_for_timeout(500)
    txt = page.inner_text('main')
    check('İpucuyla doğru' in txt or len(logs) == 1, 'Eksikler: ipucuyla doğru ayrı')
    check('yeni kelimeyle sınavda' in txt and 'Hedefe günde' not in txt, 'Eksikler: tek sayı (günlük limitle)')

    # Araçlar ve formula
    page.goto(BASE + '#/dersler'); page.wait_for_timeout(500)
    check(page.locator('.toolstrip .tool').count() >= 6, f'Dersler: Araçlar şeridi ({page.locator(".toolstrip .tool").count()})')
    check(page.locator('.formula-line').count() >= 10, 'ders listesinde formül satırı')
    shot('v6-dersler', True)
    page.click('.tool:has-text("Karar ağacı")'); page.wait_for_timeout(400)
    page.locator('.tree-opt').first.click(); page.wait_for_timeout(200)
    for k in range(4):
        if page.locator('.tree-result').count(): break
        page.locator('.tree-opt').first.click(); page.wait_for_timeout(200)
    check(page.locator('.tree-result').count() == 1, 'karar ağacı: adım adım sonuca ulaşıldı')
    shot('v6-karar-agaci')
    for k, sel in [('kutup', '.polcard'), ('zaman', '.tbl td'), ('kopya', 'ul.list li'), ('eleme', 'ol.elim li'), ('kural', '.rulecard')]:
        page.goto(BASE + '#/dersler/arac/' + k); page.wait_for_timeout(350)
        check(page.locator(sel).count() >= 2, f'araç {k}')
        shot('v6-arac-' + k, True)
    sw = ev("document.documentElement.scrollWidth")
    check(sw <= 392, f'zaman tablosu ekrana sığıyor ({sw})')
    page.goto(BASE + '#/dersler/baglac-zitlik'); page.wait_for_timeout(500)
    check(page.locator('main .formula').count() == 1, 'ders sayfası: 30 sn formül kutusu')
    check(ev("document.documentElement.scrollWidth") <= 392, 'ders tabloları ekrana sığıyor')
    shot('v6-ders-formul', True)

    # A12) Dokunma hedefleri ≥ 44 px
    page.goto(BASE + '#/bugun'); page.wait_for_timeout(500)
    small = ev("""[...document.querySelectorAll('.tasks .play, .tasks .check, .btn.small, .icon-x, .seg a, .seg button')].filter(e => e.offsetParent)
      .map(e => e.getBoundingClientRect()).filter(r => r.height < 43.5 || r.width < 43.5).length""")
    check(small == 0, f'Bugün: dokunma hedefleri ≥44px ({small} küçük)')
    page.goto(BASE + '#/okuma/p/p001'); page.wait_for_timeout(500)
    hs = ev("[...document.querySelectorAll('.readbar .btn, details.idea summary')].map(e => Math.round(e.getBoundingClientRect().height))")
    check(min(hs) >= 44, f'okuma ‹ / Ana fikir ≥44px ({min(hs)})')

    # A6) Kart tekrarı ile yeni ayrı; dakika gerçek sayıdan
    ev("""import('./js/store.js').then(m => { const now = Date.now(); for (let i = 0; i < 16; i++) m.put('cards', { id: 'due' + i, word: 'duew' + i, tr: 't' + i, state: 'review', interval: 2, ease: 2.5, reps: 1, due: now - 1000, hist: ['g'] }); })""")
    page.goto(BASE + '#/bugun'); page.wait_for_timeout(600)
    due = ev("import('./js/srs.js').then(m => m.dueCount())")
    kt = page.inner_text('[data-task=kart]')
    import math
    check(f'{due} tekrar' in kt and f'~{math.ceil(due * 8 / 60)} dk' in kt, f'Kart tekrarı: gerçek sayı + dakika ({kt.strip()})')
    shot('v6-bugun', True)
    page.goto(BASE + '#/kartlar/calis'); page.wait_for_timeout(600)
    states = []
    for k in range(60):
        if page.locator('button:has-text("Göster")').count() == 0: break
        states.append(page.inner_text('.flash .small.muted'))
        page.click('button:has-text("Göster")'); page.click('.g-good'); page.wait_for_timeout(40)
    check(len(states) == due and not any('Yeni' in s for s in states), f'Kart tekrarı oturumu yalnız tekrarlar ({len(states)}/{due})')
    check(page.locator('.endnext a').count() == 1, 'kart bitişi: sıradaki görev')
    shot('v6-kart-bitis')

    # A2) Okurken eklenen kelime ertesi gün en önde (limit dolu olsa da)
    page.goto(BASE + '#/okuma/p/p002'); page.wait_for_timeout(600)
    w = page.locator('.reader .w.unk:not(.saved)').nth(3); wt = w.inner_text(); w.click(); page.wait_for_timeout(900)
    page.click('#wordSheet button.primary'); page.wait_for_timeout(300)
    mine = [c for c in st()['cards'].values() if c.get('mine') and not c.get('deleted')]
    check(len(mine) >= 1, f'okurken eklenen kart işaretli (mine): {wt}')
    ev("""import('./js/store.js').then(m => { for (const c of m.all('cards')) if (c.mine) m.put('cards', { ...c, mine: Date.now() - 86400000, createdAt: Date.now() - 86400000 });
      import('./js/plan.js').then(p => p.updateDay({ newDone: 99 })); })""")
    page.wait_for_timeout(300)
    q = ev("import('./js/srs.js').then(m => m.newQueue()).then(q => q.map(x => x.card ? x.card.word : x.word.word))")
    check(q and q[0] == mine[0]['word'], f'dünden kalan kendi kelimem limit dolu olsa da kuyrukta ilk: {q[:3]}')

    # A3) Otomatik kart: işlev kelimesi/çekim yok + göç
    n0 = len([c for c in st()['cards'].values() if not c.get('deleted')])
    gq = ev("fetch('data/grammar.json').then(r => r.json()).then(g => g.filter(q => q.topic === 'baglac-zitlik' && !q.double).map(q => q.id))")
    ev(f"import('./js/autocard.js').then(a => import('./js/qbank.js').then(b => Promise.all({json.dumps(gq[:8])}.map(id => b.resolve(id).then(it => a.fromWrong(it, (it.answer + 1) % 5, {{ quiet: true }}))))))")
    page.wait_for_timeout(600)
    added = [c['word'] for c in st()['cards'].values() if c.get('source') == 'Hata' and not c.get('deleted')]
    check(not any(x in added for x in ['because', 'although', 'while', 'so that', 'in that', 'whereas', 'despite']), f'bağlaç yanlışlarından kart açılmadı ({added})')
    ev("""import('./js/store.js').then(m => { const now = Date.now();
      m.put('cards', { id: 'bad1', word: 'because', tr: 'çünkü', source: 'Hata', tags: ['hata'], state: 'new', createdAt: now });
      m.put('cards', { id: 'bad2', word: 'eating', tr: '', source: 'Hata', tags: ['hata'], state: 'new', createdAt: now });
      m.put('cards', { id: 'keep2', word: 'in that', tr: 'şöyle ki', source: 'Hata', tags: ['hata'], state: 'review', reps: 3, lastReview: now, due: now + 9e7 });
      localStorage.removeItem('yokdil.mig'); })""")
    page.wait_for_timeout(300); page.reload(); page.wait_for_timeout(1000)
    s = st()['cards']
    check(s['bad1'].get('deleted') and s['bad2'].get('deleted') and not s['keep2'].get('deleted'), 'göç: işlev/anlamsız Hata kartları silindi, SRS geçmişli kaldı')

    # A4) Hata tekrarı: günde en fazla 8
    ids = ev("fetch('data/grammar.json').then(r => r.json()).then(g => g.slice(0, 30).map(q => q.id))")
    ev(f"""import('./js/store.js').then(m => {{ for (const id of {json.dumps(ids)}) m.put('mistakes', {{ id, kind: 'gramer', due: '2026-01-01', stage: 0, streak: 0, wrongs: 1 }});
      const k = Object.keys(JSON.parse(localStorage.getItem('yokdil.v1')).days || {{}}); for (const d of m.all('days')) {{ const x = {{ ...d }}; delete x.hset; m.put('days', x); }} }})""")
    page.goto(BASE + '#/bugun'); page.wait_for_timeout(700)
    ht = page.locator('[data-task=hata]').first.text_content() if page.locator('[data-task=hata]').count() else ''  # deneme gününde 'İsteğe bağlı' (kapalı) içinde
    check('Hata tekrarı (0/8)' in ht, f'Bugün: ayrı görev "Hata tekrarı (0/8)" ({ht.strip()[:40]})')
    gt = page.locator('[data-task=gramer]').first.text_content()
    check('hata' not in gt.lower() and '+' not in gt, f'Gramer görevinde birikmiş hata sayısı yok ({gt.strip()})')
    page.goto(BASE + '#/gramer/hata'); page.wait_for_timeout(700)
    check('1/8' in page.inner_text('.qhead'), 'hata tekrarı oturumu 8 soru')
    for k in range(3):
        page.locator('.opt').nth(0).click(); page.wait_for_timeout(100); page.click('.actbar .btn'); page.wait_for_timeout(100)
    page.goto(BASE + '#/bugun'); page.wait_for_timeout(600)
    check('(3/8)' in page.locator('[data-task=hata]').first.text_content(), 'Hata tekrarı ilerlemesi (3/8)')

    # A5) Seri: tek atlanan gün + deneme günü
    ev("""import('./js/store.js').then(m => import('./js/util.js').then(u => { const t = u.dayKey();
      for (const [i, f] of [[2, { tasks: { kart: true } }], [3, { mock: true }], [4, { focusMin: 30 }]]) m.put('days', { id: u.addDays(t, -i), tasks: {}, ...f }); }))""")
    page.goto(BASE + '#/kartlar'); page.wait_for_timeout(200); page.goto(BASE + '#/bugun'); page.wait_for_timeout(600)
    stv = page.inner_text('.streak')
    check('Seri: 4' in stv and 'joker' in stv, f'seri: deneme sayıldı + joker dün kullanıldı ({stv})')

    # A8) Hafıza turu sayısı tutarlı; okuma çok hızlıysa ✓ yok
    tour_n = ev("import('./js/memory.js').then(m => m.tourCards().length)")
    if tour_n:
        page.goto(BASE + '#/kartlar/hafiza'); page.wait_for_timeout(800)
        check(f'1/{tour_n}' in page.inner_text('.qhead'), f'Hafıza turu: Bugün sayısı = soru sayısı ({tour_n})')
        check(page.locator('.typein').count() == 0, 'hafıza turu seçmeli')
    ev("import('./js/plan.js').then(p => p.tick('okuma', false))")
    page.goto(BASE + '#/okuma/p/p003'); page.wait_for_timeout(700)
    page.click('button:has-text("Soruları çöz")'); page.wait_for_timeout(200)
    for k in range(3):
        if page.locator('.opt').count() == 0: break
        page.locator('.opt').nth(0).click(); page.wait_for_timeout(80); page.click('.actbar .btn'); page.wait_for_timeout(120)
    page.wait_for_timeout(400)
    dd = ev("import('./js/plan.js').then(p => p.dayRec())")
    check(not dd['tasks'].get('okuma') and page.locator('.shortread').count() == 1, '6 sn okuma: görev sayılmadı + uyarı')
    check(page.locator('.endcard').count() == 1, 'okuma bitişi: doğru/yanlış özeti')
    shot('v6-okuma-kisa', True)

    # A11) Not → karta çevir: Türkçe kelimeler bölünmez
    page.goto(BASE + '#/notlar'); page.wait_for_timeout(300)
    ev("import('./js/notes.js').then(n => n.saveNote('cümle Karıştırıyorum: whereas ile hydrolysis', { type: 'sayfa', label: 'x' }))")
    page.goto(BASE + '#/bugun'); page.goto(BASE + '#/notlar'); page.wait_for_timeout(400)
    page.locator('.qnote button:has-text("Karta çevir")').first.click(); page.wait_for_timeout(200)
    chips = [page.locator('.qnote .chip.pick').nth(i).inner_text() for i in range(page.locator('.qnote .chip.pick').count())]
    check(chips == ['whereas', 'hydrolysis'], f'not çipleri yalnız İngilizce: {chips}')
    shot('v6-not-karta-cevir')
    # Ayrı: toast üstte
    ev("import('./js/util.js').then(m => m.toast('deneme'))"); page.wait_for_timeout(300)
    tb = page.locator('#toast').bounding_box()
    check(tb and tb['y'] < 150, 'bildirim üstte')
    ctx.close()

    # ================= v7: sınav stratejisi, çeviri parçalama, bağlamdan tahmin, QA =================
    ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    NEW_AIDS = ['timePlan', 'targets', 'examDay', 'errorReasons', 'mockAnalysis', 'resources']
    def merged(name):
        # Gerçek içerik yeni alanları henüz içermiyorsa data/dev-sample ile tamamla (içerik gelince gerçek veri kullanılır)
        real = json.load(open(f'{ROOT}/data/{name}.json', encoding='utf-8')); samp = json.load(open(f'{ROOT}/data/dev-sample/{name}.json', encoding='utf-8'))
        if name == 'aids': return {**{k: samp[k] for k in NEW_AIDS}, **real}
        if name == 'drills': return real if any('parts' in it for d in real for it in d['items']) else real + [d for d in samp if d['id'].startswith('dp')]
        ids = {l['id'] for l in real}
        return real + [l for l in samp if l['id'].startswith('taktik-') and l['id'] not in ids]
    DATEJS = """(() => { const off = +(localStorage.getItem('test.dateoff') || 0); if (!off) return; const D = Date;
      class FD extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + off); } static now() { return D.now() + off; } }
      window.Date = FD; })();"""
    def v7ctx(vp, mobile, tag):
        c = b.new_context(viewport=vp, is_mobile=mobile, has_touch=mobile, service_workers='block')
        c.add_init_script(OPEN_DETAILS)
        c.route(lambda u: not u.startswith(BASE), lambda r: r.abort())
        c.route(API, gh_route)
        for n in ['aids', 'drills', 'lessons']:
            c.route(f'**/data/{n}.json', (lambda n: lambda r: r.fulfill(json=merged(n)))(n))
        c.add_init_script(DATEJS)
        pg = c.new_page(); attach(pg, tag)
        pg.on('dialog', lambda d: d.accept())
        return c, pg
    ctx, page = v7ctx({'width': 390, 'height': 844}, True, 'v7')
    def st():
        page.wait_for_timeout(250)
        return page.evaluate("JSON.parse(localStorage.getItem('yokdil.v1')||'{}')")
    def ev(js): return page.evaluate(js)
    def shot(n, full=False): page.screenshot(path=f'{SHOTS}/{n}.png', full_page=full)
    def go(r, t=500): page.goto(BASE + '#/' + r); page.wait_for_timeout(t)
    def set_date(day):  # 'YYYY-MM-DD' öğlen; None → gerçek tarih
        if day is None: ev("localStorage.removeItem('test.dateoff')")
        else: ev(f"localStorage.setItem('test.dateoff', String(new Date('{day}T12:00:00').getTime() - (Date.now() - (+(localStorage.getItem('test.dateoff')||0)))))")
        page.reload(); page.wait_for_timeout(700)
    go('bugun', 800)
    ev("localStorage.setItem('yokdil.token', 'ghp_x')")
    # Eski (v6) biçimli veri: yeni alanlar yok → bozulmamalı
    ev("""import('./js/store.js').then(m => {
      m.put('progress', { id: 'exam:yokdil-fen-2020-1', examId: 'yokdil-fen-2020-1', answers: { 1: 0 }, flags: {}, cur: 0, startedAt: Date.now() - 60000, elapsed: 100, done: false });
      m.put('mocks', { id: 'mold', date: '2026-11-10', name: 'Eski deneme', sections: { bosluk: { d: 12, y: 6, b: 2 }, cloze: { d: 5, y: 4, b: 1 }, tamamlama: { d: 6, y: 4, b: 1 }, 'en-tr': { d: 4, y: 2, b: 0 }, 'tr-en': { d: 4, y: 2, b: 0 }, paragraf: { d: 3, y: 3, b: 0 }, ilgisiz: { d: 2, y: 4, b: 0 }, okuma: { d: 8, y: 6, b: 1 } } });
      m.put('settings', { id: 'main', theme: 'system', grammarCount: 8 }); })""")
    go('ayarlar', 400)
    page.click('button:has-text("Soruları güncelle")'); page.wait_for_timeout(2200)

    # A1) Araçlar: Süre planı · Hedef net · Sınav günü · Kaynaklar
    go('dersler')
    tools = [page.locator('.toolstrip .tool').nth(i).inner_text() for i in range(page.locator('.toolstrip .tool').count())]
    check(all(t in tools for t in ['Süre planı', 'Hedefe kaç doğru', 'Sınav günü', 'Kaynaklar']) and len(tools) == 10, f'Araçlar şeridi: 4 yeni araç ({len(tools)})')
    go('dersler/arac/sure')
    aids_m = merged('aids')
    n_sec = len([x for x in aids_m['timePlan']['sections'] if x.get('minutes')])
    check(not re.search(r'(?<!\d)0 soru', page.inner_text('main')) and '80 soru' in page.inner_text('main'), 'Süre planı: kontrol satırı "0 soru" yazmıyor, toplam 80 soru')
    check(page.locator('ol.tplan li').count() == n_sec and page.locator('.tp-bar i').count() == n_sec and 'dk' in page.locator('.tp-min').first.inner_text(), f'Süre planı: {n_sec} bölüm, dakika + çubuk')
    check(ev("document.documentElement.scrollWidth") <= 392, 'Süre planı ekrana sığıyor')
    shot('v7-sure-plani', True)
    go('dersler/arac/net')
    scores = sorted({t['score'] for t in aids_m['targets']})
    check(page.locator('.target-seg button').count() == len(scores), f'Hedef net: puan seçenekleri {scores}')
    page.click(f'.target-seg button:has-text("{scores[-1]} puan")'); page.wait_for_timeout(250)
    check(st()['settings']['main'].get('targetScore') == scores[-1] and page.locator('.target-seg .active').inner_text().startswith(str(scores[-1])), 'Hedef net: seçim Ayarlar\'a kaydedildi')
    hdr = [page.locator('.nettable th').nth(i).inner_text() for i in range(page.locator('.nettable th').count())]
    need_tot = next((t.get('total') or sum(t['nets'].values())) for t in aids_m['targets'] if t['score'] == scores[-1])
    tot_row = [page.locator('.nettable tr.total td').nth(i).inner_text() for i in range(4)]
    check(hdr == ['Bölüm', 'Gereken', 'Senin', 'Fark'] and tot_row[2] == '44', f'Hedef net: son deneme netlerin + fark sütunu ({tot_row})')
    check(need_tot is None or (tot_row[1] == str(need_tot) and tot_row[3] == '−' + str(need_tot - 44)), f'Hedef net: toplam gereken {need_tot}, fark doğru')
    check(page.locator('.nettable td.bad-t').count() >= 1, 'Hedef net: eksik bölüm kırmızı')
    shot('v7-hedef-net', True)
    go('ayarlar', 300)
    check(page.locator('input[aria-label="Hedef puan"]').input_value() == str(scores[-1]), 'Ayarlar: hedef puan alanı')
    go('dersler/arac/gun')
    n_chk = page.locator('ul.checklist .check').count()
    page.locator('ul.checklist .check').first.click(); page.wait_for_timeout(250)
    page.reload(); page.wait_for_timeout(600)
    check(n_chk >= 4 and page.locator('ul.checklist li.done').count() == 1 and page.locator('ul.checklist .check[aria-checked=true]').count() == 1, f'Sınav günü: tik kalıcı ({n_chk} madde)')
    shot('v7-sinav-gunu', True)
    go('dersler/arac/kaynak')
    links = page.locator('.reslist a')
    check(links.count() >= 1 and all(links.nth(i).get_attribute('target') == '_blank' and 'noopener' in links.nth(i).get_attribute('rel') for i in range(links.count())), f'Kaynaklar: bağlantılar yeni sekmede ({links.count()})')
    shot('v7-kaynaklar', True)

    # A2) Deneme: bölüm süresi göstergesi (eski kayıtta secTime yoktu)
    go('cikmis/sinav/yokdil-fen-2020-1', 900)
    plan_bos = next(x['minutes'] for x in aids_m['timePlan']['sections'] if x['type'] == 'bosluk')
    check(page.locator('.secclock:visible').count() == 1 and f'/{plan_bos} dk' in page.locator('.secclock').inner_text(), f'Deneme: "Bu bölüm: x/{plan_bos} dk" göstergesi ({page.locator(".secclock").inner_text()!r})')
    check(page.locator('.opt.chosen').count() == 1, 'eski deneme kaydı (secTime yok) bozulmadan açıldı')
    go('bugun', 300)
    ev(f"""import('./js/store.js').then(m => {{ const p = m.get('progress', 'exam:yokdil-fen-2020-1'); m.put('progress', {{ ...p, elapsed: {plan_bos * 60 + 100}, secTime: {{ bosluk: {plan_bos * 60 + 55} }} }}); }})""")
    page.wait_for_timeout(300)
    go('cikmis/sinav/yokdil-fen-2020-1', 2300)
    check(page.locator('.secclock.over').count() == 1 and f'{plan_bos}/{plan_bos} dk' in page.locator('.secclock').inner_text(), f'Deneme: süre aşılınca renk değişir ({page.locator(".secclock").inner_text()!r})')
    shot('v7-deneme-bolum-suresi')
    page.click('.secclock .icon-x'); page.wait_for_timeout(300)
    check(page.locator('.secclock:visible').count() == 0 and st()['settings']['main'].get('secClock') is False, 'bölüm süresi göstergesi kapatılabilir')
    ev("import('./js/store.js').then(m => m.setSetting('secClock', true))"); page.wait_for_timeout(1500)
    check(page.locator('.secclock:visible').count() == 1, 'gösterge ayardan geri açılır')
    # Birkaç soru cevapla (yanlış + doğru), cloze bölümünde biraz bekle, bitir
    for n in range(3):
        page.locator('.opt').nth(n % 5).click(); page.wait_for_timeout(120)
        page.click('.exam-nav .main-act'); page.wait_for_timeout(150)
    page.click('.secstrip .chip:has-text("Cloze")'); page.wait_for_timeout(2300)
    page.locator('.opt').nth(1).click(); page.wait_for_timeout(150)
    page.click('.readbar button:has-text("Bitir")'); page.wait_for_timeout(900)
    check('#/cikmis/sonuc/yokdil-fen-2020-1' in page.url, 'deneme bitti → sonuç')
    page.wait_for_timeout(500)
    pr = st()['progress']['exam:yokdil-fen-2020-1']
    check(pr.get('secTime', {}).get('bosluk', 0) >= plan_bos * 60 and pr['secTime'].get('cloze', 0) >= 2, f'bölüm süreleri kaydedildi ({pr.get("secTime")})')
    mk = [m for m in st()['mocks'].values() if m.get('examId') == 'yokdil-fen-2020-1'][-1]
    check(mk.get('times', {}).get('bosluk', 0) >= plan_bos * 60, 'deneme kaydında bölüm süreleri (senkrona girer)')
    th = [page.locator('.timetable th').nth(i).inner_text() for i in range(page.locator('.timetable th').count())]
    row0 = [page.locator('.timetable tr').nth(1).locator('td').nth(i).inner_text() for i in range(5)]
    check(th == ['Bölüm', 'Doğru', 'dk', 'Hedef', 'sn/soru'] and row0[3] == str(plan_bos) and int(row0[2]) > plan_bos and int(row0[4]) >= plan_bos * 3, f'Sonuç: bölüm başına net / dk / hedef / sn-soru ({row0})')
    check(page.locator('.timetable td.bad-t').count() >= 1, 'Sonuç: hedefi aşan süre kırmızı')
    # A3) Deneme analizi: neden çipleri + özet + analiz adımları
    n_reason = len(aids_m['errorReasons'])
    check(page.locator('.secgroup[open]').count() == 0, 'sonuç: bölümler kapalı gelir')
    page.locator('.secgroup summary').first.click(); page.wait_for_timeout(250)
    first_wrap = page.locator('.secgroup[open] .qwrong-wrap').first
    check(first_wrap.locator('.reasons .chip.reason').count() == 3 and first_wrap.locator('.reasons .reason-more').count() == (1 if n_reason > 3 else 0), f'Sonuç: her yanlışta 3 ana neden çipi + Diğer ▸ ({n_reason} neden)')
    wraps = page.locator('.secgroup[open] .qwrong-wrap')
    wraps.nth(0).locator('.reasons .chip').nth(0).click(); page.wait_for_timeout(150)
    wraps.nth(1).locator('.reasons .chip').nth(0).click(); page.wait_for_timeout(150)
    wraps.nth(2).locator('.reasons .chip').nth(1).click(); page.wait_for_timeout(250)
    rs = st().get('reasons', {})
    r0 = aids_m['errorReasons'][0]
    check(len([r for r in rs.values() if not r.get('deleted')]) == 3 and sum(1 for r in rs.values() if r.get('reason') == r0['id']) == 2, 'neden seçimi tek dokunuşla kaydedildi (reasons)')
    check(page.locator('.reason-card .cbar').count() == 2 and r0['label'] in page.locator('.reason-advice').inner_text() and r0['advice'][:20] in page.locator('.reason-advice').inner_text(), 'özet: neden dağılımı + en sık nedenin tavsiyesi')
    check(page.locator('.reasons .chip.on[aria-pressed=true]').count() == 3, 'seçili çipler işaretli')
    n_steps = len(aids_m['mockAnalysis'])
    check(page.locator('.analysis ul.checklist li:visible').count() == min(3, n_steps) and page.locator('.analysis ul.checklist li').count() == n_steps and 'Sonra ne yapayım' in page.inner_text('.analysis h3'), f'analiz: ilk 3 adım görünür, gerisi Tümü ▸ ({n_steps}): {page.inner_text(".analysis h3")}')
    page.locator('.analysis .check').first.click(); page.wait_for_timeout(250)
    check(page.locator('.analysis li.done').count() == 1 and any(k.startswith('analiz:exam:yokdil-fen-2020-1') for k in st()['progress']), 'analiz adımı işaretlendi')
    check(ev("document.documentElement.scrollWidth") <= 392, 'sonuç ekranı taşmıyor')
    shot('v7-deneme-sonuc', True)
    # Nedenler Eksikler'de birikimli
    go('eksikler', 600)
    check(page.locator('.reasons-all .cbar').count() == 2 and '3 işaretli' in page.inner_text('.reasons-all'), 'Eksikler: hata nedenleri birikimli grafik')
    txt = page.inner_text('main')
    mcs = re.search(r'Sık kelime listesi: (\d+)/(\d+) görüldü', txt)
    n_words = len(json.load(open(f'{ROOT}/data/words.json', encoding='utf-8')))
    check(mcs is not None and int(mcs.group(2)) == n_words and 'hedef 2000' in txt, f'Eksikler: çekirdek liste ilerlemesi ({mcs.group(0) if mcs else None}), hedef 2000 duruyor')
    # D2) Okuma hızı haftalık grafik + hedef çizgisi
    ev("""import('./js/store.js').then(m => { const now = Date.now(), d = 86400000;
      [[1, 95], [2, 105], [9, 88], [16, 80], [17, 84]].forEach(([ago, wpm], i) => m.put('progress', { id: 'read:t' + i, kind: 'read', words: 200, secs: 120, wpm, level: 1, at: now - ago * d, right: 2, total: 3 })); })""")
    page.wait_for_timeout(300); page.reload(); page.wait_for_timeout(800)
    check(page.locator('svg.weekbars rect.bar').count() >= 3 and page.locator('svg.weekbars .goalL').count() == 1 and 'hedef (120 kelime/dk)' in page.inner_text('main'), f'Eksikler: okuma hızı haftalık grafik + hedef çizgisi ({page.locator("svg.weekbars rect.bar").count()} hafta)')
    shot('v7-eksikler', True)

    # A4) Yarım deneme: ilk 40 soru / 90 dk, süre bitince otomatik biter
    go('cikmis', 600)
    page.locator('details.secpick summary').first.click(); page.wait_for_timeout(200)
    check(page.locator('a.half-link').first.inner_text() == 'Yarım deneme: ilk 40 soru · 90 dk', 'Çıkmış: yarım deneme bağlantısı')
    go('cikmis/sinav/yds-2019-1/yarim', 900)
    check('1/40' in page.locator('.qhead').inner_text() and page.locator('.timer').inner_text() in ('1:30:00', '1:29:59', '1:29:58', '1:29:57'), f'Yarım deneme: 40 soru, 90 dk ({page.locator(".timer").inner_text()})')
    page.click('.readbar button:has-text("Optik")'); page.wait_for_timeout(200)
    check(page.locator('.optik button').count() == 40, 'Yarım deneme: optikte 40 soru')
    page.locator('.opt').nth(0).click(); page.wait_for_timeout(150)
    shot('v7-yarim-deneme')
    go('bugun', 400)
    check(page.locator('a.exam-resume[href$="/yarim"]').count() == 1, 'Bugün: yarım kalan yarım deneme bandı (/yarim)')
    ev("import('./js/store.js').then(m => { const p = m.get('progress', 'exam:yds-2019-1~yarim'); m.put('progress', { ...p, elapsed: 90 * 60 - 2 }); })"); page.wait_for_timeout(300)
    go('cikmis/sinav/yds-2019-1/yarim', 3800)
    check(page.url.endswith('#/cikmis/sonuc/yds-2019-1/yarim'), f'Yarım deneme: süre bitince otomatik biter ({page.url.split("#")[-1]})')
    hm = [m for m in st()['mocks'].values() if m.get('half')]
    check(len(hm) == 1 and hm[0]['score'] in (0, 3) and hm[0].get('pct') and 'ilk 40' in hm[0]['name'], f'Yarım deneme kaydı: doğru yüzdesi, 80 soruya oranlanmıyor ({hm[0]["score"] if hm else None})')
    check('ilk 40 soru' in page.inner_text('h2') and '/40' in page.inner_text('.hero .big') and 'yalnız tam denemede' in page.inner_text('.hero'), 'Yarım sonuç ekranı: x/40 doğru, tahmini puan yok')
    check(st()['progress'].get('exam:yds-2019-1') is None, 'yarım deneme tam deneme kaydını etkilemedi')
    shot('v7-yarim-sonuc', True)
    go('eksikler', 600)
    check('Deneme: Okuma' not in page.inner_text('main') and 'ilk 40' in page.inner_text('main'), 'Eksikler: yarım denemede olmayan bölüm %0 sayılmıyor')

    # B) Çeviri: Parçala
    ev("""Promise.all([import('./js/store.js'), import('./js/data.js')]).then(async ([m, d]) => { let n = 0;
      for (const x of await d.drills()) if (x.type.startsWith('ceviri')) x.items.forEach((it, i) => { if (!it.parts) m.put('grammarLog', { id: 'seen' + (n++), q: x.id + '#' + i, correct: true, kind: 'drill', dtype: x.type, day: '2026-01-01', at: 1 }); }); })""")
    page.wait_for_timeout(500)
    go('alistirma/ceviri-en-tr', 700)
    check(page.locator('.parts-btn:visible').count() == 1 and page.locator('.part').count() == 0, 'Çeviri: "Parçala" düğmesi cevaptan önce')
    page.click('.parts-btn'); page.wait_for_timeout(200)
    n_parts = page.locator('.part').count()
    check(n_parts >= 3 and page.locator('.part-role').count() >= 3 and page.locator('.part-tgt').count() == 0, f'Parçala: {n_parts} renkli blok + rol etiketi, karşılık gizli')
    check(len(set(page.locator('.part').nth(i).get_attribute('class') for i in range(n_parts))) >= 3, 'Parçala: bloklar farklı renkte')
    check(ev("document.documentElement.scrollWidth") <= 392, 'Parçala: taşma yok')
    shot('v7-ceviri-parcala')
    k0 = st()['sessions']['alistirma:ceviri-en-tr']['keys'][0].split('#')
    ans0 = next(d for d in merged('drills') if d['id'] == k0[0])['items'][int(k0[1])]['answer']
    page.locator('.opt').nth((ans0 + 1) % 5).click(); page.wait_for_timeout(400)
    check(page.locator('.explain .partsbox.revealed .part-tgt').count() >= 3 and page.locator('.explain .part-check li').count() >= 1 and page.locator('.parts-btn').count() == 0, 'Cevaptan sonra: karşılıklar (tgt) + kontrol maddeleri')
    # A3) alıştırma yanlışında küçük neden çipi
    check(page.locator('.explain .reasons .chip.reason').count() == 3, 'Alıştırma yanlışında 3 ana neden çipi')
    page.locator('.explain .reasons .chip.reason').nth(2).click(); page.wait_for_timeout(250)
    check(any(r.get('src') == 'drill' and r.get('reason') == 'sure' for r in st()['reasons'].values()), 'alıştırma nedeni kaydedildi (Süre)')
    check(reachable('.actbar .btn.primary:not(.hidden)', False), 'Parçala sonrası "Sonraki" erişilebilir')
    shot('v7-ceviri-cevap', True)
    go('alistirma/ceviri-tr-en', 700)
    if page.locator('button:has-text("Baştan başla")').count(): page.click('button:has-text("Baştan başla")'); page.wait_for_timeout(200)
    page.click('.parts-btn'); page.wait_for_timeout(200)
    check(page.locator('.part').count() >= 3, 'Parçala: Tr→İng sorusunda da çalışır')
    go('alistirma/cloze', 600)
    check(page.locator('.parts-btn').count() == 0, 'parts olmayan soruda "Parçala" yok')

    # C) Bağlamdan tahmin
    go('kartlar', 500)
    check(page.locator('a.guess-link').count() == 1, 'Kartlar: Bağlamdan tahmin girişi')
    go('okuma', 500)
    check(page.locator('a.guess-link').count() == 1, 'Okuma: Bağlamdan tahmin girişi')
    page.click('a.guess-link'); page.wait_for_timeout(900)
    mk_ = page.locator('.hlq mark')
    check(mk_.count() == 1 and page.locator('.opt').count() == 4, f'Tahmin: cümlede vurgulu kelime + 4 şık ({mk_.inner_text() if mk_.count() else None})')
    opts_t = [page.locator('.opt .otext').nth(i).inner_text() for i in range(4)]
    check(len(set(opts_t)) == 4 and all(o.strip() for o in opts_t), f'Tahmin: şıklar farklı Türkçe anlamlar {opts_t}')
    shot('v7-tahmin')
    page.locator('.opt').nth(0).click(); page.wait_for_timeout(300)
    check(page.locator('.opt.right').count() == 1 and ' = ' in page.locator('.explain').inner_text(), 'Tahmin: cevap + anlam açıklaması')
    check(reachable('.actbar .btn.primary:not(.hidden)', False), 'Tahmin: "Sonraki" erişilebilir')
    for i in range(12):
        if page.locator('.endcard').count(): break
        if page.locator('.opt:not(.done)').count(): page.locator('.opt').nth(1).click(); page.wait_for_timeout(120)
        page.click('.actbar .btn.primary'); page.wait_for_timeout(150)
    check(page.locator('.endcard').count() == 1 and page.locator('a:has-text("Yeni tur")').count() == 1, 'Tahmin: tur bitti (10 soru)')

    # D1) Aynı kişisel kuraldan 2 yanlış → Bugün'e kural kartı görevi
    wrong_topics = {l.get('topic') for l in st()['grammarLog'].values() if not l.get('correct')}
    rule_topic = next(r['topic'] for r in aids_m['personalRules'] if r['topic'] not in wrong_topics)
    go('bugun', 500)
    check(page.locator('.rule-tasks li').count() == 0, 'kural görevi: yanlış yokken yok')
    ev(f"""import('./js/store.js').then(m => {{ const now = Date.now(); const day = new Date(now).toISOString().slice(0, 10);
      for (let i = 0; i < 2; i++) m.put('grammarLog', {{ id: 'rw' + i, q: 'g000' + i, correct: false, kind: 'gramer', topic: '{rule_topic}', at: now - i * 1000, day: (() => {{ const d = new Date(now); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }})() }}); }})""")
    page.wait_for_timeout(300); go('bugun', 300); page.reload(); page.wait_for_timeout(700)
    check(page.locator(f'.rule-tasks li[data-rule="{rule_topic}"]').count() == 1 and 'Kural kartı' in page.inner_text('.rule-tasks'), 'Bugün: kural kartı görevi (2 yanlış)')
    shot('v7-bugun-kural-gorevi', True)
    page.click('.rule-tasks a.task'); page.wait_for_timeout(500)
    check(page.locator('.rulecard.focus').count() >= 1 and page.locator('.rulecard').first.get_attribute('class').find('focus') >= 0, 'kural kartı üstte ve vurgulu')
    shot('v7-kural-karti', True)
    page.click('.rule-ack'); page.wait_for_timeout(600)
    check(page.url.endswith('#/bugun') and page.locator('.rule-tasks li').count() == 0 and st()['progress'].get('kural:' + rule_topic, {}).get('ackAt'), 'Okudum → görev kapandı')

    # E) Dersler: gruplar + arama + yeni konu adları
    go('dersler', 600)
    gnames = [page.locator('details.lgroup > summary b').nth(i).inner_text() for i in range(page.locator('details.lgroup').count())]
    check(gnames == ['Bu hafta', 'Bağlaçlar', 'Edatlar', 'Zaman', 'Cümle yapıları', 'Kelime', 'Soru tipi taktikleri', 'Strateji'], f'Dersler grupları: {gnames}')
    n_less = len(merged('lessons'))
    grouped = sum(page.locator('details.lgroup').nth(i).locator('li').count() for i in range(1, len(gnames)))
    check(grouped == n_less, f'her ders tam bir grupta ({grouped}/{n_less})')
    check(page.locator('details.lgroup[open]').count() == 1 and page.locator('details.lgroup').first.get_attribute('open') is not None, 'yalnız "Bu hafta" açık (katlanabilir)')
    page.locator('details.lgroup > summary').nth(7).click(); page.wait_for_timeout(200)
    check(page.locator('details.lgroup').nth(7).locator('li:visible').count() >= 2, 'Strateji grubu açılır')
    page.fill('.lsearch', 'despite'); page.wait_for_timeout(250)
    vis = page.locator('details.lgroup li:visible').count()
    check(0 < vis < n_less and all('despite' in (page.locator('details.lgroup li:visible').nth(i).get_attribute('data-q') or '') for i in range(vis)), f'ders arama: "despite" → {vis} ders')
    shot('v7-dersler-arama', True)
    page.fill('.lsearch', 'zzzyok'); page.wait_for_timeout(200)
    check(page.locator('text=Eşleşen ders yok.').is_visible(), 'ders arama: boş durum mesajı')
    page.fill('.lsearch', ''); page.wait_for_timeout(200)
    check(page.locator('details.lgroup[open]').count() == 1 and page.locator('details.lgroup.hidden').count() == 0, 'arama temizlenince gruplar eski haline döner')
    shot('v7-dersler', True)
    go('dersler/taktik-sure', 500)
    check('Strateji' in page.inner_text('main') and 'strateji ·' not in page.inner_text('main'), 'yeni konu adı: Strateji')
    go('dersler/taktik-kelime-tahmini', 500)
    check('Kelime tahmini' in page.inner_text('main'), 'yeni konu adı: Kelime tahmini')

    # Erişilebilirlik: klavye odağı görünür
    go('gramer', 500)
    page.keyboard.press('Tab'); page.keyboard.press('Tab'); page.wait_for_timeout(150)
    ow = ev("(() => { const e = document.activeElement; const c = getComputedStyle(e); return [e.tagName, c.outlineStyle, parseFloat(c.outlineWidth)]; })()")
    check(ow[1] != 'none' and ow[2] >= 2, f'klavye odağı: görünür halka {ow}')

    # A5) Son 14 gün modu + başvuru bantları (tarih taklidi)
    ev("import('./js/store.js').then(m => m.setSetting('newLimit', 15))"); page.wait_for_timeout(300)
    set_date('2026-11-28')
    go('bugun', 500)
    dl = page.locator('li[data-task=deneme] a.task')
    check(dl.count() == 1 and dl.get_attribute('href').endswith('/yarim') and '90 dk' in dl.inner_text() and page.locator('details.optional-tasks').count() == 1, 'Bugün: programdaki yarım deneme günü → deneme görevi (ilk 40 / 90 dk), gerisi isteğe bağlı')
    check(page.locator('.banner.final').count() == 0 and page.locator('.banner.apply').count() == 0 and page.locator('li[data-task=okuma]').count() == 1, 'normal günde son-14-gün / başvuru bandı yok')
    set_date('2027-01-05'); go('bugun', 500)
    check(page.locator('.banner.apply.soon').count() == 1 and 'Başvuruya 7 gün' in page.inner_text('.banner.apply') and '12 Oca' in page.inner_text('.banner.apply') and '20 Oca' in page.inner_text('.banner.apply'), f'Başvuru bandı: yaklaşırken ({page.inner_text(".banner.apply") if page.locator(".banner.apply").count() else None})')
    shot('v7-bugun-basvuru')
    set_date('2027-01-19'); go('bugun', 500)
    check(page.locator('.banner.apply.open').count() == 1 and 'son 1 gün' in page.inner_text('.banner.apply'), 'Başvuru bandı: açıkken son gün sayacı')
    set_date('2027-01-25'); go('bugun', 500)
    check(page.locator('.banner.apply.late').count() == 1 and '28 Oca' in page.inner_text('.banner.apply'), 'Başvuru bandı: geç başvuru')
    set_date('2027-02-01'); go('bugun', 500)
    check(page.locator('.banner.apply').count() == 0 and page.locator('.banner.final').count() == 0, 'başvuru bitince bant yok; 27 gün kala son-14 modu yok')
    set_date('2027-02-20'); go('bugun', 600)
    keys = [page.locator('ul.tasks:not(.extra) li').nth(i).get_attribute('data-task') for i in range(page.locator('ul.tasks:not(.extra) li').count())]
    check(page.locator('.banner.final').count() == 1 and 'Son 8 gün' in page.inner_text('.banner.final') and 'en fazla 5' in page.inner_text('.banner.final'), f'Son 14 gün bandı ({page.inner_text(".banner.final") if page.locator(".banner.final").count() else None})')
    check('deneme' in keys and 'okuma' not in keys and keys[0] == 'kart', f'Son 14 gün: görevler tekrar + hata + deneme ağırlıklı {keys}')
    nq = ev("import('./js/srs.js').then(m => m.newQueue()).then(q => q.length)")
    check(nq <= 5, f'Son 14 gün: yeni kelime 15 → en fazla 5 ({nq})')
    ed0 = [g for g in aids_m['examDay'] if g.get('items')]
    check(page.locator('.examday-band').count() >= 1 and page.locator('.examday-band .check').count() >= 1, f'Son 14 gün: sınav günü maddeleri bant olarak ({page.locator(".examday-band b").first.inner_text() if page.locator(".examday-band").count() else None})')
    shot('v7-bugun-son14', True)
    d0 = page.locator('.examday-band li.done').count()
    page.locator('.examday-band .check').last.click(); page.wait_for_timeout(300)
    check(page.locator('.examday-band li.done').count() == d0 + 1, 'bant maddesi tiklenebilir')
    check(ev("document.documentElement.scrollWidth") <= 392, 'son 14 gün ekranı taşmıyor')
    set_date('2027-02-27'); go('bugun', 600)
    keys = [page.locator('ul.tasks:not(.extra) li').nth(i).get_attribute('data-task') for i in range(page.locator('ul.tasks:not(.extra) li').count())]
    nq = ev("import('./js/srs.js').then(m => m.newQueue()).then(q => q.length)")
    check(nq == 0 and 'yeni' not in keys and 'Yeni kelime: yok' in page.inner_text('.banner.final'), f'Son 3 gün: yeni kelime 0 {keys}')
    band1 = page.locator('.examday-band b').first.inner_text() if page.locator('.examday-band').count() else ''
    check(band1 != '' and (len(ed0) < 2 or band1 != ed0[0]['when']), f'sınava 1 gün kala bant değişti ({band1})')
    shot('v7-bugun-son1', True)
    ev("import('./js/store.js').then(m => m.setSetting('finalMode', false))"); page.wait_for_timeout(300); page.reload(); page.wait_for_timeout(700)
    check(page.locator('.banner.final').count() == 0 and page.locator('li[data-task=okuma]').count() == 1, 'Son 14 gün modu Ayarlar\'dan kapatılabilir')
    ev("import('./js/store.js').then(m => { m.setSetting('finalMode', true); m.setSetting('newLimit', null); })"); page.wait_for_timeout(300)
    set_date(None)
    ctx.close()

    # E) Genel QA: tüm rotalar 390x844 ve 1280x860 — yatay taşma, kesilen düğme metni, boş sayfa
    QA = ROUTES + ['dersler/arac/sure', 'dersler/arac/net', 'dersler/arac/gun', 'dersler/arac/kaynak', 'dersler/arac/agac', 'dersler/arac/kutup', 'dersler/arac/zaman', 'dersler/arac/kopya',
                   'dersler/arac/eleme', 'dersler/arac/kural', 'dersler/baglac-zitlik', 'dersler/taktik-sure', 'kartlar/tahmin', 'kartlar/tara', 'kartlar/bosluk', 'kartlar/es', 'kartlar/aile',
                   'gramer/gunluk', 'gramer/hata', 'gramer/konu/relative', 'alistirma/cloze', 'alistirma/ceviri-en-tr', 'alistirma/paragraf', 'okuma/p/p001', 'okuma/yeni',
                   'cikmis/sinav/yokdil-fen-2019', 'cikmis/sinav/yds-2019-2/yarim', 'cikmis/tip/cloze', 'cikmis/sonuc/yokdil-fen-2021-1']
    CLIP = """() => [...document.querySelectorAll('main .btn, main .chip, main .tool, main .seg > *, main h2, main h3, main th, main td, nav.tabs a span, header .btn-label')].filter(e => {
        if (!e.offsetParent || e.closest('.toolstrip, .secstrip, .polcards, .ellipsis, .list.compact')) return false;
        return e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX !== 'visible'; }).map(e => e.className + ':' + e.textContent.slice(0, 30))"""
    OVER = """() => { const vw = document.documentElement.clientWidth; return [...document.querySelectorAll('main *')].filter(e => { if (!e.offsetParent || e.closest('.toolstrip, .secstrip, .polcards, .tblwrap, .tbl, svg')) return false;
        const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 2 || r.left < -2); }).slice(0, 5).map(e => e.tagName + '.' + e.className); }"""
    for name, vp, mobile in [('m', {'width': 390, 'height': 844}, True), ('d', {'width': 1280, 'height': 860}, False)]:
        ctx, page = v7ctx(vp, mobile, 'qa-' + name)
        page.goto(BASE + '#/bugun'); page.wait_for_timeout(700)
        page.evaluate("localStorage.setItem('yokdil.token', 'ghp_x')")
        page.goto(BASE + '#/ayarlar'); page.wait_for_timeout(300)
        page.click('button:has-text("Soruları güncelle")'); page.wait_for_timeout(2200)
        # Bitmiş bir deneme (sonuç ekranı için) + biraz veri
        page.evaluate("""import('./js/store.js').then(m => { const now = Date.now();
          m.put('progress', { id: 'exam:yokdil-fen-2021-1', examId: 'yokdil-fen-2021-1', answers: { 1: 0, 2: 1, 3: 2, 21: 0 }, flags: {}, cur: 0, startedAt: now, elapsed: 5400, done: true, score: 2.5, attempts: 1,
            secTime: { bosluk: 1500, cloze: 800, tamamlama: 900, okuma: 2200 }, sections: { bosluk: { d: 1, y: 2, b: 17, n: 20 }, cloze: { d: 1, y: 0, b: 9, n: 10 }, tamamlama: { d: 0, y: 0, b: 11, n: 11 }, 'en-tr': { d: 0, y: 0, b: 6, n: 6 }, 'tr-en': { d: 0, y: 0, b: 6, n: 6 }, paragraf: { d: 0, y: 0, b: 6, n: 6 }, ilgisiz: { d: 0, y: 0, b: 6, n: 6 }, okuma: { d: 0, y: 0, b: 15, n: 15 } } });
          for (let i = 0; i < 25; i++) m.put('cards', { id: 'qa' + i, word: ['yield', 'robust', 'decline', 'obtain', 'vary'][i % 5] + (i < 5 ? '' : i), tr: 't' + i, state: 'review', interval: 2, ease: 2.5, reps: 2, due: now - 1000, hist: ['g', 'g'] }); })""")
        page.wait_for_timeout(400)
        bad = []
        for r in QA:
            page.goto(BASE + '#/' + r); page.wait_for_timeout(550)
            if page.locator('button:has-text("Baştan başla")').count(): page.click('button:has-text("Baştan başla")'); page.wait_for_timeout(250)
            sw = page.evaluate('document.documentElement.scrollWidth')
            if sw > vp['width'] + 2: bad.append(f'{r}: yatay taşma {sw}')
            clip = page.evaluate(CLIP)
            if clip: bad.append(f'{r}: kesilen metin {clip[:3]}')
            over = page.evaluate(OVER)
            if over: bad.append(f'{r}: ekran dışı öğe {over}')
            if len(page.inner_text('main').strip()) < 20: bad.append(f'{r}: boş sayfa')
            if 'undefined' in page.inner_text('main') or 'NaN' in page.inner_text('main') or '\nnull\n' in '\n' + page.inner_text('main') + '\n': bad.append(f'{r}: undefined/NaN/null metni')
            page.screenshot(path=f'{SHOTS}/qa-{name}-{r.replace("/", "_")}.png', full_page=True)
        check(not bad, f'QA {vp["width"]}x{vp["height"]}: {len(QA)} rota — taşma / kesilen metin / boş sayfa yok' + (' → ' + ' | '.join(bad) if bad else ''))
        ctx.close()

    # --- v8) Kelime yıldızı (data/stars.json)
    STARS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'stars.json'), encoding='utf-8'))['words']
    WORDS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'words.json'), encoding='utf-8'))
    check(STARS and all(isinstance(v, int) and 1 <= v <= 5 for v in STARS.values()) and set(json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'stars.json'), encoding='utf-8')).keys()) == {'v', 'method', 'words'},
          f'stars.json: yalnız kelime → 1–5 ({len(STARS)} kelime)')
    check(all('star' not in w for w in WORDS), 'words.json değişmedi (star alanı yok)')
    ctx, page = v7ctx({'width': 390, 'height': 844}, True, 'v8')
    def ev(js): return page.evaluate(js)
    def shot(n, full=False): page.screenshot(path=f'{SHOTS}/{n}.png', full_page=full)
    def go(r, t=500): page.goto(BASE + '#/' + r); page.wait_for_timeout(t)
    go('bugun', 800)
    # Seed kartlarını ele (yeni kuyrukta çekirdek liste görünsün), eski biçimli ayar kaydı (starFirst yok)
    ev("""import('./js/store.js').then(m => { for (const c of m.all('cards')) m.put('cards', { ...c, state: 'known', knownAt: 1 }); m.put('settings', { id: 'main', theme: 'system', grammarCount: 8, newLimit: 30 }); })""")
    page.wait_for_timeout(300)
    star = lambda w: STARS.get(w.lower())
    have = set(ev("import('./js/store.js').then(m => m.all('cards').map(c => (c.word || '').toLowerCase()))"))
    base = [w['word'] for _, w in sorted(enumerate(WORDS), key=lambda x: (-(x[1].get('freq') or 0), x[0])) if w['word'].lower() not in have]
    q_off = ev("import('./js/srs.js').then(m => m.newQueue()).then(q => q.map(x => x.word ? x.word.word : '#' + x.card.word))")
    check(q_off == base[:30], f'ayar kapalı (varsayılan): yeni kelime sırası değişmedi ({q_off[:4]})')
    # Yeni oturum: ön yüzde yıldız, dokununca açıklama, kart açılmaz
    go('kartlar/yeni', 600)
    w0 = page.locator('.flash .fword').inner_text().strip()
    st0 = page.locator('.flash .starrow .stars')
    check(st0.count() == 1 and int(st0.get_attribute('data-n')) == star(w0) and st0.locator('i.on').count() == star(w0), f'yeni kelime ön yüzünde yıldız: {w0} → {star(w0)}★')
    h = st0.bounding_box()['height']; rowh = page.locator('.flash .starrow').bounding_box()['height']
    check(rowh < 34, f'yıldız satırı tek satır ({rowh:.0f}px)')
    shot('v8-kart-on')
    st0.click(); page.wait_for_timeout(250)
    check('Sınavda ne sık çıktığı' in page.locator('#toast').inner_text() and page.locator('.back.hidden').count() == 1, 'yıldıza dokun → kısa açıklama; kart açılmadı')
    shot('v8-kart-aciklama')
    page.click('button:has-text("Göster")'); page.wait_for_timeout(200)
    check(page.locator('.back .stars').count() == 0, 'arka yüzde ek yıldız yok (kalabalık değil)')
    shot('v8-kart-arka')
    # Ayar açık → sıra yıldıza göre; kendi eklediğin kelime yine en önde
    go('ayarlar', 500)
    sw_ = page.locator('label.switch:has-text("çok çıkanlar önce") input')
    check(sw_.count() == 1 and not sw_.is_checked(), 'Ayarlar: "Yeni kelimelerde çok çıkanları öne al" var, varsayılan kapalı')
    shot('v8-ayarlar', True)
    sw_.check(); page.wait_for_timeout(300)
    on = [w['word'] for _, w in sorted(enumerate(WORDS), key=lambda x: (-(star(x[1]['word']) or 0), -(x[1].get('freq') or 0), x[0])) if w['word'].lower() not in have]
    q_on = ev("import('./js/srs.js').then(m => m.newQueue()).then(q => q.map(x => x.word ? x.word.word : '#' + x.card.word))")
    check(q_on == on[:30] and q_on != q_off and all(star(w) == 5 for w in q_on[:10]), f'ayar açık: yıldız yüksek olan önce ({q_on[:4]})')
    ev("import('./js/store.js').then(m => m.put('cards', { id: 'mine1', word: 'zzmyword', tr: 'benim', state: 'new', createdAt: Date.now(), mine: Date.now(), source: 'Okuma' }))"); page.wait_for_timeout(200)
    q2 = ev("import('./js/srs.js').then(m => m.newQueue()).then(q => q.map(x => x.word ? x.word.word : '#' + x.card.word))")
    check(q2[0] == '#zzmyword' and q2[1:] == on[:29], 'ayar açıkken de kendi eklediğin kelime en önde')
    go('kartlar/yeni', 600)
    check(page.locator('.flash .fword').inner_text().strip() == 'zzmyword' and page.locator('.flash .stars').count() == 0, 'yıldızı olmayan (kendi) kelimede yıldız gösterilmiyor')
    page.click('button:has-text("Göster")'); page.click('.g-good'); page.wait_for_timeout(300)
    w1 = page.locator('.flash .fword').inner_text().strip()
    check(star(w1) == 5 and page.locator('.flash .stars').get_attribute('data-n') == '5', f'ayar açık: sıradaki çekirdek kelime 5★ ({w1})')
    shot('v8-yeni-5yildiz')
    # Kelime tarama
    go('kartlar/tara', 600)
    sw0 = page.locator('.scan-card .fword').inner_text().strip()
    check(page.locator('.scan-card .stars').count() == 1 and int(page.locator('.scan-card .stars').get_attribute('data-n')) == star(sw0) == 5, f'kelime taramada yıldız ({sw0})')
    shot('v8-tara')
    sw_on = ev("import('./js/views/scan.js').then(m => m.unseenCore(5)).then(l => l.map(w => w.word))")
    ev("import('./js/store.js').then(m => m.setSetting('starFirst', false))"); page.wait_for_timeout(200)
    sw_off = ev("import('./js/views/scan.js').then(m => m.unseenCore(5)).then(l => l.map(w => w.word))")
    have2 = set(ev("import('./js/store.js').then(m => m.all('cards').map(c => (c.word || '').toLowerCase()))"))
    exp_off = [w['word'] for _, w in sorted(enumerate(WORDS), key=lambda x: (-(x[1].get('freq') or 0), x[0])) if w['word'].lower() not in have2][:5]
    exp_on = [w['word'] for _, w in sorted(enumerate(WORDS), key=lambda x: (-(star(x[1]['word']) or 0), -(x[1].get('freq') or 0), x[0])) if w['word'].lower() not in have2][:5]
    check(sw_on == exp_on and sw_off == exp_off, f'tarama sırası yeni kuyrukla aynı (ayara bağlı) {sw_on} / {sw_off}')
    # Kart listesi: yıldız, sıralama, 4★ filtresi
    ev("""import('./js/store.js').then(m => { const now = Date.now(); const ws = ['albeit', 'cell', 'yield', 'abandon', 'abundant', 'qqnostar'];
      ws.forEach((w, i) => m.put('cards', { id: 'v8c' + i, word: w, tr: 't' + i, state: 'review', interval: 3, ease: 2.5, reps: 2, due: now + 86400000 * 3, hist: ['g', 'g'], source: 'Diğer' })); })""")
    go('kartlar/liste', 600)
    page.locator('main select').nth(0).select_option('Diğer'); page.wait_for_timeout(200)
    names = lambda: [x.strip() for x in page.locator('ul.list li a b').all_inner_texts()]
    nst = lambda: [(page.locator('ul.list li').nth(i).locator('.stars').get_attribute('data-n') if page.locator('ul.list li').nth(i).locator('.stars').count() else None) for i in range(page.locator('ul.list li').count())]
    nm = names(); ns = nst()
    check(nm == sorted(nm, key=str.lower) and ns[nm.index('qqnostar')] is None and ns[nm.index('cell')] == str(star('cell')), f'listede yıldız; yıldızı olmayanda yok {list(zip(nm, ns))}')
    page.locator('.starbar select').select_option('star'); page.wait_for_timeout(200)
    vals = [int(x) if x else 0 for x in nst()]
    check(vals == sorted(vals, reverse=True) and vals[0] == 5, f'listede yıldıza göre sırala {list(zip(names(), vals))}')
    shot('v8-liste-sirali', True)
    page.locator('.starbar input[type=checkbox]').check(); page.wait_for_timeout(200)
    vals4 = [int(x) if x else 0 for x in nst()]
    exp4 = sum(1 for w in ['albeit', 'cell', 'yield', 'abandon', 'abundant', 'qqnostar'] if (star(w) or 0) >= 4)
    check(vals4 and all(v >= 4 for v in vals4) and len(vals4) == exp4, f'"4★ ve üstü" filtresi ({len(vals4)}/{exp4})')
    shot('v8-liste-4yildiz', True)
    check(ev("document.documentElement.scrollWidth") <= 392, 'liste ekranı taşmıyor (yıldız çubuğu)')
    # Okuma kelime paneli
    go('okuma/p/p001', 700)
    idx = ev("""(() => { const S = %s; const ws = [...document.querySelectorAll('.reader .w')]; return ws.findIndex(e => S[e.textContent.toLowerCase()] >= 3); })()""" % json.dumps({k: v for k, v in STARS.items() if ' ' not in k}))
    tw = page.locator('.reader .w').nth(idx); twt = tw.inner_text().lower()
    tw.click(); page.wait_for_timeout(900)
    check(page.locator('#wordSheet:not(.hidden) .stars').count() == 1 and int(page.locator('#wordSheet .stars').get_attribute('data-n')) == star(twt), f'okuma kelime panelinde yıldız ({twt} → {star(twt)}★)')
    shot('v8-okuma-panel')
    page.locator('#wordSheet .stars').click(); page.wait_for_timeout(200)
    check('Sınavda ne sık çıktığı' in page.locator('#toast').inner_text() and page.locator('#wordSheet:not(.hidden)').count() == 1, 'panelde yıldıza dokun → açıklama, panel açık kalır')
    # Eksikler: 5★ satırı
    top5 = [w for w in WORDS if star(w['word']) == 5]
    go('eksikler', 700)
    t5 = page.locator('.star5').inner_text() if page.locator('.star5').count() else ''
    m5 = re.search(r'5★ kelimeler: (\d+)/(\d+) biliyor', t5)
    check(m5 and int(m5.group(2)) == len(top5) and int(m5.group(1)) >= 1, f'Eksikler: "{t5.strip()}" (5★ çekirdek {len(top5)})')
    shot('v8-eksikler', True)
    ctx.close()

    # v8) stars.json yoksa özellik sessizce gizlenir
    ctx, page = v7ctx({'width': 390, 'height': 844}, True, 'v8-yok')
    ctx.route('**/data/stars.json', lambda r: r.fulfill(status=404, body=''))
    def go(r, t=500): page.goto(BASE + '#/' + r); page.wait_for_timeout(t)
    go('bugun', 800)
    page.evaluate("import('./js/store.js').then(m => m.setSetting('starFirst', true))"); page.wait_for_timeout(200)
    n_st = 0
    for r in ['kartlar/yeni', 'kartlar/liste', 'kartlar/tara', 'eksikler', 'ayarlar']:
        go(r, 600); n_st += page.locator('.stars, .starbar, .star5').count()
    check(n_st == 0 and page.locator('label.switch:has-text("çok çıkanları")').count() == 0, f'stars.json yok: yıldız / filtre / ayar görünmüyor ({n_st})')
    go('kartlar/yeni', 600)
    check(page.locator('button:text-is("Göster")').count() == 1 and page.locator('.flash .fword').count() == 1, 'stars.json yok: yeni kelime oturumu yine çalışıyor')
    ctx.close()


    # ================= v11: kısa deneme (özgün) + gizli okumalar =================
    RPACK = open('/tmp/ornek-paket-readings.json', 'rb').read()  # uydurma örnek paket (gerçek paket değil)
    def gh_r(route):
        cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Accept, If-None-Match', 'Access-Control-Expose-Headers': 'ETag'}
        if route.request.method == 'OPTIONS': return route.fulfill(status=204, headers=cors)
        route.fulfill(status=200, body=RPACK, headers={**cors, 'ETag': '"r1"', 'Content-Type': 'application/vnd.github.raw+json'})
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
    ctx.add_init_script(OPEN_DETAILS)
    ctx.route(lambda u: not u.startswith(BASE), lambda r: r.abort())
    ctx.route(API, gh_r)
    ctx.route('**/data/aids.json', lambda r: r.fulfill(json=merged('aids')))
    ctx.add_init_script(DATEJS)
    page = ctx.new_page(); attach(page, 'v11')
    page.on('dialog', lambda d: d.accept())
    def st():
        page.wait_for_timeout(250)
        return page.evaluate("JSON.parse(localStorage.getItem('yokdil.v1')||'{}')")
    def ev(js): return page.evaluate(js)
    def shot(n, full=False): page.screenshot(path=f'{SHOTS}/{n}.png', full_page=full)
    def go(r, t=600): page.goto(BASE + '#/' + r); page.wait_for_timeout(t)
    def set_date(day):
        if day is None: ev("localStorage.removeItem('test.dateoff')")
        else: ev(f"localStorage.setItem('test.dateoff', String(new Date('{day}T12:00:00').getTime() - (Date.now() - (+(localStorage.getItem('test.dateoff')||0)))))")
        page.reload(); page.wait_for_timeout(800)
    go('bugun', 800)
    # Program görevi: kısa deneme (Pazar; hafta 1, 3–5 mini, 7–8 yarım; çıkmış denemeli haftada yok)
    set_date('2026-12-06')
    kt = page.locator('li[data-task=kisa]')
    check(kt.count() == 1 and 'Kısa deneme (20 soru · 45 dk)' in kt.inner_text() and kt.locator('a.task').get_attribute('href') == '#/deneme/yeni/mini', f'Bugün: hafta 3 Pazar "Kısa deneme (20 soru · 45 dk)" görevi ({kt.inner_text() if kt.count() else None})')
    shot('v11-bugun-kisa', True)
    set_date('2026-12-05')
    check(page.locator('li[data-task=kisa]').count() == 0 and page.locator('a.kisa-plan').count() == 1, 'Cumartesi: görev yok, "Bu hafta kısa deneme" kartı var')
    set_date('2027-01-03')
    check('Kısa deneme (40 soru · 90 dk)' in (page.inner_text('li[data-task=kisa]') if page.locator('li[data-task=kisa]').count() else ''), 'hafta 7 Pazar: yarım kısa deneme (40 soru · 90 dk)')
    set_date('2027-01-17')
    check(page.locator('li[data-task=kisa]').count() == 0, 'çıkmış denemeli hafta (9): kısa deneme görevi yok')
    set_date('2027-02-17')
    dt = page.locator('li[data-task=deneme]')
    check(dt.count() == 1 and 'Kısa deneme (20 soru · 45 dk)' in dt.inner_text() and dt.locator('a.task').get_attribute('href') == '#/deneme/yeni/mini', f'Son 14 gün hafta içi: deneme görevi = mini kısa deneme ({dt.inner_text() if dt.count() else None})')
    set_date('2026-12-06')
    # Sorular → Deneme sekmesi
    go('deneme')
    check(page.locator('.seg a').count() == 4 and page.locator('.seg a.active').inner_text() == 'Deneme' and page.locator('.kisa-card').count() == 2, 'Sorular: Deneme sekmesi, Mini + Yarım')
    check('5 boşluk · 5 cloze · 3 cümle tamamlama · 2 çeviri · 1 paragraf · 1 ilgisiz · 3 okuma' in page.inner_text('main'), 'mini dağılımı YÖKDİL oranında')
    check(ev("document.documentElement.scrollWidth") <= 392, 'Deneme ekranı taşmıyor (4 sekme)')
    shot('v11-deneme-ana', True)
    page.click('.kisa-card[data-size=mini] .kisa-start'); page.wait_for_timeout(1000)
    check('#/deneme/sinav/' in page.url and page.locator('.timer').inner_text().startswith(('0:44', '0:45')), f'mini deneme: 45 dk sayaç ({page.locator(".timer").inner_text()})')
    ex = ev("(async () => { const m = await import('./js/views/kisa.js'); const id = decodeURIComponent(location.hash.split('/').pop()); const e = await m.kisaExam(id); return { id, qs: e.questions.map(q => ({ n: q.n, type: q.type, key: q.key, answer: q.answer, kind: q.info.kind })) }; })()")
    qs = ex['qs']
    from collections import Counter
    tc = Counter(q['type'] for q in qs)
    check(len(qs) == 20 and tc == Counter({'bosluk': 5, 'cloze': 5, 'cumle-tamamlama': 3, 'ceviri-en-tr': 1, 'ceviri-tr-en': 1, 'paragraf-tamamlama': 1, 'ilgisiz': 1, 'paragraf': 3}), f'mini: 20 soru, oranlar {dict(tc)}')
    check(page.locator('.secstrip .chip').count() == 8 and page.locator('.kisa-note').count() == 1, 'bölüm şeridi 8 bölüm + özgün soru notu')
    check(page.locator('.hint-btn').count() == 0, 'sınav taklidi: ipucu yok')
    sc = page.inner_text('.secclock') if page.locator('.secclock:not(.hidden)').count() else ''
    check('Bu bölüm: 0/6 dk' in sc, f'bölüm süresi 20 soruya oranlı ({sc.strip()})')
    shot('v11-mini-soru', True)
    page.locator('.opt').nth(qs[0]['answer']).click(); page.click('button:has-text("Sonraki")')
    page.locator('.opt').nth((qs[1]['answer'] + 1) % 5).click(); page.click('button:has-text("Sonraki")')
    page.click('button:has-text("İşaretle")')
    page.click('button:has-text("Optik")'); page.wait_for_timeout(200)
    check(page.locator('.optik button.flag').count() == 1 and page.locator('.optik button.ans').count() == 2, 'optik: 2 cevap, 1 işaret')
    page.click('.optik button:text-is("20")'); page.wait_for_timeout(200)
    check('Soru 20' in page.inner_text('.qhead') and page.locator('.stem .reader .w').count() > 20, 'optikten son soruya (okuma parçası dokunulabilir)')
    page.locator('.opt').nth(qs[19]['answer']).click()
    page.click('.readbar button:has-text("Bitir")'); page.wait_for_timeout(1000)
    check('#/deneme/sonuc/' in page.url and '2/20' == page.inner_text('.hero .big').strip() and '%10' in page.inner_text('.hero') and 'sınav puanı değildir' in page.inner_text('.hero') and 'tahmini puan' not in page.inner_text('.hero'), f'sonuç: 2/20 doğru (%10), puan değil ({page.inner_text(".hero") if page.locator(".hero").count() else None})')
    s = st()
    km = [m for m in s['mocks'].values() if m.get('kind') == 'kisa']
    check(len(km) == 1 and km[0]['score'] == 10 and km[0]['n'] == 20 and km[0]['size'] == 'mini' and km[0]['sections']['bosluk'] == {'d': 1, 'y': 1, 'b': 3, 'n': 5}, f'mocks: kind=kisa, bölüm D/Y/B ({km[0]["sections"].get("bosluk") if km else None})')
    wk = qs[1]['key']
    check(wk in s['mistakes'] and s['mistakes'][wk]['kind'] == qs[1]['kind'], f'yanlış hata kutusunda mevcut kimlikle ({wk})')
    check(page.locator('table.mock tr.secrow').count() == 8 and page.locator('.timetable').count() == 1, 'sonuç: bölüm tablosu + süre tablosu')
    page.locator('details.secgroup > summary').first.click(); page.wait_for_timeout(200)
    page.locator('details.secgroup').first.locator('.reasons .chip.reason').first.click(); page.wait_for_timeout(200)
    rk = [k for k, r in st()['reasons'].items() if r.get('src') == 'kisa']
    check(len(rk) == 1, f'hata nedeni çipi kaydedildi ({rk})')
    check(page.locator('a.kisa-new').count() == 1 and page.locator('a.retry-sec').count() >= 1, 'sonuç: yeni deneme + bölüm yanlışlarını tekrar çöz')
    shot('v11-mini-sonuc', True)
    page.locator('a.retry-sec').first.click(); page.wait_for_timeout(900)
    check(page.locator('.opt').count() == 5 and '#/deneme/yanlis/' in page.url, 'yanlışları tekrar çöz (özgün soru bankasından)')
    # Tekrar etmeme: art arda 4 deneme daha; her biri son 3'tekilerle kesişmez
    ev("(async () => { const m = await import('./js/views/kisa.js'); for (let i = 0; i < 4; i++) { await m.createKisa('mini'); await new Promise(r => setTimeout(r, 5)); } })()"); page.wait_for_timeout(300)
    defs = sorted([p for p in st()['progress'].values() if p['id'].startswith('kisadef:')], key=lambda p: p['createdAt'])
    ok_rep = len(defs) == 5 and all(not ({u['id'] for u in defs[i]['units']} & {u['id'] for d in defs[max(0, i - 3):i] for u in d['units']}) for i in range(len(defs)))
    check(ok_rep, f'aynı soru son 3 kısa denemede tekrar etmiyor ({len(defs)} deneme)')
    # Yarıda bırak → Bugün bandı
    go('deneme/yeni/mini', 1000)
    check(page.locator('.kisa-confirm .kisa-go').count() == 1 and page.locator('.timer').count() == 0, 'Bugün\'den kısa deneme: önce tek onay, süre başlamadı')
    page.click('.kisa-go'); page.wait_for_timeout(1000)
    page.locator('.opt').nth(0).click(); page.wait_for_timeout(200)
    open_url = page.url
    go('bugun', 800)
    band = page.locator('.kisa-resume')
    check(band.count() == 1 and 'Kısa deneme · Mini (20 soru) · 1 cevap' in band.inner_text(), f'Bugün: "Yarım kaldı" bandı ({band.inner_text() if band.count() else None})')
    check(page.locator('li[data-task=kisa] a.task').get_attribute('href').startswith('#/deneme/sinav/'), 'görev yarım kalan denemeye götürüyor')
    shot('v11-bugun-yarim-kaldi', True)
    band.click(); page.wait_for_timeout(900)
    check(page.url == open_url and page.locator('.opt.chosen').count() == 1, 'bant → aynı deneme, cevap duruyor')
    go('deneme/yeni/yarim/basla', 1000)
    check('1/40' in page.inner_text('.qhead') and page.locator('.timer').inner_text().startswith(('1:29', '1:30')) and page.locator('.secstrip .chip').count() == 8, 'yarım kısa deneme: 40 soru · 90 dk')
    # Eksikler + hedef net
    go('eksikler', 800)
    check(page.locator('.chart .dot.kisa').count() >= 1 and page.locator('.mock-legend').count() == 1 and page.locator('.kisa-chip').count() >= 1, 'Eksikler: kısa deneme ayrı renk/etiket')
    page.locator('.mock-legend').scroll_into_view_if_needed(); shot('v11-eksikler-kisa')
    go('dersler/arac/net', 800)
    check('Tam deneme çözünce' in page.inner_text('main'), 'Hedef net: kısa deneme esas alınmıyor (tam deneme yok)')
    set_date(None)

    # --- Gizli okumalar (örnek paket, mock GitHub)
    ev("localStorage.setItem('yokdil.token', 'ghp_x')"); page.reload(); page.wait_for_timeout(1800)
    go('okuma', 900)
    txt = page.inner_text('main')
    check('Kaynaklarım' in txt and page.locator('.privgroup:not(.other) summary:has-text("Test Kitabı A")').count() == 1, 'Okuma: "Kaynaklarım (gizli)" kaynağa göre gruplu')
    oth = page.locator('details.privgroup.other')
    check(oth.count() == 1 and oth.get_attribute('open') is None and 'Diğer (genel)' in oth.inner_text(), '"Diğer (genel)" en altta, katlanmış')
    sug = page.locator('a.suggest').get_attribute('href')
    check(sug.startswith('#/okuma/g/') and 'tr-ornek-3' not in sug, f'öneri: gizli fen okuması (diğer değil) ({sug})')
    shot('v11-okuma-liste', True)
    go('okuma/g/tr-ornek-1', 900)
    check(page.locator('.trpara.hidden').count() == 2 and page.locator('.priv-meta').count() == 1 and page.locator('details.gloss').count() == 1, 'gizli parça: çeviri varsayılan gizli, sözlükçe')
    page.locator('details.trbox summary').first.click(); page.wait_for_timeout(150)
    page.locator('textarea.mytr').first.fill('Benim cevirim: isil islem')
    page.locator('.tr-show').first.click(); page.wait_for_timeout(300)
    check(page.locator('.trpara:not(.hidden)').count() == 1 and 'Isıl işlem' in page.inner_text('.trpara:not(.hidden)'), 'Çeviriyi göster: yalnız o paragraf')
    check(any(n.get('ctx', {}).get('key') == 'okuma:r:tr-ornek-1#tr0' and 'Benim cevirim' in n.get('text', '') for n in st()['notes'].values()), 'kendi çevirim notlara düştü')
    shot('v11-gizli-ceviri', True)
    page.locator('.reader .w').nth(2).click(); page.wait_for_timeout(900)
    check(page.locator('#wordSheet:not(.hidden)').count() == 1, 'gizli parçada kelimeye dokun → panel')
    page.click('#wordSheet .icon-x'); page.wait_for_timeout(200)
    go('okuma/g/tr-ornek-2', 900)
    page.click('button:has-text("Soruları çöz")'); page.wait_for_timeout(400)
    tfb = page.locator('.opts.tf .opt')
    bb = tfb.first.bounding_box() if tfb.count() else None
    check(tfb.count() == 2 and bb and bb['height'] >= 60 and 'Doğru' in tfb.first.inner_text(), 'tf sorusu: iki büyük düğme (Doğru / Yanlış)')
    tfb.nth(0).click(); page.wait_for_timeout(300)
    shot('v11-gizli-tf', True)
    s = st()
    check('r:tr-ornek-2:1' in s['mistakes'] and s['mistakes']['r:tr-ornek-2:1']['kind'] == 'okuma', 'gizli okuma yanlışı hata kutusunda (r:<id>:<n>)')
    check(ev("import('./js/qbank.js').then(m => m.resolve('r:tr-ornek-2:1')).then(x => !!(x && x.tf && x.stemNode))"), 'hata kutusu gizli okuma sorusunu paketten çözüyor')
    raw = ev("localStorage.getItem('yokdil.v1')")
    check(all(x not in raw for x in ['converts chemical energy', 'runs down even when', 'Heat treatment changes', 'şeklini değiştirmeden', 'Sellers shout']), 'gizli okuma metni / çevirisi / soruları localStorage ve senkronda yok')
    # Bugün okuma görevi: özgün ↔ gizli dönüşümlü
    go('bugun', 900)
    h1 = page.locator('li[data-task=okuma] a.task').get_attribute('href')
    ev("import('./js/store.js').then(m => m.put('progress', { id: 'read:r:tr-ornek-1', kind: 'read', words: 50, secs: 30, wpm: 100, level: 2, at: Date.now(), right: 0, total: 0, gizli: true }))")
    go('okuma', 400); go('bugun', 900)
    h2 = page.locator('li[data-task=okuma] a.task').get_attribute('href')
    check(h1.startswith('#/okuma/g/') and h2.startswith('#/okuma/p/'), f'Bugün okuma: gizli → sonra özgün ({h1} → {h2})')
    ctx.close()

    # Service worker kaydı (ayrı bağlam)
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    ctx.add_init_script(OPEN_DETAILS)
    page = ctx.new_page(); attach(page, 'sw')
    page.goto(BASE); page.wait_for_timeout(1500)
    check(page.evaluate("navigator.serviceWorker.getRegistration().then(r => !!r)"), 'service worker kayıtlı')
    ctx.close()
    b.close()

ext = [e for e in errors if 'net::ERR_FAILED' not in e and 'ERR_INTERNET' not in e and 'Failed to load resource' not in e]
print('\nKonsol hataları:', len(ext))
for e in ext: print('  ', e)
print('Başarısız:', len(fails))
sys.exit(1 if fails or ext else 0)
