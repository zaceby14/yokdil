// Çıkmış çeviri sorusu için basit otomatik parçalama (içerikte "parts" yoksa): virgül/noktalı virgül, bağlaçlar,
// edat öbekleri. Rol etiketi yok; yalnız renkli bloklar (saf — node ile test edilir).

// Yeni blok başlatan bağlaçlar / ilgi sözcükleri (İngilizce)
const CONJ = ['although', 'even though', 'though', 'while', 'whereas', 'which', 'that', 'because', 'since', 'when', 'whenever', 'if', 'unless',
  'as long as', 'so that', 'in order to', 'whether', 'until', 'before', 'after', 'once', 'where', 'who', 'whose', 'whom', 'however', 'but', 'yet',
  'thus', 'therefore', 'hence', 'despite', 'in spite of', 'due to', 'owing to', 'because of', 'as a result of', 'such as', 'rather than', 'as well as'];
// Edat öbeği başı (cümle 6+ kelimeyse ve blok yeterince uzunsa)
const PREP = ['in', 'on', 'at', 'by', 'for', 'with', 'from', 'into', 'during', 'through', 'between', 'among', 'without', 'within', 'across', 'over', 'under', 'against', 'towards', 'toward'];
// Türkçe (Tr → İng sorularında kaynak Türkçe): bağlaç kelimeleri bloğu bitirir
const TR_END = ['rağmen', 'için', 'karşın', 'göre', 'dolayı', 'nedeniyle', 'sayesinde', 'halde', 'iken', 'kadar', 'beri', 'sonra', 'önce'];
const TR_START = ['ancak', 'fakat', 'ama', 'çünkü', 'oysa', 'ayrıca', 'dolayısıyla', 'bu nedenle', 'bu yüzden', 've', 'veya', 'ya da'];

const MIN_W = 3; // bir bloğun en az kelimesi (çok kısa parçalar öncekine eklenir)

const words = s => String(s || '').trim().split(/\s+/).filter(Boolean);
const low = w => w.toLowerCase().replace(/^[("'“‘]+|[)"'”’.,;:!?]+$/g, '');

// Kelime dizisinde i'den başlayan çok kelimeli ifade eşleşmesi (en uzun)
function phraseAt(ws, i, list) {
  let best = 0;
  for (const p of list) {
    const ps = p.split(' ');
    if (ps.length <= best) continue;
    if (ps.every((x, j) => low(ws[i + j] || '') === x)) best = ps.length;
  }
  return best;
}

// lang: 'en' (İng → Tr kaynağı) | 'tr' (Tr → İng kaynağı)
export function autoParts(text, lang = 'en') {
  const src = String(text || '').replace(/\s+/g, ' ').trim();
  if (!src) return [];
  const ws = words(src);
  if (ws.length < 6) return [{ src }];
  const cuts = new Set(); // yeni blok başlayan kelime indeksleri
  for (let i = 1; i < ws.length; i++) {
    const prev = ws[i - 1];
    if (/[,;:]$/.test(prev)) { cuts.add(i); continue; }
    if (lang === 'tr') {
      if (TR_END.includes(low(prev))) cuts.add(i);
      else if (phraseAt(ws, i, TR_START)) cuts.add(i);
      continue;
    }
    if (phraseAt(ws, i, CONJ)) cuts.add(i);
    else if (PREP.includes(low(ws[i])) && ws.length >= 10) cuts.add(i);
  }
  // Blokları kur; çok kısa blokları birleştir (edat kesmeleri önce düşer)
  const idx = [0, ...[...cuts].sort((a, b) => a - b), ws.length];
  let blocks = [];
  for (let k = 0; k < idx.length - 1; k++) if (idx[k + 1] > idx[k]) blocks.push(ws.slice(idx[k], idx[k + 1]));
  const merged = [];
  for (const b of blocks) {
    const last = merged.at(-1);
    if (last && (b.length < MIN_W || last.length < MIN_W) && !/[,;:]$/.test(last.at(-1))) last.push(...b);
    else merged.push([...b]);
  }
  // Sonda çok kısa blok kaldıysa öncekine ekle
  if (merged.length > 1 && merged.at(-1).length < MIN_W) { const t = merged.pop(); merged.at(-1).push(...t); }
  blocks = merged.length > 7 ? mergeTo(merged, 7) : merged;
  return blocks.map(b => ({ src: b.join(' ') }));
}

// En kısa komşuları birleştirerek blok sayısını düşür
function mergeTo(bs, max) {
  bs = bs.map(b => [...b]);
  while (bs.length > max) {
    let k = 0, best = Infinity;
    for (let i = 0; i < bs.length - 1; i++) { const n = bs[i].length + bs[i + 1].length; if (n < best) { best = n; k = i; } }
    bs.splice(k, 2, [...bs[k], ...bs[k + 1]]);
  }
  return bs;
}
