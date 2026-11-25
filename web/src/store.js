// Persistencia en el navegador (IndexedDB): copia de trabajo de las muestras, una base por modo.
// Si IndexedDB no está disponible (modo privado estricto), se usa memoria y se avisa en la interfaz.
let dbp = null;
let dbName = 'ahgora-demo';
export let persistent = true;
const mem = new Map();

export function useDb(mode) { dbName = `ahgora-${mode}`; dbp = null; }

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(dbName, 1); } catch { persistent = false; resolve(null); return; }
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('muestras')) req.result.createObjectStore('muestras', { keyPath: 'codigo' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { persistent = false; resolve(null); };
    req.onblocked = () => { persistent = false; resolve(null); };
  });
  return dbp;
}
const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
const result = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export async function listMuestras() {
  const db = await open();
  const all = db ? await result(db.transaction('muestras').objectStore('muestras').getAll()) : [...mem.values()];
  return all.sort((a, b) => String(b.fecha_iso).localeCompare(String(a.fecha_iso)));
}
export async function putMuestras(list) {
  if (!list.length) return;
  const db = await open();
  if (!db) { for (const m of list) mem.set(m.codigo, m); return; }
  const tx = db.transaction('muestras', 'readwrite');
  const st = tx.objectStore('muestras');
  for (const m of list) st.put(m);
  await done(tx);
}
export async function clearMuestras() {
  const db = await open();
  if (!db) { mem.clear(); return; }
  const tx = db.transaction('muestras', 'readwrite'); tx.objectStore('muestras').clear(); await done(tx);
}
export async function ready() { await open(); return persistent; }
export async function persistGranted() {
  try { return (await navigator.storage?.persisted?.()) ?? false; } catch { return false; }
}
export async function requestPersist() {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
