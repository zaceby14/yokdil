// "Sorular" sekmesinin alt sekmeleri (Dersler artık ana menüde)
import { h } from '../util.js';
import { lessonFor } from '../qbank.js';
import { openLesson } from '../side.js';

export function soruTabs(active) {
  return h('div.seg', [['gramer', 'Gramer'], ['alistirma', 'Alıştırma'], ['cikmis', 'Çıkmış']].map(([k, l]) =>
    h('a' + (active === k ? '.active' : ''), { href: '#/' + k }, l)));
}

// Yanlış cevapta ilgili ders: sayfadan ayrılmadan panelde açılır
export async function lessonLink(it, ok) {
  if (ok) return null;
  const l = await lessonFor(it.info?.topic);
  return l ? h('button.btn.small.lesson-link', { style: 'margin-top:8px', onclick: () => openLesson(l.id) }, 'Konuyu aç: ' + l.title) : null;
}

// Boş veri uyarısı
export const emptyData = (what = 'Sorular') => h('div.card.empty',
  h('p', `${what} yüklenemedi. İnternete bağlanıp yenile.`),
  h('button.btn.primary', { onclick: () => location.reload() }, 'Yenile'));
