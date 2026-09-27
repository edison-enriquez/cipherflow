// Casos del banco de evaluación. Los valores esperados se calcularon con node:crypto / zlib o
// son vectores de prueba conocidos (no con CyberChef), y cada «reference» es una solución que el
// test del banco ejecuta en el motor real para asegurar que el caso es resoluble.
// Los textos son ASCII: con acentos, algunas operaciones de texto dan hoy un resultado incorrecto en
// CipherFlow (p. ej. URL Decode de «caf%C3%A9» sale en Latin-1), y eso no es culpa del modelo.
import type { AIBlock, AIFlow } from './flowSpec'
import type { EvalCase } from './bench'

type Step = [op: string, args?: Record<string, any>]
const HEX = (s: string) => ({ string: s, option: 'Hex' })
const UTF8 = (s: string) => ({ string: s, option: 'UTF8' })

/** Entrada → pasos en cadena → Salida. */
function chain(title: string, text: string, steps: Step[], fmt = 'Texto (UTF-8)'): AIFlow {
  const blocks: AIBlock[] = [{ key: 'in', op: '__input', params: { text, fmt } }]
  steps.forEach(([op, args], i) => blocks.push({ key: 's' + i, op, args: args ?? {} }))
  blocks.push({ key: 'out', op: '__output', params: { label: 'Resultado' } })
  const keys = blocks.map(b => b.key)
  return { title, blocks, links: keys.slice(1).map((k, i) => ({ from: keys[i], to: k, port: 0 })), checks: [] }
}

/** Dos entradas combinadas por un bloque de dos puertos. */
function pair(title: string, a: string, b: string, op: '__xor2' | '__concat', after: Step[] = []): AIFlow {
  const blocks: AIBlock[] = [
    { key: 'a', op: '__input', params: { text: a, fmt: 'Texto (UTF-8)' } },
    { key: 'b', op: '__input', params: { text: b, fmt: 'Texto (UTF-8)' } },
    { key: 'm', op, params: {} },
    ...after.map(([o, args], i) => ({ key: 's' + i, op: o, args: args ?? {} })),
    { key: 'out', op: '__output', params: { label: 'Resultado' } },
  ]
  const tail = blocks.slice(2).map(x => x.key)
  return { title, blocks, links: [{ from: 'a', to: 'm', port: 0 }, { from: 'b', to: 'm', port: 1 }, ...tail.slice(1).map((k, i) => ({ from: tail[i], to: k, port: 0 }))], checks: [] }
}

const one = (...v: string[]) => [{ anyOf: v }]

const K1 = '00112233445566778899aabbccddeeff', IV1 = '000102030405060708090a0b0c0d0e0f'
const K2 = '000102030405060708090a0b0c0d0e0f', IV2 = '0f0e0d0c0b0a09080706050403020100'

