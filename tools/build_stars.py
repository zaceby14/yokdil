#!/usr/bin/env python3
"""Kelime yıldızı: çıkmış soru paketindeki geçme sıklığından 1–5 yıldız üretir.

Kullanım:
  python3 tools/build_stars.py PAKET.json [--missing RAPOR.json] [--out data/stars.json]

Paket yalnızca yol argümanıyla okunur; repoya (data/stars.json) SADECE kelime → yıldız yazılır,
soru metni / sayım / sınav adı yazılmaz. --missing raporu repo dışına yazılmalıdır.
"""
import argparse, json, re, sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
W_KIND = {'yds': 1.0, 'yokdil-fen': 0.8, 'yayinevi': 0.3}
OPT_BONUS = 1.0      # şıkta geçen kelimeye ek
ANSWER_BONUS = 3.0   # kelime sorusunun doğru şıkkına ek
SEP = {'out', 'up', 'off', 'down', 'away', 'back', 'over', 'about'}  # araya nesne girebilen parçacıklar
SEP_GAP = 3
CORR_GAP = 12        # "either ... or" gibi ikili bağlaçlarda en fazla ara
# Yüzdelik eşikler (geçen kelimeler içinde): ≥ P5 → 5★, ≥ P4 → 4★, ≥ P3 → 3★, gerisi 2★; hiç geçmeyen 1★
P5, P4, P3 = 0.90, 0.70, 0.40
TR_CHARS = re.compile(r'[çğıöşüÇĞİÖŞÜ]')
TOK = re.compile(r"[a-z]+(?:[-'’][a-z]+)*|[^\sa-z]")
VOW = set('aeiou')

# Rapor için: akademik olmayan sık kelimeler
COMMON = set('''the a an and or but if of to in on at by for from with into onto over under about against among between through during
is are was were be been being am has have had do does did will would can could may might must shall should not no it its this that these those
which who whom whose what where when why how there here than then as so i you he she we they them their his her our your one ones any some all
each every up down out off very too also only just more most less least much many few little other others such same own both either neither
new old good bad big small high low long short first last next many well even still yet now often never always sometimes however although
because while since until though whether like make made get got take took use used say said see seen know known go went come came give given
find found think thought way time year years people thing things part number day days world life man men woman women child children
two three four five six seven eight nine ten hundred thousand million billion second third percent per cent mr mrs dr
passage paragraph sentence author following statement question questions answer text according true false mentioned stated
implied understood inferred concluded best completes complete completing closest meaning choose blank which'''.split())
# Akademik sayılacak: uzun kelime ya da Latince türev eki (rapor için kaba süzgeç)
ACAD = re.compile(r'(tion|sion|ment|ity|ous|ive|ance|ence|ant|ent|ate|ise|ize|ify|ical|ic|al|ism|ist|logy|ure|ory|ary|able|ible)$')


def tokens(text):
    return TOK.findall(text.lower().replace('’', "'"))


def is_word(t):
    return t[0].isalpha()


def infl(w):
    """Tek kelimenin çekim halleri (-s/-es/-ies/-ed/-ied/-ing; çift ünsüz). Fazladan biçim zararsız (metinde geçmez)."""
    out = {w}
    if not w.isalpha() or len(w) < 2:
        return out
    cy = len(w) > 2 and w[-1] == 'y' and w[-2] not in VOW
    out |= {w + 's'}
    if re.search(r'(s|x|z|ch|sh|o)$', w):
        out.add(w + 'es')
    if cy:
        out |= {w[:-1] + 'ies', w[:-1] + 'ied'}
    if w.endswith('e'):
        out |= {w + 'd', w[:-1] + 'ing'}
    else:
        out |= {w + 'ed', w + 'ing'}
    if w.endswith('ie'):
        out.add(w[:-2] + 'ying')
    if len(w) >= 3 and w[-1] not in VOW and w[-1] not in 'wxy' and w[-2] in VOW and w[-3] not in VOW:
        out |= {w + w[-1] + 'ed', w + w[-1] + 'ing'}
    if w.endswith('c'):
        out |= {w + 'ked', w + 'king'}
    return out


def ly(w):
    if not w.isalpha():
        return set()
    out = {w + 'ly'}
    if w.endswith('le'):
        out.add(w[:-1] + 'y')
    if w.endswith('y'):
        out.add(w[:-1] + 'ily')
    if w.endswith('ic'):
        out.add(w + 'ally')
    return out


