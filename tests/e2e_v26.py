# v26: çıkmış sorular günlük sete, konu setine, alıştırmaya ve ders testine serpiştirilir (paket varsa).
import os, sys, json
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:8765/')
PACK = '/home/claude/private/cikmis-paket.json'
PACK_BODY = open(PACK, 'rb').read() if os.path.exists(PACK) else None
fails, errors = [], []
def check(c, m):
    print(('ok   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    c = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
    c.route(lambda u: not u.startswith(BASE), lambda r: r.abort())
    if PACK_BODY: c.route(BASE + '__pack.json', lambda r: r.fulfill(status=200, body=PACK_BODY, headers={'Content-Type': 'application/json'}))
    pg = c.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(BASE + '#/bugun'); pg.wait_for_selector('.hero', timeout=15000); pg.wait_for_timeout(400)
    ev = pg.evaluate
    if not PACK_BODY: print('paket yok, atlandı'); sys.exit(0)
    ev("fetch('__pack.json').then(r => r.json()).then(p => import('./js/pack.js').then(m => m.savePack(p, 'gizli')))")
    ev("import('./js/store.js').then(m => m.setSetting('warmup', false))")
    T = ev("import('./js/util.js').then(u => u.dayKey())")
    st = lambda: ev("JSON.parse(localStorage.getItem('yokdil.v1')||'{}')")
    pg.goto(BASE + '#/gramer/gunluk'); pg.wait_for_timeout(1800)
    keys = st()['sessions'].get('gunluk:' + T, {}).get('keys', [])
    xk = [k for k in keys if k.startswith(('yokdil', 'yds'))]
    check(len(keys) == 8 and len(xk) == 1 and keys[0] != xk[0], f'günlük set: 8 soru, 1 çıkmış serpiştirildi ({keys})')
    pg.goto(BASE + '#/gramer/konu/baglac-zitlik'); pg.wait_for_timeout(1500)
    k2 = st()['sessions'].get('konu:baglac-zitlik', {}).get('keys', [])
    check(len(k2) == 8 and sum(k.startswith(('yokdil', 'yds')) for k in k2) == 2, f'konu seti: 2 çıkmış ({k2})')
    pg.goto(BASE + '#/alistirma/cumle-tamamlama'); pg.wait_for_timeout(1500)
    k3 = st()['sessions'].get('alistirma:cumle-tamamlama', {}).get('keys', [])
    check(sum(k.startswith(('yokdil', 'yds')) for k in k3) == 1, f'alıştırma: 1 çıkmış ({k3})')
    check('Çıkmış' in pg.inner_text('main') or any(':' in k for k in k3[:1]) is False, 'çıkmış etiketi görünür ya da ilk soru özgün')
    pg.goto(BASE + '#/dersler/baglac-zitlik'); pg.wait_for_timeout(1200)
    btn = pg.locator('button:has-text("test")').first
    if btn.count(): btn.click(); pg.wait_for_timeout(1200)
    k4 = st()['sessions'].get('ders:baglac-zitlik', {}).get('keys', [])
    X = lambda k: k.startswith(('yokdil', 'yds'))
    check(sum(X(k) for k in k4) == 2 and X(k4[-1]), f'ders testi sonunda 2 çıkmış ({k4[-3:]})')
    b.close()
print(f'Konsol hataları: {len(errors)}'); [print(' ', e) for e in errors[:5]]; print(f'Başarısız: {len(fails)}'); sys.exit(1 if fails or errors else 0)
