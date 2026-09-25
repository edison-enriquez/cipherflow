// Catálogo de bloques: operaciones de CyberChef agrupadas en español + bloques propios de flujo.
import { engine, opConfig } from './cyberchef'
import { stripTags } from '../lib/bytes'

export type Color = 'green' | 'blue' | 'red' | 'yellow' | 'purple' | 'orange' | 'cyan' | 'pink' | 'muted'

export const CUSTOM = {
  __input: { name: 'Entrada', inputs: 0, desc: 'Punto de partida del flujo: escribe texto, pega hex o Base64, o carga un archivo.' },
  __output: { name: 'Salida', inputs: 1, desc: 'Muestra el resultado final. Puedes tener varias salidas.' },
  __xor2: { name: 'XOR de dos flujos', inputs: 2, desc: 'XOR byte a byte entre dos entradas; la segunda se repite si es más corta.' },
  __concat: { name: 'Unir flujos', inputs: 2, desc: 'Concatena la entrada 1 seguida de la entrada 2, con un separador opcional.' },
} as const
export type CustomOp = keyof typeof CUSTOM
export const isCustom = (op: string): op is CustomOp => op in CUSTOM

export const customDefaults = (op: CustomOp): Record<string, any> => ({
  __input: { text: 'Hola Juan, esto es AES-CBC!', fmt: 'Texto (UTF-8)', file: null, fileName: '' },
  __output: { label: '' },
  __xor2: {},
  __concat: { sep: '' },
})[op]

const CAT_ES: Record<string, string> = {
  'Data format': 'Formato de datos', 'Encryption / Encoding': 'Cifrado y codificación', 'Public Key': 'Clave pública',
  'Arithmetic / Logic': 'Aritmética y lógica', Networking: 'Redes', Language: 'Idioma', Utils: 'Utilidades',
  'Date / Time': 'Fecha y hora', Extractors: 'Extractores', Compression: 'Compresión', Hashing: 'Hashing',
  'Code tidy': 'Código', Forensics: 'Forense', Multimedia: 'Multimedia', Other: 'Otros', 'Flow control': 'Control de flujo',
}
const CAT_COLOR: Record<string, Color> = {
  Flujo: 'green', 'Más usadas': 'yellow', 'Formato de datos': 'blue', 'Cifrado y codificación': 'purple', 'Clave pública': 'pink',
  'Aritmética y lógica': 'cyan', Redes: 'cyan', Idioma: 'orange', Utilidades: 'muted', 'Fecha y hora': 'orange',
  Extractores: 'orange', Compresión: 'cyan', Hashing: 'yellow', Código: 'blue', Forense: 'red', Multimedia: 'pink',
  Otros: 'muted', 'Control de flujo': 'purple',
}
export const catColor = (cat: string): Color => CAT_COLOR[cat] ?? 'muted'

const POPULAR = ['To Base64', 'From Base64', 'To Hex', 'From Hex', 'AES Encrypt', 'AES Decrypt', 'XOR', 'SHA2', 'ROT13', 'Magic', 'To Binary', 'Vigenère Encode', 'Gunzip', 'URL Decode']
/** Los bloques de control de flujo de CyberChef no aplican en un grafo: esa función la cumplen los cables. */
export const EXCLUDED = new Set(['Fork', 'Subsection', 'Merge', 'Register', 'Label', 'Jump', 'Conditional Jump', 'Return', 'Comment'])
export const EXPLAINED = new Set(['To Base64', 'From Base64', 'To Hex', 'From Hex', 'To Binary', 'XOR', 'ROT13', 'Vigenère Encode', 'Vigenère Decode', 'AES Encrypt', 'AES Decrypt', 'SHA2'])

export interface Category { name: string; ops: string[] }
let cats: Category[] = []
const opCat: Record<string, string> = {}

export function buildCatalog(): Category[] {
  if (cats.length) return cats
  const { Categories } = engine()
  cats = [{ name: 'Flujo', ops: Object.keys(CUSTOM) }, { name: 'Más usadas', ops: POPULAR.filter(o => opConfig(o)) }]
  for (const c of Categories) {
    if (c.name === 'Favourites') continue
    const ops = c.ops.filter(o => opConfig(o) && !EXCLUDED.has(o))
    if (!ops.length) continue
    const name = CAT_ES[c.name] ?? c.name
    cats.push({ name, ops })
    ops.forEach(o => { opCat[o] ??= name })
  }
  return cats
}

export interface OpInfo { name: string; cat: string; inputs: number; desc: string; custom: boolean }
export function opInfo(op: string): OpInfo {
  if (isCustom(op)) return { name: CUSTOM[op].name, cat: 'Flujo', inputs: CUSTOM[op].inputs, desc: CUSTOM[op].desc, custom: true }
  return { name: op, cat: opCat[op] ?? 'Otros', inputs: 1, desc: stripTags(opConfig(op)?.description ?? ''), custom: false }
}
export const totalOps = () => cats.slice(2).reduce((s, c) => s + c.ops.length, 0) && new Set(cats.slice(2).flatMap(c => c.ops)).size