def load_core():
    words = json.load(open(ROOT / 'data/words.json', encoding='utf-8'))
    forms = json.load(open(ROOT / 'data/forms.json', encoding='utf-8'))
    seed = json.load(open(ROOT / 'data/seed-user.json', encoding='utf-8'))
    core = {}
    def add(w):
        w = re.sub(r'\s+', ' ', str(w or '').strip().lower().replace('’', "'"))
        if w and w not in core:
            core[w] = set()
    for x in words: add(x.get('word'))
    for c in seed.get('cards', []): add(c.get('word'))
    for k, v in forms.items():
        add(k)
        for m in v.get('family', []) or []: add(m.get('w'))
    # forms.json "V1 – V2 – V3" satırları
    verb = {}
    for k, v in forms.items():
        if v.get('verb'):
            # "was/were composed of" → ikisi de ayrı satır
            fixed = set()
            for p in re.split(r'\s+[–-]\s+', v['verb'].lower()):
                ws = p.split()
                if ws and '/' in ws[0]:
                    for a in ws[0].split('/'): fixed.add(' '.join([a] + ws[1:]))
                else: fixed.add(p.strip())
            verb[k.lower()] = fixed
    return core, verb


def patterns(core, verb):
    """lemma → [(kind, data)]: kind 'seq' (tam dizi), 'sep' (fiil + ≤3 kelime + parçacık), 'corr' (X ... Y)."""
    singles = {k for k in core if ' ' not in k and '...' not in k}
    pats = defaultdict(list)
    surf = defaultdict(set)   # tek kelime yüzey → lemmalar
    for lem in core:
        if '...' in lem:
            a, b = [s.strip() for s in lem.split('...', 1)]
            pats[lem].append(('corr', (tuple(tokens(a)), tuple(tokens(b)))))
            continue
        ws = lem.split()
        if len(ws) == 1:
            w = ws[0]
            for s in infl(w) | {x for x in verb.get(w, ()) if ' ' not in x}:
                surf[s].add(lem)
            for s in ly(w):
                if s not in singles:  # aile üyesi kendi kelimesi sayılır
                    surf[s].add(lem)
            continue
        body = ws[1:] if ws[0] == 'be' and len(ws) > 1 else ws
        seqs = set()
        for f in infl(body[0]) | ({x.split()[0] for x in verb.get(lem, ()) if x.split()[1:] == body[1:]} if body is ws else set()):
            seqs.add(tuple(tokens(' '.join([f] + body[1:]))))
        for x in verb.get(lem, ()):
            t = x.split()
            if t and t[0] in ('was', 'were', 'been', 'be'): t = t[1:]
            if t: seqs.add(tuple(tokens(' '.join(t))))
        for s in seqs:
            pats[lem].append(('seq', s))
        if len(body) == 2 and body[1] in SEP:
            heads = {s[0] for s in seqs if len(s) == 2}
            pats[lem].append(('sep', (heads, body[1])))
    return surf, pats


def scan(text, wgt, surf, pats, score, bonus=0.0, answer_lem=None):
    if not text or TR_CHARS.search(text):
        return
    toks = tokens(text)
    words = [t for t in toks if is_word(t)]
    seen_here = set()
    for t in words:
        for lem in surf.get(t, ()):
            score[lem] += wgt * (1 + bonus); seen_here.add(lem)
    n = len(toks)
    first = defaultdict(list)
    for i, t in enumerate(toks): first[t].append(i)
    for lem, ps in pats.items():
        hit = 0
        for kind, d in ps:
            if kind == 'seq':
                L = len(d)
                for i in first.get(d[0], ()):
                    if tuple(toks[i:i + L]) == d: hit += 1
            elif kind == 'sep':
                heads, part = d
                for h in heads:
                    for i in first.get(h, ()):
                        for g in range(1, SEP_GAP + 1):  # g=0 zaten 'seq'
                            j = i + 1 + g
                            if j >= n: break
                            if not all(is_word(x) for x in toks[i + 1:j]): break
                            if toks[j] == part: hit += 1; break
            else:
                a, b = d
                for i in first.get(a[0], ()):
                    if tuple(toks[i:i + len(a)]) != a: continue
                    rest = toks[i + len(a): i + len(a) + CORR_GAP + len(b)]
                    if any(tuple(rest[k:k + len(b)]) == b for k in range(len(rest))): hit += 1
        if hit:
            score[lem] += wgt * (1 + bonus) * hit; seen_here.add(lem)
    if answer_lem is not None:
        answer_lem |= seen_here


