// "Sorular" sekmesinin alt sekmeleri
import { h } from '../util.js';
import { lessonFor } from '../qbank.js';

export function soruTabs(active) {
  return h('div.seg', [['gramer', 'Gramer'], ['alistirma', 'Alıştırma'], ['cikmis', 'Çıkmış'], ['dersler', 'Dersler']].map(([k, l]) =>
    h('a' + (active === k ? '.active' : ''), { href: '#/' + k }, l)));
}

// Yanlış cevapta ilgili derse link
export async function lessonLink(it, ok) {
  if (ok) return null;
  const l = await lessonFor(it.info?.topic);
  return l ? h('a.btn.small', { href: '#/dersler/' + encodeURIComponent(l.id), style: 'margin-top:8px' }, 'Konuyu aç: ' + l.title) : null;
}
