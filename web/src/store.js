// Persistencia en el navegador (IndexedDB, opción de partida de la guía).
// Corridas por run_id; filas por [run_id, seq] → sin duplicados al recuperar desde la primera faltante.
// Si IndexedDB no está disponible (modo privado estricto), se usa memoria y se avisa en la interfaz.
const DB_NAME = 'hg-guard';
const VERSION = 2; // v2: almacenes «lemna» (bioindicador) y «escenas» (contexto satelital guardado)
let dbp = null;
export let persistent = true;
const mem = { runs: new Map(), rows: new Map(), lemna: new Map(), escenas: new Map() };

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(DB_NAME, VERSION); } catch { persistent = false; resolve(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('runs')) db.createObjectStore('runs', { keyPath: 'run_id' });
      if (!db.objectStoreNames.contains('rows')) {
        const rows = db.createObjectStore('rows', { keyPath: ['run_id', 'seq'] });
        rows.createIndex('by_run', 'run_id');
      }
      if (!db.objectStoreNames.contains('lemna')) db.createObjectStore('lemna', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('escenas')) db.createObjectStore('escenas', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { persistent = false; resolve(null); };
    req.onblocked = () => { persistent = false; resolve(null); };
  });
  return dbp;
}
const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
const result = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export async function putRun(run) {
  const db = await open();
  run = { ...run, actualizada: Date.now() };
  if (!db) { mem.runs.set(run.run_id, run); return run; }
  const tx = db.transaction('runs', 'readwrite'); tx.objectStore('runs').put(run); await done(tx);
  return run;
}
export async function getRun(run_id) {
  const db = await open();
  if (!db) return mem.runs.get(run_id) || null;
  return (await result(db.transaction('runs').objectStore('runs').get(run_id))) || null;
}
export async function listRuns() {
  const db = await open();
  const all = db ? await result(db.transaction('runs').objectStore('runs').getAll()) : [...mem.runs.values()];
  return all.sort((a, b) => (b.creada || 0) - (a.creada || 0));
}
/** Inserta filas idempotentemente (la clave [run_id, seq] evita duplicados). */
export async function putRows(run_id, filas) {
  if (!filas.length) return;
  const db = await open();
  if (!db) {
    const m = mem.rows.get(run_id) || new Map();
    for (const f of filas) m.set(f.seq, { ...f, run_id });
    mem.rows.set(run_id, m); return;
  }
  const tx = db.transaction('rows', 'readwrite');
  const st = tx.objectStore('rows');
  for (const f of filas) st.put({ ...f, run_id });
  await done(tx);
}
export async function getRows(run_id) {
  const db = await open();
  if (!db) return [...(mem.rows.get(run_id)?.values() || [])].sort((a, b) => a.seq - b.seq);
  const rows = await result(db.transaction('rows').objectStore('rows').index('by_run').getAll(run_id));
  return rows.sort((a, b) => a.seq - b.seq);
}
// ---------------- almacenes genéricos (lemna, escenas)
export async function putItem(store, item) {
  const db = await open();
  if (!db) { mem[store].set(item.id, item); return item; }
  const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(item); await done(tx);
  return item;
}
export async function listItems(store) {
  const db = await open();
  const all = db ? await result(db.transaction(store).objectStore(store).getAll()) : [...mem[store].values()];
  return all.sort((a, b) => (b.creada || 0) - (a.creada || 0));
}
export async function deleteItem(store, id) {
  const db = await open();
  if (!db) { mem[store].delete(id); return; }
  const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(id); await done(tx);
}
export async function ready() { await open(); return persistent; }
/** Borra todas las corridas y filas de este navegador (la placa no se toca). */
export async function clearAll() {
  const db = await open();
  if (!db) { Object.values(mem).forEach((m) => m.clear()); return; }
  const tx = db.transaction(['runs', 'rows', 'lemna', 'escenas'], 'readwrite');
  for (const st of ['runs', 'rows', 'lemna', 'escenas']) tx.objectStore(st).clear();
  await done(tx);
}
/** ¿El navegador garantiza que no borrará estos datos por falta de espacio? */
export async function persistGranted() {
  try { return (await navigator.storage?.persisted?.()) ?? false; } catch { return false; }
}
export async function requestPersist() {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