export const BENCH_CASES: EvalCase[] = [
  // ── Codificación ──
  { id: 'b64-enc', kind: 'codificación', request: 'Codifica «hola mundo» en Base64.', expect: one('aG9sYSBtdW5kbw=='),
    reference: chain('Base64', 'hola mundo', [['To Base64']]) },
  { id: 'b64-dec', kind: 'codificación', request: 'Decodifica este Base64: Q2lwaGVyRmxvdw==', expect: one('CipherFlow'),
    reference: chain('Desde Base64', 'Q2lwaGVyRmxvdw==', [['From Base64']]) },
  { id: 'hex-enc', kind: 'codificación', request: 'Pasa el texto «ABC» a hexadecimal.', expect: one('414243'),
    reference: chain('Hex', 'ABC', [['To Hex']]) },
  { id: 'b32-enc', kind: 'codificación', request: 'Codifica «hola» en Base32.', expect: one('NBXWYYI='),
    reference: chain('Base32', 'hola', [['To Base32']]) },
  { id: 'binary', kind: 'codificación', request: 'Muestra el texto «Hi» en binario (8 bits por byte).', expect: one('0100100001101001'),
    reference: chain('Binario', 'Hi', [['To Binary']]) },
  { id: 'url-enc', kind: 'codificación', request: 'Codifica para URL el texto «hola mundo».', expect: one('hola%20mundo'),
    reference: chain('URL', 'hola mundo', [['URL Encode']]) },
  { id: 'url-dec', kind: 'codificación', request: 'Decodifica de URL: hola%20mundo%21', expect: one('hola mundo!'),
    reference: chain('Desde URL', 'hola%20mundo%21', [['URL Decode']]) },
  { id: 'morse', kind: 'codificación', request: 'Pasa «SOS» a código Morse.', expect: one('...---...'),
    reference: chain('Morse', 'SOS', [['To Morse Code']]) },

  // ── Hash y MAC ──
  { id: 'sha256', kind: 'hash', request: 'Calcula el SHA-256 de «abc».', expect: one('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'),
    reference: chain('SHA-256', 'abc', [['SHA2', { Size: '256' }]]) },
  { id: 'md5', kind: 'hash', request: 'Calcula el MD5 de «password».', expect: one('5f4dcc3b5aa765d61d8327deb882cf99'),
    reference: chain('MD5', 'password', [['MD5']]) },
  { id: 'sha1', kind: 'hash', request: 'Calcula el SHA-1 de «hola».', expect: one('99800b85d3383e3a2fb45eb7d0066a4879a9dad0'),
    reference: chain('SHA-1', 'hola', [['SHA1']]) },
  { id: 'hmac', kind: 'hash', request: 'Calcula el HMAC-SHA256 del mensaje «datos» con la clave «secreto» (texto).', expect: one('4a9728581fe0ee78a74ba63eeedfcc03a2881ddb79a1b5fd7970c42ad57a3f5f'),
    reference: chain('HMAC', 'datos', [['HMAC', { Key: UTF8('secreto'), 'Hashing function': 'SHA256' }]]) },
  { id: 'pbkdf2', kind: 'hash', request: 'Deriva una clave de 256 bits con PBKDF2-SHA256 a partir de la contraseña «clave», sal hex 00112233 y 1000 iteraciones.',
    expect: one('055a1456b841d6bd571cf1cfeb43cb18adb4b2ff64554804b695b9ef1b4a0476'),
    reference: chain('PBKDF2', 'x', [['Derive PBKDF2 key', { Passphrase: UTF8('clave'), 'Key size': 256, Iterations: 1000, 'Hashing function': 'SHA256', Salt: HEX('00112233') }]]) },

  // ── Cifrados clásicos ──
  { id: 'rot13', kind: 'clásico', request: 'Aplica ROT13 a «Hello World».', expect: one('Uryyb Jbeyq'),
    reference: chain('ROT13', 'Hello World', [['ROT13']]) },
  { id: 'caesar3', kind: 'clásico', request: 'Cifra «ataque al amanecer» con el cifrado César, desplazamiento 3.', expect: one('dwdtxh do dpdqhfhu'),
    reference: chain('César', 'ataque al amanecer', [['ROT13', { Amount: 3 }]]) },
  { id: 'vigenere', kind: 'clásico', request: 'Cifra «ATTACKATDAWN» con Vigenère usando la clave «LEMON».', expect: one('LXFOPVEFRNHR'),
    reference: chain('Vigenère', 'ATTACKATDAWN', [['Vigenère Encode', { Key: 'LEMON' }]]) },
  { id: 'atbash', kind: 'clásico', request: 'Aplica el cifrado Atbash a «hola».', expect: one('sloz'),
    reference: chain('Atbash', 'hola', [['Atbash Cipher']]) },

  // ── Cifrado moderno ──
  { id: 'aes-enc', kind: 'cifrado', request: `Cifra «hola» con AES-128-CBC, clave ${K1} e IV ${IV1} (ambos en hex). Salida en hex.`, expect: one('30c0b706a5550bed5cc6575d65d0b20a'),
    reference: chain('AES', 'hola', [['AES Encrypt', { Key: HEX(K1), IV: HEX(IV1), Mode: 'CBC', Input: 'Raw', Output: 'Hex' }]]) },
  { id: 'aes-roundtrip', kind: 'cifrado', request: `Cifra «mensaje secreto» con AES-CBC (clave hex ${K2}, IV hex ${IV2}), muestra el cifrado en hex y descífralo para comprobar que vuelve el original.`,
    expect: [{ anyOf: ['3d5821c1d02a8f881d2ba16edf9e27b4'] }, { anyOf: ['mensaje secreto'] }],
    reference: {
      title: 'AES ida y vuelta', checks: [],
      blocks: [
        { key: 'in', op: '__input', params: { text: 'mensaje secreto', fmt: 'Texto (UTF-8)' } },
        { key: 'enc', op: 'AES Encrypt', args: { Key: HEX(K2), IV: HEX(IV2), Mode: 'CBC', Input: 'Raw', Output: 'Hex' } },
        { key: 'o1', op: '__output', params: { label: 'Cifrado' } },
        { key: 'dec', op: 'AES Decrypt', args: { Key: HEX(K2), IV: HEX(IV2), Mode: 'CBC', Input: 'Hex', Output: 'Raw' } },
        { key: 'o2', op: '__output', params: { label: 'Descifrado' } },
      ],
      links: [{ from: 'in', to: 'enc', port: 0 }, { from: 'enc', to: 'o1', port: 0 }, { from: 'enc', to: 'dec', port: 0 }, { from: 'dec', to: 'o2', port: 0 }],
    } },
  { id: 'xor-key', kind: 'cifrado', request: 'Haz XOR del texto «hola» con la clave hex 2a.', expect: one('4245464b', 'BEFK'),
    reference: chain('XOR', 'hola', [['XOR', { Key: HEX('2a') }]]) },
  { id: 'xor2', kind: 'cifrado', request: 'Haz XOR byte a byte de «ABCD» con «1234» (dos entradas) y muestra el resultado en hex.', expect: one('70707070'),
    reference: pair('XOR de dos entradas', 'ABCD', '1234', '__xor2', [['To Hex']]) },

  // ── Cadenas de pasos ──
  { id: 'b64-md5', kind: 'cadena', request: 'Codifica «hola» en Base64 y después calcula el MD5 de ese texto Base64.', expect: one('21e16ade6ef4e1f58ea6aeef3fe9be51'),
    reference: chain('Base64 y MD5', 'hola', [['To Base64'], ['MD5']]) },
  { id: 'gzip-roundtrip', kind: 'cadena', request: 'Comprime «aaaaaaaaaaaaaaaaaaaa» con Gzip y descomprímelo para verificar que sale igual.', expect: one('aaaaaaaaaaaaaaaaaaaa'),
    reference: chain('Gzip ida y vuelta', 'aaaaaaaaaaaaaaaaaaaa', [['Gzip'], ['Gunzip']]) },
  { id: 'hex-dec-b64', kind: 'cadena', request: 'Convierte el hex 48656c6c6f a texto y luego codifícalo en Base64.', expect: one('SGVsbG8='),
    reference: chain('Hex → Base64', '48656c6c6f', [['From Hex'], ['To Base64']]) },

  // ── Texto ──
  { id: 'reverse', kind: 'texto', request: 'Invierte el texto «CipherFlow».', expect: one('wolFrehpiC'),
    reference: chain('Invertir', 'CipherFlow', [['Reverse', { By: 'Character' }]]) },
  { id: 'upper', kind: 'texto', request: 'Convierte «criptografia» a mayúsculas.', expect: one('CRIPTOGRAFIA'),
    reference: chain('Mayúsculas', 'criptografia', [['To Upper case']]) },
  { id: 'concat', kind: 'texto', request: 'Une los textos «cripto» y «grafía» en uno solo (dos entradas).', expect: one('criptografía'),
    reference: pair('Unir', 'cripto', 'grafía', '__concat') },
]
