# Uçtan uca duman testi: python3 tests/e2e.py (sunucu: python3 -m http.server 8765)
import json, sys, os
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:8765/')
SHOTS = '/home/claude/shots/v2'
os.makedirs(SHOTS, exist_ok=True)
ROUTES = ['bugun', 'okuma', 'kartlar', 'kartlar/liste', 'kartlar/ekle', 'gramer', 'alistirma', 'cikmis', 'dersler', 'eksikler', 'ayarlar']
errors = []
fails = []

def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

def attach(page, tag):
    page.on('console', lambda m: m.type == 'error' and errors.append(f'[{tag}] {m.text}'))
    page.on('pageerror', lambda e: errors.append(f'[{tag}] {e}'))

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
    page.goto(BASE + '#/kartlar/calis'); page.wait_for_timeout(400)
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
    learning = page.locator('section.card').nth(1).locator('.stats3 b').nth(1).inner_text()
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
    check('açık 1' in page.inner_text('main'), 'Gramer ekranında "açık 1"')
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
    page.locator('.opt').nth(0).click(); page.click('button:has-text("Sonraki")')
    check(page.locator('.stem .reader .w').count() > 5, 'cloze metni dokunulabilir')
    check(page.locator('.chip:has-text("anahtar doğrulanmadı")').count() == 0, 'doğrulanmış soruda etiket yok')
    page.click('button:has-text("İşaretle")'); page.click('button:has-text("Sonraki")')
    check(page.locator('.chip:has-text("anahtar doğrulanmadı")').count() == 1, 'keySource=claude etiketi')
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
    page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('yokdil.v1')); for (const m of Object.values(s.mistakes)) m.due = '2000-01-01'; localStorage.setItem('yokdil.v1', JSON.stringify(s)); })()")
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
    page.click('text=Diyalog sorularını göster'); page.wait_for_timeout(200)
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
    with page.expect_download() as dl: page.click('button:has-text("Dışa aktar")')
    data = json.load(open(dl.value.path()))
    check('cards' in data['data'], 'dışa aktarma JSON')
    page.screenshot(path=f'{SHOTS}/akis-ayarlar-koyu.png', full_page=True)
    ctx.close()

    # ================= v3 akışları (temiz bağlam) =================
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
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
    page.goto(BASE + '#/kartlar/calis'); page.wait_for_timeout(600)
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
    check(page.locator('.scan-card').count() == 1 and '1 / 20' in page.inner_text('.scan-card'), 'tarama: 20\'lik grup')
    check(page.locator('.scan-tr.hidden').count() == 1, 'anlam gizli')
    page.click('button:has-text("Anlamı gör")')
    page.screenshot(path=f'{SHOTS}/v3-tarama.png')
    scanned = []
    for act in ['y', 'y', 'n', 'y', 'n']:
        scanned.append((page.locator('.scan-card .fword').inner_text(), act))
        page.click('.scan-btns .yes' if act == 'y' else '.scan-btns .no'); page.wait_for_timeout(120)
    scanned.append((page.locator('.scan-card .fword').inner_text(), 'y')); drag('.scan-card', 170)
    scanned.append((page.locator('.scan-card .fword').inner_text(), 'n')); drag('.scan-card', -170)
    check('8 / 20' in page.inner_text('.scan-card'), 'kaydırma ile tarama (sağ/sol)')
    page.click('button:has-text("Geri al")'); page.wait_for_timeout(200)
    check('7 / 20' in page.inner_text('.scan-card'), 'tarama: geri al')
    scanned.pop()
    s = st()
    byw = {c.get('word'): c for c in s['cards'].values()}
    okk = all((byw.get(w, {}).get('state') == ('known' if a == 'y' else 'new')) for w, a in scanned)
    check(okk, f'tarama sonuçları kaydedildi ({len(scanned)})')
    q = ev("import('./js/srs.js').then(m => m.newQueue()).then(q => q.map(x => x.card ? x.card.word : x.word.word))")
    nos = [w for w, a in scanned if a == 'n']
    check(q[:len(nos) + 1][1:] == nos or q[:len(nos)] == nos or set(nos) <= set(q[:len(nos) + 1]), f'bilmiyorum → yeni kuyruğun önünde: {q[:4]}')
    for k in range(14):
        page.click('.scan-btns .yes'); page.wait_for_timeout(60)
    check('20 kelime daha' in page.inner_text('main'), 'tarama grup sonu özeti')
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
    check('bildiğin kelime' in txt and '/ 2000' in txt and page.locator('.goal-line').count() == 1, 'Eksikler: bildiğin kelime + hedef çizgisi')
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
    check('yeni kelime vardı' in txt, 'parça sonu: "Bu parçada X yeni kelime vardı"')
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

    # Service worker kaydı (ayrı bağlam)
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
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
