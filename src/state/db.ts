// Base de datos local (IndexedDB) de CipherFlow: flujos guardados y su historial de ejecuciones.
//   flows : un registro por flujo (nombre, origen, grafo actual…)
//   meta  : datos ligeros de cada ejecución (la lista), con índice por flujo
//   data  : grafo y bytes de salida de cada ejecución (solo se lee al abrirla)
//   chats : conversaciones con el asistente, con índice por flujo
let dbp: Promise<IDBDatabase> | null = null

export function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB no disponible'))
      const r = indexedDB.open('cipherflow', 3)
      r.onupgradeneeded = () => {
        const d = r.result, t = r.transaction!
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'id' }).createIndex('at', 'at')
        if (!d.objectStoreNames.contains('data')) d.createObjectStore('data', { keyPath: 'id' })
        if (!d.objectStoreNames.contains('flows')) d.createObjectStore('flows', { keyPath: 'id' })
        if (!d.objectStoreNames.contains('chats')) d.createObjectStore('chats', { keyPath: 'id' }).createIndex('flowKey', 'flowKey')
        const meta = t.objectStore('meta')
        if (!meta.indexNames.contains('flowId')) meta.createIndex('flowId', 'flowId')
      }
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    dbp.catch(() => { dbp = null })
  }
  return dbp
}

/** Ejecuta `fn` dentro de una transacción y resuelve con su valor cuando la transacción termina. */
export function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => T | Promise<T>): Promise<T> {
  return db().then(d => new Promise<T>((resolve, reject) => {
    const t = d.transaction(stores, mode)
    let out: T
    Promise.resolve(fn(t)).then(v => { out = v }, reject)
    t.oncomplete = () => resolve(out)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  }))
}

export const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })

export const newId = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
