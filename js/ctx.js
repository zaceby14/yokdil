// Şu anki bağlam (not panelinin otomatik kaydettiği yer): soru / okuma / sayfa
let cur = null;
export function setCtx(c) { cur = c ? { ...c, route: c.route || location.hash } : null; }
export function getCtx() { return cur || { type: 'sayfa', label: pageName(location.hash), route: location.hash }; }

const NAMES = { bugun: 'Bugün', okuma: 'Okuma', kartlar: 'Kartlar', gramer: 'Gramer', alistirma: 'Alıştırma', cikmis: 'Çıkmış',
  dersler: 'Dersler', eksikler: 'Eksikler', ayarlar: 'Ayarlar', notlar: 'Notlar' };
export const pageName = hash => NAMES[(hash || '').replace(/^#\/?/, '').split('/')[0]] || 'Bugün';