def build(pack_path):
    core, verb = load_core()
    surf, pats = patterns(core, verb)
    pack = json.load(open(pack_path, encoding='utf-8'))
    score = defaultdict(float)
    raw = defaultdict(float)  # çekirdek dışı aday kelimeler (rapor için)
    caps = defaultdict(lambda: [0, 0])
    for ex in pack.get('exams', []):
        w = W_KIND.get(ex.get('kind'), 0.3)
        texts = [(g.get('text') or '') for g in ex.get('groups', []) or []]
        for q in ex.get('questions', []):
            texts.append(q.get('q') or '')
            opts = q.get('options') or []
            for k, o in enumerate(opts):
                texts.append(o or '')
                scan(o, w, surf, pats, score, OPT_BONUS)
                if q.get('topic') == 'kelime' and k == q.get('answer'):
                    hit = set()
                    scan(o, w, surf, pats, defaultdict(float), 0, hit)
                    for lem in hit: score[lem] += w * ANSWER_BONUS
            scan(q.get('q'), w, surf, pats, score)
        for g in ex.get('groups', []) or []:
            scan(g.get('text'), w, surf, pats, score)
        for t in texts:
            if not t or TR_CHARS.search(t): continue
            for m in re.finditer(r"(^|[.?!]\s+|\S\s+)([A-Za-z][a-z]+)", t):
                lw = m.group(2).lower()
                caps[lw][0] += 1
                if m.group(2)[0].isupper() and m.group(1).strip() not in ('', '.', '?', '!') and not m.group(1).strip().endswith(('.', '?', '!')): caps[lw][1] += 1
                raw[lw] += w
    return core, score, raw, caps, surf


def stars_of(core, score):
    vals = sorted(v for k, v in score.items() if k in core and v > 0)
    def q(p): return vals[min(len(vals) - 1, int(p * len(vals)))] if vals else 0
    t5, t4, t3 = q(P5), q(P4), q(P3)
    out = {}
    for k in core:
        v = score.get(k, 0)
        out[k] = 1 if v <= 0 else 5 if v >= t5 else 4 if v >= t4 else 3 if v >= t3 else 2
    return out, (t3, t4, t5)


def base_of(w, known):
    if len(w) < 6: return w
    for re_, rep in [(r'ies$', 'y'), (r'ied$', 'y'), (r'es$', ''), (r's$', ''), (r'ed$', 'e'), (r'ed$', ''), (r'ing$', 'e'), (r'ing$', ''), (r'ly$', '')]:
        if re.search(re_, w):
            b = re.sub(re_, rep, w)
            if len(b) >= 4 and b in known: return b
    return w


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pack')
    ap.add_argument('--out', default=str(ROOT / 'data/stars.json'))
    ap.add_argument('--missing')
    a = ap.parse_args()
    core, score, raw, caps, surf = build(a.pack)
    stars, (t3, t4, t5) = stars_of(core, score)
    dist = {s: sum(1 for v in stars.values() if v == s) for s in range(1, 6)}
    method = ('Çıkmış ÖSYM YDS (ağırlık 1), YÖKDİL Fen (0,8) ve yayınevi (0,3) sorularında geçme sıklığı; '
              'şıkta geçen +1, kelime sorusunun doğru şıkkı +3. Geçenler içinde yüzdelik: '
              f'%{int(P5*100)}+ → 5, %{int(P4*100)}–{int(P5*100)} → 4, %{int(P3*100)}–{int(P4*100)} → 3, gerisi 2; hiç geçmeyen 1.')
    Path(a.out).write_text(json.dumps({'v': 1, 'method': method, 'words': dict(sorted(stars.items()))}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print('dağılım', dist, 'eşik (puan) 3★≥%.1f 4★≥%.1f 5★≥%.1f' % (t3, t4, t5))
    if a.missing:
        # Çekirdek dışı sık kelimeler: çekirdekteki herhangi bir lemmanın yüzey biçimi değil, özel isim değil
        known_surf = set(surf)
        grp = defaultdict(float)
        for w, v in raw.items():
            if w in core or w in known_surf or w in COMMON or len(w) < 4: continue
            n, capd = caps[w]
            if n and capd / n > 0.5: continue
            b = base_of(w, raw)
            if b in core or b in COMMON or not (len(b) >= 8 or (len(b) >= 6 and ACAD.search(b))): continue
            grp[b] += v
        miss = sorted(((w, v) for w, v in grp.items() if v >= t4 and w not in core and w not in known_surf and w not in COMMON), key=lambda x: -x[1])
        rep = {'not': 'Kaba süzgeç (uzun ya da Latince ekli, özel isim değil). Çekirdek listede olmayan, korpusta 4★ eşiği (puan ≥ %.1f) üstünde geçen kelimeler. Sayım = ağırlıklı geçme (YDS 1, YÖKDİL 0,8, yayınevi 0,3).' % t4,
               'esik4': round(t4, 2), 'esik5': round(t5, 2),
               'kelimeler': [{'w': w, 'puan': round(v, 1), 'yildiz': 5 if v >= t5 else 4} for w, v in miss]}
        Path(a.missing).write_text(json.dumps(rep, ensure_ascii=False, indent=1), encoding='utf-8')
        print('eksik rapor:', len(miss), 'kelime →', a.missing)
    return 0


if __name__ == '__main__':
    sys.exit(main())
