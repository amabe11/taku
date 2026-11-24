// Formato para pantalla (es-BO: coma decimal). El CSV usa punto decimal (ver csv.js).
const nf1 = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 });
const dtf = new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short' });
const dsf = new Intl.DateTimeFormat('es-BO', { dateStyle: 'short', timeStyle: 'short' });
const tf = new Intl.DateTimeFormat('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const mv = (v) => (v == null || Number.isNaN(v) ? '—' : nf1.format(v));
export const tc = (v) => (v == null || Number.isNaN(v) ? '—' : nf2.format(v));
export const int = (v) => (v == null ? '—' : nf0.format(v));
export const dateTime = (iso) => (iso ? dtf.format(new Date(iso)) : '—');
export const dateShort = (iso) => (iso ? dsf.format(new Date(iso)) : '—');
export const time = (iso) => (iso ? tf.format(new Date(iso)) : '—');
export function ago(ts) {
  if (!ts) return 'nunca';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5) return 'ahora';
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`;
}
/** Agrupa una lista de seq en rangos legibles: [3,4,5,9] → "3–5, 9" */
export function ranges(list) {
  if (!list?.length) return '';
  const out = []; let a = list[0], b = list[0];
  for (let i = 1; i <= list.length; i++) {
    const v = list[i];
    if (v === b + 1) { b = v; continue; }
    out.push(a === b ? `${a}` : `${a}–${b}`); a = b = v;
  }
  return out.join(', ');
}
