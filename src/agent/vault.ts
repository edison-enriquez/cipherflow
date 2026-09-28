// Cofre local para secretos (p. ej. la contraseña del servidor de OpenCode): se cifran con AES-GCM
// (256 bits) usando una clave NO exportable que el navegador guarda en IndexedDB. La página puede
// pedir al navegador que descifre, pero nadie puede leer la clave en bruto ni se guarda texto plano.
// Protege frente a quien lea o copie los datos del navegador (copias, sincronización, otro usuario del
// equipo); no frente a código malicioso que ya se ejecute dentro de la propia página.

const DB = 'cipherflow-cofre', STORE = 'claves', KEY_ID = 'principal'

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))

function idb(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    if (typeof indexedDB === 'undefined') return ko(new Error('IndexedDB no disponible'))
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE) }
    r.onsuccess = () => ok(r.result)
    r.onerror = () => ko(r.error)
  })
}
const req = <T>(r: IDBRequest<T>) => new Promise<T>((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error) })

let keyP: Promise<CryptoKey> | null = null
/** Clave del cofre: se crea la primera vez (no exportable) y se reutiliza. */
export function vaultKey(): Promise<CryptoKey> {
  keyP ??= (async () => {
    const db = await idb()
    const found = await req(db.transaction(STORE).objectStore(STORE).get(KEY_ID)) as CryptoKey | undefined
    if (found) return found
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    await req(db.transaction(STORE, 'readwrite').objectStore(STORE).put(key, KEY_ID))
    return key
  })()
  keyP.catch(() => { keyP = null })
  return keyP
}

/** Cifra un texto: «v1.<iv>.<cifrado>» en Base64 (el IV es aleatorio en cada llamada). */
export async function seal(text: string, key?: CryptoKey): Promise<string> {
  const k = key ?? await vaultKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(text)))
  return `v1.${b64(iv)}.${b64(ct)}`
}

/** Descifra lo que produjo `seal`; falla si el dato se alteró o si la clave del cofre ya no existe. */
export async function unseal(sealed: string, key?: CryptoKey): Promise<string> {
  const [v, iv, ct] = sealed.split('.')
  if (v !== 'v1' || !iv || !ct) throw new Error('Formato de secreto desconocido')
  const k = key ?? await vaultKey()
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, k, unb64(ct)))
}
