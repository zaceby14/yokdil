// Küçük güvenli markdown: **kalın**, - liste, | tablo |. Önce HTML kaçışı yapılır.
import { esc } from './util.js';

const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

export function md(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  let out = '', i = 0;
  while (i < lines.length) {
    const l = lines[i].trim();
    if (!l) { i++; continue; }
    if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++].trim());
      const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const body = rows.filter(r => !/^\|?[\s:|-]+\|?$/.test(r));
      const hasHead = rows.length > 1 && /^\|?[\s:|-]+\|?$/.test(rows[1]);
      out += '<div class="tbl"><table>' + body.map((r, k) =>
        '<tr>' + cells(r).map(c => (hasHead && k === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join('') + '</tr>').join('') + '</table></div>';
      continue;
    }
    if (/^[-*] /.test(l)) {
      out += '<ul>';
      while (i < lines.length && /^[-*] /.test(lines[i].trim())) out += '<li>' + inline(lines[i++].trim().slice(2)) + '</li>';
      out += '</ul>';
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^([-*] |\|)/.test(lines[i].trim())) para.push(lines[i++].trim());
    out += '<p>' + para.map(inline).join('<br>') + '</p>';
  }
  return out;
}
