// Criterio de éxito de cada laboratorio, comprobado con los datos reales del flujo (sin IA).
import { LABDATA as L } from './labs.data'
import { opConfig } from './engine/cyberchef'
import { fromUtf8 } from './lib/bytes'
import type { OpNodeT, Result } from './engine/types'

type Results = Record<string, Result>
const texts = (nodes: OpNodeT[], r: Results) => nodes.map(n => r[n.id]).filter(x => x?.ok && x.bytes).map(x => fromUtf8(x!.bytes!))
const argOf = (n: OpNodeT, name: string) => { const i = opConfig(n.data.op)?.args.findIndex(a => a.name === name) ?? -1; return i >= 0 ? n.data.args?.[i] : undefined }
const outOf = (nodes: OpNodeT[], r: Results, op: string) => nodes.filter(n => n.data.op === op).map(n => r[n.id]).filter(x => x?.ok && x.bytes).map(x => fromUtf8(x!.bytes!))

export const LAB_CHECKS: Record<string, (nodes: OpNodeT[], r: Results) => boolean> = {
  // El candado cifrado en un modo que no es ECB (CBC, CTR…) y el cifrado funciona
  'ecb-pinguino': (nodes, r) => nodes.some(n => n.data.op === 'AES Encrypt' && r[n.id]?.ok && !String(argOf(n, 'Mode') ?? 'ECB').startsWith('ECB')),
  // Se lee m2 completo en alguna salida (m1 es la cuña que escribe el estudiante)
  'two-time-pad': (nodes, r) => texts(nodes, r).some(t => t.includes(L.ttp.m2.slice(0, 60))),
  // Los MD5 coinciden y hay dos SHA-256 distintos
  'md5-colision': (nodes, r) => {
    const md5 = outOf(nodes, r, 'MD5'), sha = outOf(nodes, r, 'SHA2')
    return md5.length >= 2 && md5.every(m => m === md5[0]) && new Set(sha).size >= 2
  },
  // El texto descifrado es el mensaje en español
  'sustitucion-frecuencias': (nodes, r) => texts(nodes, r).some(t => t.includes(L.sub.plain.slice(0, 40))),
  // El token descifrado empieza por admin=1
  'cbc-bitflip': (nodes, r) => texts(nodes, r).some(t => t.startsWith('admin=1')),
}

export const labPassed = (labId: string | undefined, nodes: OpNodeT[], results: Results) =>
  !!labId && !!LAB_CHECKS[labId]?.(nodes, results)
