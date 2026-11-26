# v21: 2 gün hatırlanmayan kelime yazdırılır; yanlışta kural notuna ekleme.
import os, sys
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'; SH = '/home/claude/shots/v21'; os.makedirs(SH, exist_ok=True)
fails, errors = [], []
def check(c, m):
    print(('ok   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    c = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
    c.route(lambda u: not u.startswith(BASE), lambda r: r.abort())
    pg = c.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(BASE + '#/bugun'); pg.wait_for_selector('.hero', timeout=15000); pg.wait_for_timeout(400)
    ev = pg.evaluate
    T = ev("import('./js/util.js').then(u => u.dayKey())")
    ev(f"""Promise.all([import('./js/store.js'), import('./js/util.js')]).then(([m, u]) => {{ const now = Date.now();
      for (const x of m.all('cards')) m.del('cards', x.id);
      m.put('cards', {{ id: 'cw1', word: 'deplete', tr: 'tüketmek, azaltmak', ctx: 'Intensive farming can deplete the soil of nutrients.', state: 'relearn', ladder: 0, interval: 0, reps: 4, lapses: 2, due: now - 1000, lastReview: now - 86400000, agDays: [u.addDays('{T}', -3), u.addDays('{T}', -1)], wr: {{ ok: 0, day: '' }} }});
      m.put('cards', {{ id: 'cw2', word: 'yield', tr: 'verim', state: 'review', interval: 5, reps: 3, due: now - 1000, lastReview: now - 5 * 86400000 }}); }})""")
    pg.goto(BASE + '#/kartlar'); pg.wait_for_timeout(800)
    check('1 kelime yazarak' in pg.inner_text('main'), 'Kartlar: yazma sayısı görünüyor')
    pg.goto(BASE + '#/kartlar/calis'); pg.wait_for_timeout(1000)
    if not pg.locator('.flash.write').count():
        pg.locator('.big-btn:has-text("Göster")').click(); pg.wait_for_timeout(200); pg.locator('.g-good').click(); pg.wait_for_timeout(600)
    check(pg.locator('.flash.write').count() == 1 and 'tüketmek' in pg.inner_text('.flash.write') and '----' in pg.inner_text('.flash.write'), 'yazma yüzü: anlam + boşluklu cümle')
    check(pg.locator('.grades:not(.hidden)').count() == 0, 'yazmadan notlama yok')
    pg.screenshot(path=f'{SH}/yazma.png')
    pg.fill('.write-in', 'reduce'); pg.click('.write-btns .btn.primary'); pg.wait_for_timeout(300)
    check('Doğrusu' in pg.inner_text('.write-msg') and 'deplete' in pg.inner_text('.write-msg'), 'yanlış: doğrusu gösterildi')
    check(ev("import('./js/store.js').then(m => m.get('cards', 'cw1').wr.ok)") == 0, 'yanlış kaydı')
    pg.fill('.write-in', 'deplete'); pg.press('.write-in', 'Enter'); pg.wait_for_timeout(400)
    check(pg.locator('.grades:not(.hidden)').count() == 1 and pg.locator('.notebook').count() == 1, 'doğrusunu yazınca kart açılır + defter önerisi')
    pg.screenshot(path=f'{SH}/yazma-acik.png', full_page=True)
    pg.locator('.g-again').click(); pg.wait_for_timeout(400)
    # Doğru yazma → ok sayısı
    ev("import('./js/store.js').then(m => { const c = m.get('cards', 'cw1'); m.put('cards', { ...c, due: Date.now() - 1000, agDays: c.agDays, wr: { ok: 0, day: '' } }); })")
    pg.goto(BASE + '#/kartlar'); pg.wait_for_timeout(300); pg.goto(BASE + '#/kartlar/calis'); pg.wait_for_timeout(1000)
    for _ in range(3):
        if pg.locator('.flash.write').count(): break
        pg.locator('.big-btn:has-text("Göster")').click(); pg.wait_for_timeout(200); pg.locator('.g-good').click(); pg.wait_for_timeout(600)
    pg.fill('.write-in', 'Deplet'); pg.press('.write-in', 'Enter'); pg.wait_for_timeout(300)
    check('Doğru ✓' in pg.inner_text('.write-msg') and ev("import('./js/store.js').then(m => m.get('cards', 'cw1').wr.ok)") == 1, 'küçük yazım hatası tolere, doğru sayıldı')
    # Gramer: yanlışta kural notuna ekle
    ev("import('./js/store.js').then(m => { m.setSetting('warmup', false); m.setSetting('adapt', false); })")
    pg.goto(BASE + '#/gramer/pratik/baglac-zitlik'); pg.wait_for_timeout(1200)
    if pg.locator('button:has-text("Baştan başla")').count(): pg.click('button:has-text("Baştan başla")'); pg.wait_for_timeout(400)
    k = ev("import('./js/store.js').then(m => m.get('sessions', 'pratik:baglac-zitlik').keys[0])")
    a = ev(f"import('./js/qbank.js').then(q => q.resolve('{k}')).then(it => it.answer)")
    pg.locator('.opt').nth((a + 1) % 5).click(); pg.wait_for_timeout(300)
    n0 = ev("import('./js/store.js').then(m => m.all('notes').length)")
    check(pg.locator('.nb-add').count() == 1, 'yanlışta "Kural notlarıma ekle" düğmesi')
    pg.evaluate("document.querySelector('details.ex-more')?.setAttribute('open', '')"); pg.click('.nb-add'); pg.wait_for_timeout(300)
    check(ev("import('./js/store.js').then(m => m.all('notes').length)") == n0 + 1 and 'Eklendi' in pg.inner_text('.explain'), 'not eklendi')
    pg.screenshot(path=f'{SH}/kural-notu.png', full_page=True)
    b.close()
print(f'Konsol hataları: {len(errors)}'); [print(' ', e) for e in errors[:5]]; print(f'Başarısız: {len(fails)}'); sys.exit(1 if fails or errors else 0)
