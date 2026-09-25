// Laboratorios de vulnerabilidades. Cada laboratorio es un reto: se carga un flujo
// con el escenario montado y una consigna; el estudiante lo resuelve manipulando los
// bloques. La solución de ejemplo de cada uno está en writeups/.
import type { FlowSpec, Spec } from './io'
import { buildFlow } from './io'
import { LABDATA as L } from './labs.data'

export type Difficulty = 'Básico' | 'Intermedio' | 'Avanzado'

export interface Lab {
  id: string
  titulo: string
  vuln: string
  dificultad: Difficulty
  objetivo: string
  reto: string
  pistas: string[]
  criterio: string
  writeup: string
  flow: FlowSpec
  /** Bloque que conviene abrir al cargar (para ver el resultado o la consigna). */
  open?: string
}

const K16 = { string: L.ecb.key, option: 'Hex' }

export const LABS: Record<string, Lab> = {
  'ecb-pinguino': {
    id: 'ecb-pinguino',
    titulo: '1 · El pingüino de ECB',
    vuln: 'AES-ECB filtra patrones del texto claro',
    dificultad: 'Básico',
    objetivo: 'Ver, con los ojos, por qué el modo de operación importa tanto como el cifrado.',
    reto: 'La imagen de un candado se cifró con AES en modo ECB y la figura se sigue viendo. Cambia el parámetro «Mode» del bloque de cifrado de ECB/NoPadding a CBC/NoPadding y vuelve a mirar la imagen. Después responde: ¿por qué ECB deja ver el candado y CBC no?',
    pistas: [
      'ECB cifra cada bloque de 16 bytes por separado y sin memoria: dos bloques de entrada iguales dan dos bloques cifrados iguales.',
      'En la imagen hay grandes zonas de un solo color, es decir, muchísimos bloques idénticos. Esos se convierten en el mismo patrón cifrado y dibujan el contorno.',
      'CBC encadena cada bloque con el cifrado anterior (con XOR), así que dos zonas iguales dan cifrados distintos y el patrón desaparece.',
    ],
    criterio: 'En ECB se reconoce el candado; en CBC la imagen es ruido uniforme.',
    writeup: 'writeups/01-ecb-pinguino.md',
    open: 'render_ecb',
    flow: {
      n: [
        ['src', '__input', 0, 160, { file: L.ecb.bmpB64, fileName: 'candado.bmp' }],
        ['head', 'Take bytes', 300, 0, { Start: 0, Length: L.ecb.headerLen }],
        ['pix', 'Drop bytes', 300, 320, { Start: 0, Length: L.ecb.headerLen }],
        ['ecb', 'AES Encrypt', 600, 320, { Key: K16, IV: K16, Mode: 'ECB/NoPadding', Input: 'Raw', Output: 'Raw' }],
        ['join', '__concat', 900, 160],
        ['render_ecb', 'Render Image', 1200, 160, { 'Input format': 'Raw' }],
      ],
      e: [['src', 'head'], ['src', 'pix'], ['pix', 'ecb'], ['head', 'join', 0], ['ecb', 'join', 1], ['join', 'render_ecb']],
    },
  },

  'two-time-pad': {
    id: 'two-time-pad',
    titulo: '2 · Nonce reutilizado (two-time pad)',
    vuln: 'Reutilizar el flujo de clave en un cifrado de flujo',
    dificultad: 'Intermedio',
    objetivo: 'Recuperar dos mensajes cifrados con el MISMO flujo de clave, sin conocer la clave.',
    reto: 'Interceptaste dos mensajes (c1 y c2) cifrados con el mismo keystream: c = m ⊕ k. El bloque «XOR de dos flujos» ya calcula c1 ⊕ c2, que es igual a m1 ⊕ m2 (la clave se cancela). Sabemos que m1 empieza por «' + L.ttp.crib + '». Úsalo como cuña (crib dragging) para destapar el arranque de m2, y desde ahí reconstruye ambos mensajes.',
    pistas: [
      'c1 ⊕ c2 = m1 ⊕ m2: el keystream desaparece porque k ⊕ k = 0.',
      'Si conoces un trozo de m1 en una posición, al XORearlo contra (m1 ⊕ m2) en esa misma posición obtienes el mismo trozo de m2.',
      'Agrega un bloque XOR después del XOR de los dos flujos y pon como clave (en UTF-8) la cuña conocida. Lo legible al inicio es el arranque de m2; con eso amplías la cuña y avanzas.',
      'Alternativa: si conoces m1 completo, k = c1 ⊕ m1 y entonces m2 = c2 ⊕ k.',
    ],
    criterio: 'Se leen los dos mensajes completos en español.',
    writeup: 'writeups/02-two-time-pad.md',
    open: 'xorout',
    flow: {
      n: [
        ['c1', '__input', 0, 0, { text: L.ttp.c1, fmt: 'Hex' }],
        ['c2', '__input', 0, 220, { text: L.ttp.c2, fmt: 'Hex' }],
        ['xor', '__xor2', 340, 110],
        ['xorout', '__output', 640, 110, { label: 'm1 ⊕ m2 (aquí trabajas la cuña)' }],
      ],
      e: [['c1', 'xor', 0], ['c2', 'xor', 1], ['xor', 'xorout']],
    },
  },

  'md5-colision': {
    id: 'md5-colision',
    titulo: '3 · Colisión de MD5',
    vuln: 'MD5 (y SHA-1) ya no resisten colisiones',
    dificultad: 'Básico',
    objetivo: 'Demostrar que un hash roto no sirve para garantizar integridad.',
    reto: 'Los bloques A y B son dos archivos DISTINTOS (difieren en 6 bytes). El flujo ya calcula el MD5 de cada uno: son idénticos. Ahora agrega a cada rama un bloque «SHA2» (256) y compara. Responde: si un antivirus o una tienda de apps identifica los archivos por su MD5, ¿qué ataque permite esto?',
    pistas: [
      'MD5(A) = MD5(B) = ' + L.md5.md5 + ', pero los archivos no son iguales: mira los bytes en las posiciones 19, 45, 59, 83, 109 y 123.',
      'SHA-256 sí los distingue: dos hashes completamente diferentes.',
      'Consecuencia real: se pueden fabricar dos ficheros con el mismo MD5, uno inofensivo y otro malicioso (o dos certificados X.509). Quien confíe en el MD5 los tratará como el mismo.',
    ],
    criterio: 'Los dos MD5 coinciden y los dos SHA-256 difieren.',
    writeup: 'writeups/03-md5-colision.md',
    open: 'md5a',
    flow: {
      n: [
        ['a', '__input', 0, 0, { text: L.md5.x1, fmt: 'Hex' }],
        ['b', '__input', 0, 260, { text: L.md5.x2, fmt: 'Hex' }],
        ['md5a', 'MD5', 340, 0],
        ['md5b', 'MD5', 340, 260],
        ['oa', '__output', 640, 0, { label: 'MD5 de A' }],
        ['ob', '__output', 640, 260, { label: 'MD5 de B' }],
      ],
      e: [['a', 'md5a'], ['md5a', 'oa'], ['b', 'md5b'], ['md5b', 'ob']],
    },
  },

  'sustitucion-frecuencias': {
    id: 'sustitucion-frecuencias',
    titulo: '4 · Análisis de frecuencias',
    vuln: 'La sustitución monoalfabética conserva la huella del idioma',
    dificultad: 'Intermedio',
    objetivo: 'Descifrar un texto sin la clave, usando solo la estadística del español.',
    reto: 'El texto está cifrado con una sustitución monoalfabética (cada letra se cambió por otra fija). El bloque «Frequency distribution» muestra qué símbolos son más comunes. Usa el bloque «Substitute» para ir armando el alfabeto: en «Ciphertext» pon las letras cifradas y en «Plaintext» tus hipótesis. Recupera el mensaje.',
    pistas: [
      'En español las más frecuentes son E y A, seguidas de O, S, N, R. Empareja los símbolos más comunes del cifrado con estas.',
      'Las palabras de una letra son casi siempre A, E, O, Y. Las de dos que se repiten mucho: DE, LA, EL, EN, SE.',
      'En el bloque Substitute, «Plaintext» y «Ciphertext» son dos cadenas alineadas carácter a carácter. Ve añadiendo pares a medida que confirmas letras y el texto se irá volviendo legible.',
      'Pista fuerte: el mensaje habla de la propia criptografía clásica y de las frecuencias; la palabra «frecuencias» aparece.',
    ],
    criterio: 'El texto descifrado es español legible.',
    writeup: 'writeups/04-sustitucion-frecuencias.md',
    open: 'freq',
    flow: {
      n: [
        ['ct', '__input', 0, 120, { text: L.sub.cipher, fmt: 'Texto (UTF-8)' }],
        ['freq', 'Frequency distribution', 340, 0, { 'Show 0%s': false, 'Show ASCII': false }],
        ['fout', '__output', 640, 0, { label: 'Frecuencias' }],
        ['sub', 'Substitute', 340, 260, { Plaintext: '', Ciphertext: '' }],
        ['sout', '__output', 640, 260, { label: 'Intento de descifrado' }],
      ],
      e: [['ct', 'freq'], ['freq', 'fout'], ['ct', 'sub'], ['sub', 'sout']],
    },
  },

  'cbc-bitflip': {
    id: 'cbc-bitflip',
    titulo: '5 · Maleabilidad de CBC (bit-flipping)',
    vuln: 'CBC no autentica: se puede alterar el texto claro sin la clave',
    dificultad: 'Avanzado',
    objetivo: 'Cambiar el mensaje descifrado sin conocer la clave, manipulando solo el IV.',
    reto: 'El token cifrado descifra a «admin=0;…». Tu meta: que descifre a «admin=1;…» SIN tocar la clave. En CBC, P0 = D(C0) ⊕ IV, así que al voltear un byte del IV volteas el mismo byte del texto claro. La rama de arriba calcula IV ⊕ máscara (la máscara ya tiene 0x01 en la posición 6). Copia ese «IV modificado» al parámetro IV del bloque «AES Decrypt» de abajo y observa el resultado.',
    pistas: [
      "El byte a cambiar es '0' (0x30) → '1' (0x31). La diferencia es 0x30 ⊕ 0x31 = 0x01, y va en la posición 6, dentro del primer bloque.",
      'La máscara ya está puesta: ceros salvo un 0x01 en la posición 6. El bloque «A hex» de arriba te da el IV modificado listo para copiar.',
      'Pega ese valor en el campo IV del bloque AES Decrypt (formato Hex). El texto pasa de admin=0 a admin=1 y el resto queda intacto, porque el IV solo afecta al primer bloque.',
      'El bloque de descifrado tiene la clave solo para que veas el efecto; el atacante real no la conoce ni la necesita: manipula el mensaje a ciegas.',
    ],
    criterio: 'La salida descifrada empieza por «admin=1».',
    writeup: 'writeups/05-cbc-bitflip.md',
    open: 'ivout',
    flow: {
      n: [
        ['iv', '__input', 0, 0, { text: L.cbc.iv, fmt: 'Hex' }],
        ['mask', '__input', 0, 210, { text: L.cbc.mask, fmt: 'Hex' }],
        ['xor', '__xor2', 320, 60],
        ['ivhex', 'To Hex', 560, 60, { Delimiter: 'None' }],
        ['ivout', '__output', 800, 60, { label: 'IV modificado (cópialo abajo)' }],
        ['ct', '__input', 320, 320, { text: L.cbc.ct, fmt: 'Hex' }],
        ['dec', 'AES Decrypt', 620, 320, { Key: { string: L.cbc.key, option: 'Hex' }, IV: { string: L.cbc.iv, option: 'Hex' }, Mode: 'CBC/NoPadding', Input: 'Raw', Output: 'Raw' }],
        ['ptout', '__output', 920, 320, { label: 'Token descifrado' }],
      ],
      e: [['iv', 'xor', 0], ['mask', 'xor', 1], ['xor', 'ivhex'], ['ivhex', 'ivout'], ['ct', 'dec'], ['dec', 'ptout']],
    },
  },
}

export function buildLab(id: string) {
  const lab = LABS[id]
  const { nodes, edges, map } = buildFlow(lab.flow)
  return { nodes, edges, open: lab.open ? map[lab.open] : undefined }
}
