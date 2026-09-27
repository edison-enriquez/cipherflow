// Catálogo falso (sin motor de CyberChef) y modelo guionizado para probar el agente sin red.
import { CUSTOM_OPS, type Catalog, type OpLite } from '../catalog'
import type { CompleteFn, Message } from '../llm'

const OPS: OpLite[] = [
  { name: 'To Base64', category: 'Formato de datos', description: 'Encodes raw data into an ASCII Base64 string.', inputs: 1, args: [{ name: 'Alphabet', type: 'option', options: ['A-Za-z0-9+/=', 'A-Za-z0-9-_'] }] },
  { name: 'From Base64', category: 'Formato de datos', description: 'Decodes Base64 data.', inputs: 1, args: [{ name: 'Alphabet', type: 'option', options: ['A-Za-z0-9+/='] }, { name: 'Remove non-alphabet chars', type: 'boolean' }] },
  { name: 'AES Encrypt', category: 'Cifrado y codificación', description: 'Advanced Encryption Standard (AES) encrypt.', inputs: 1, args: [
    { name: 'Key', type: 'toggleString', options: ['Hex', 'UTF8', 'Latin1', 'Base64'] },
    { name: 'IV', type: 'toggleString', options: ['Hex', 'UTF8', 'Latin1', 'Base64'] },
    { name: 'Mode', type: 'option', options: ['CBC', 'CFB', 'OFB', 'CTR', 'GCM', 'ECB'] },
    { name: 'Input', type: 'option', options: ['Raw', 'Hex'] },
    { name: 'Output', type: 'option', options: ['Hex', 'Raw'] }] },
  { name: 'SHA2', category: 'Hashing', description: 'The SHA-2 hash family.', inputs: 1, args: [{ name: 'Size', type: 'option', options: ['512', '384', '256', '224'] }, { name: 'Rounds', type: 'number' }] },
]

export const fakeCatalog: Catalog = {
  names: () => [...CUSTOM_OPS, ...OPS].map(o => o.name),
  get: n => [...CUSTOM_OPS, ...OPS].find(o => o.name === n),
}

/** Modelo que responde, en orden, las respuestas dadas; registra los mensajes que recibe. */
export function scripted(responses: (string | object)[]) {
  const seen: Message[][] = []
  const complete: CompleteFn = async (_c, messages) => {
    seen.push(messages.map(m => ({ ...m })))
    const r = responses.shift()
    if (r === undefined) throw new Error('El guion se quedó sin respuestas')
    return typeof r === 'string' ? r : JSON.stringify(r)
  }
  return { complete, seen }
}

export const cfg = { provider: 'groq' as const, groqKey: 'test', groqModel: 'x', webllmModel: 'y' }

/** Flujo válido: Entrada → To Base64 → Salida. */
export const b64Flow = (extra: object = {}) => ({
  title: 'Base64 de un texto',
  blocks: [
    { key: 'in', op: '__input', params: { text: 'hola', fmt: 'Texto (UTF-8)' } },
    { key: 'b64', op: 'To Base64', args: { Alphabet: 'A-Za-z0-9+/=' } },
    { key: 'out', op: '__output', params: { label: 'Resultado' } },
  ],
  links: [['in', 'b64'], ['b64', 'out']],
  ...extra,
})
