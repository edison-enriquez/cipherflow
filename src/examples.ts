// Catálogo de ejemplos, agrupado por tema como aparece en la galería (#/ejemplos).
// El nombre de cada ejemplo es su clave: los flujos guardados la recuerdan, así que no se renombran.
import type { Color } from './engine/catalog'
import { NET_EXAMPLES } from './examples.redes'

export type Spec = [key: string, op: string, x: number, y: number, args?: Record<string, any>][]
export interface Example {
  /** Qué enseña, en una o dos frases (se muestra en la tarjeta de la galería). */
  d: string
  n: Spec
  e: [string, string, number?][]
  /** Bloque cuyo detalle se abre al cargar el ejemplo. */
  open?: string
}
export interface ExampleGroup { id: string; title: string; desc: string; color: Color; examples: Record<string, Example> }

const K16 = { string: '000102030405060708090a0b0c0d0e0f', option: 'Hex' }
const IV16 = { string: '0f0e0d0c0b0a09080706050403020100', option: 'Hex' }
const UTF8 = (s: string) => ({ string: s, option: 'UTF8' })
const HEXK = (s: string) => ({ string: s, option: 'Hex' })

const ENCODING: Record<string, Example> = {
  'Base64 bit a bit': {
    d: 'Cómo Base64 reagrupa los bits de 8 en 6 para usar solo 64 caracteres imprimibles, y cómo se deshace.',
    n: [['a', '__input', 0, 90, { text: 'Hola!' }], ['b', 'To Binary', 330, 0], ['c', '__output', 680, 0, { label: 'Bits' }], ['d', 'To Base64', 330, 200], ['e', 'From Base64', 680, 200], ['f', '__output', 1030, 200, { label: 'De vuelta' }]],
    e: [['a', 'b'], ['b', 'c'], ['a', 'd'], ['d', 'e'], ['e', 'f']], open: 'd',
  },
  'Bases comparadas: 16, 32, 58, 64 y 85': {
    d: 'El mismo texto en cinco bases. A más símbolos en el alfabeto, más corta la salida; Base58 evita caracteres que se confunden (0/O, l/I).',
    n: [['a', '__input', 0, 440, { text: 'Hola mundo' }],
      ['h', 'To Hex', 350, 0], ['ho', '__output', 700, 0, { label: 'Base16 (hex): 2 caracteres por byte' }],
      ['b32', 'To Base32', 350, 220], ['b32o', '__output', 700, 220, { label: 'Base32' }],
      ['b58', 'To Base58', 350, 440], ['b58o', '__output', 700, 440, { label: 'Base58 (Bitcoin)' }],
      ['b64', 'To Base64', 350, 660], ['b64o', '__output', 700, 660, { label: 'Base64' }],
      ['b85', 'To Base85', 350, 880], ['b85o', '__output', 700, 880, { label: 'Base85: la más compacta' }]],
    e: [['a', 'h'], ['h', 'ho'], ['a', 'b32'], ['b32', 'b32o'], ['a', 'b58'], ['b58', 'b58o'], ['a', 'b64'], ['b64', 'b64o'], ['a', 'b85'], ['b85', 'b85o']], open: 'b64',
  },
  'UTF-8: un carácter, varios bytes': {
    d: 'Por qué «año €» no ocupa 5 bytes: UTF-8 usa 1 byte para ASCII, 2 para la ñ y 3 para el €. UTF-16 reparte distinto.',
    n: [['a', '__input', 0, 220, { text: 'año €' }],
      ['h', 'To Hex', 350, 0], ['ho', '__output', 700, 0, { label: 'Bytes en UTF-8' }],
      ['u', 'Escape Unicode Characters', 350, 220, { Prefix: 'U+', 'Encode all chars': true }], ['uo', '__output', 700, 220, { label: 'Puntos de código Unicode' }],
      ['w', 'Encode text', 350, 440, { Encoding: 'UTF-16LE (1200)' }], ['wh', 'To Hex', 700, 440], ['wo', '__output', 1050, 440, { label: 'Bytes en UTF-16LE' }]],
    e: [['a', 'h'], ['h', 'ho'], ['a', 'u'], ['u', 'uo'], ['a', 'w'], ['w', 'wh'], ['wh', 'wo']], open: 'h',
  },
  'Magic: descubrir la codificación': {
    d: 'Un texto codificado varias veces. Magic prueba decodificaciones y propone la receta que produce texto legible.',
    n: [['a', '__input', 0, 90, { text: 'NTM2NTYzNzI2NTc0NmYyMDY0NjU2YzIwNmM2MTYyNmY3MjYxNzQ2ZjcyNjk2Zg==' }], ['b', 'Magic', 330, 90], ['c', '__output', 680, 90, { label: 'Sugerencias' }]],
    e: [['a', 'b'], ['b', 'c']], open: 'b',
  },
}

const CLASSIC: Record<string, Example> = {
  'Clásicos: ROT13 y Vigenère': {
    d: 'Un desplazamiento fijo (ROT13) frente a uno que cambia con cada letra de la clave (Vigenère).',
    n: [['a', '__input', 0, 90, { text: 'Ataca al amanecer' }], ['b', 'ROT13', 330, 0], ['c', '__output', 680, 0, { label: 'ROT13' }],
      ['d', 'Vigenère Encode', 330, 200, { Key: 'LIMON' }], ['e', 'Vigenère Decode', 680, 200, { Key: 'LIMON' }], ['f', '__output', 1030, 200, { label: 'Vigenère ida y vuelta' }]],
    e: [['a', 'b'], ['b', 'c'], ['a', 'd'], ['d', 'e'], ['e', 'f']], open: 'd',
  },
  'César: romperlo por fuerza bruta': {
    d: 'Solo hay 25 claves posibles. Con una palabra que sospechas del mensaje («ataque») la fuerza bruta encuentra la buena al instante.',
    n: [['a', '__input', 0, 110, { text: 'El ataque sera al amanecer por el puente norte' }],
      ['c', 'ROT13', 350, 110, { Amount: 7 }], ['co', '__output', 700, 0, { label: 'Cifrado (César +7)' }],
      ['b', 'ROT13 Brute Force', 700, 220, { 'Crib (known plaintext string)': 'ataque' }], ['bo', '__output', 1050, 220, { label: 'Claves que revelan «ataque»' }]],
    e: [['a', 'c'], ['c', 'co'], ['c', 'b'], ['b', 'bo']], open: 'b',
  },
  'Sustitución: Atbash y alfabeto propio': {
    d: 'Atbash invierte el alfabeto (A↔Z); una sustitución con alfabeto propio tiene 26! claves, pero conserva las frecuencias de las letras.',
    n: [['a', '__input', 0, 110, { text: 'ATAQUE AL AMANECER' }],
      ['t', 'Atbash Cipher', 350, 0], ['to', '__output', 700, 0, { label: 'Atbash' }],
      ['s', 'Substitute', 350, 220, { Plaintext: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', Ciphertext: 'QWERTYUIOPASDFGHJKLZXCVBNM' }], ['so', '__output', 700, 220, { label: 'Alfabeto QWERTY' }]],
    e: [['a', 't'], ['t', 'to'], ['a', 's'], ['s', 'so']], open: 's',
  },
  'Rail Fence: transponer en vez de sustituir': {
    d: 'Las letras no cambian, solo de lugar: se escriben en zigzag sobre 3 rieles y se leen por filas.',
    n: [['a', '__input', 0, 90, { text: 'ATAQUEALAMANECER' }],
      ['e', 'Rail Fence Cipher Encode', 350, 0, { Key: 3 }], ['eo', '__output', 700, 0, { label: 'Cifrado (3 rieles)' }],
      ['d', 'Rail Fence Cipher Decode', 700, 200, { Key: 3 }], ['do', '__output', 1050, 200, { label: 'Descifrado' }]],
    e: [['a', 'e'], ['e', 'eo'], ['e', 'd'], ['d', 'do']], open: 'e',
  },
}

const MODERN: Record<string, Example> = {
  'AES-CBC por dentro': {
    d: 'Cifrado por bloques con clave e IV de 16 bytes: cada bloque se mezcla con el anterior antes de cifrarse.',
    n: [['a', '__input', 0, 90, { text: 'Hola Juan, esto es AES-CBC!' }], ['b', 'AES Encrypt', 330, 90, { Key: K16, IV: IV16, Mode: 'CBC', Input: 'Raw', Output: 'Hex' }],
      ['c', '__output', 680, 0, { label: 'Cifrado (hex)' }], ['d', 'AES Decrypt', 680, 200, { Key: K16, IV: IV16, Mode: 'CBC', Input: 'Hex', Output: 'Raw' }], ['e', '__output', 1030, 200, { label: 'Descifrado' }]],
    e: [['a', 'b'], ['b', 'c'], ['b', 'd'], ['d', 'e']], open: 'b',
  },
  'ECB revela patrones': {
    d: 'En modo ECB, bloques iguales dan cifrados iguales y el patrón se filtra; CBC lo oculta.',
    n: [['a', '__input', 0, 100, { text: 'BLOQUE-REPETIDO!BLOQUE-REPETIDO!BLOQUE-REPETIDO!' }], ['b', 'AES Encrypt', 330, 0, { Key: K16, IV: IV16, Mode: 'ECB', Input: 'Raw', Output: 'Hex' }],
      ['c', '__output', 680, 0, { label: 'ECB: bloques iguales' }], ['d', 'AES Encrypt', 330, 220, { Key: K16, IV: IV16, Mode: 'CBC', Input: 'Raw', Output: 'Hex' }], ['e', '__output', 680, 220, { label: 'CBC: bloques distintos' }]],
    e: [['a', 'b'], ['b', 'c'], ['a', 'd'], ['d', 'e']], open: 'b',
  },
  'XOR ida y vuelta': {
    d: 'XOR con la misma clave cifra y descifra: aplicarlo dos veces devuelve el original.',
    n: [['a', '__input', 0, 90, { text: 'Ataque al amanecer' }], ['b', 'XOR', 330, 90, { Key: UTF8('CLAVE') }], ['c', 'To Hex', 680, 0], ['d', '__output', 1030, 0, { label: 'Cifrado (hex)' }],
      ['e', 'XOR', 680, 200, { Key: UTF8('CLAVE') }], ['f', '__output', 1030, 200, { label: 'Recuperado' }]],
    e: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['b', 'e'], ['e', 'f']], open: 'b',
  },
  'One-time pad con dos flujos': {
    d: 'Una clave aleatoria tan larga como el mensaje, combinada con XOR: el único cifrado con secreto perfecto, si la clave nunca se reutiliza.',
    n: [['a', '__input', 0, 0, { text: 'Ataque al amanecer' }], ['r', 'Pseudo-Random Number Generator', 0, 220, { 'Number of bytes': 18, 'Output as': 'Raw' }], ['x', '__xor2', 330, 100],
      ['h', 'To Hex', 680, 0], ['o', '__output', 1030, 0, { label: 'Cifrado (hex)' }], ['y', '__xor2', 680, 220], ['p', '__output', 1030, 220, { label: 'Recuperado' }]],
    e: [['a', 'x', 0], ['r', 'x', 1], ['x', 'h'], ['h', 'o'], ['x', 'y', 0], ['r', 'y', 1], ['y', 'p']],
  },
  'ChaCha20: cifrado de flujo': {
    d: 'El cifrado de TLS 1.3 y WireGuard: clave de 32 bytes y nonce de 12 generan un flujo que se combina con el texto.',
    n: [['a', '__input', 0, 90, { text: 'Mensaje por un canal seguro' }],
      ['c', 'ChaCha', 350, 90, { Key: HEXK('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'), Nonce: HEXK('000000000000004a00000000'), Counter: 1, Rounds: '20', Input: 'Raw', Output: 'Hex' }],
      ['co', '__output', 700, 0, { label: 'Cifrado (hex)' }],
      ['d', 'ChaCha', 700, 220, { Key: HEXK('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'), Nonce: HEXK('000000000000004a00000000'), Counter: 1, Rounds: '20', Input: 'Hex', Output: 'Raw' }],
      ['do', '__output', 1050, 220, { label: 'Descifrado' }]],
    e: [['a', 'c'], ['c', 'co'], ['c', 'd'], ['d', 'do']], open: 'c',
  },
  'PBKDF2: de contraseña a clave': {
    d: 'Una contraseña no sirve como clave AES directamente: PBKDF2 la estira con sal e iteraciones. Cambia la sal y la clave cambia por completo.',
    n: [['k1', 'Derive PBKDF2 key', 0, 0, { Passphrase: UTF8('contraseña123'), 'Key size': 256, Iterations: 10000, 'Hashing function': 'SHA256', Salt: HEXK('a1b2c3d4e5f60718') }],
      ['o1', '__output', 350, 0, { label: 'Clave de 256 bits (sal A)' }],
      ['k2', 'Derive PBKDF2 key', 0, 220, { Passphrase: UTF8('contraseña123'), 'Key size': 256, Iterations: 10000, 'Hashing function': 'SHA256', Salt: HEXK('0000000000000001') }],
      ['o2', '__output', 350, 220, { label: 'Misma contraseña, sal B' }]],
    e: [['k1', 'o1'], ['k2', 'o2']], open: 'k1',
  },
}

const HASHING: Record<string, Example> = {
  'SHA-256 y HMAC': {
    d: 'Un hash resume cualquier entrada en 256 bits; HMAC añade una clave para que solo quien la tiene pueda generarlo.',
    n: [['a', '__input', 0, 90, { text: 'abc' }], ['b', 'SHA2', 330, 0, { Size: '256' }], ['c', '__output', 680, 0, { label: 'SHA-256' }],
      ['d', 'HMAC', 330, 200, { Key: UTF8('clave-secreta'), 'Hashing function': 'SHA256' }], ['e', '__output', 680, 200, { label: 'HMAC-SHA256' }]],
    e: [['a', 'b'], ['b', 'c'], ['a', 'd'], ['d', 'e']], open: 'b',
  },
  'Efecto avalancha': {
    d: 'Cambiar un solo carácter altera cerca de la mitad de los 256 bits del hash. La distancia de Hamming lo cuenta.',
    n: [['a', '__input', 0, 0, { text: 'transferir $100 a Juan' }], ['b', '__input', 0, 260, { text: 'transferir $900 a Juan' }],
      ['ha', 'SHA2', 350, 0, { Size: '256' }], ['hao', '__output', 700, -110, { label: 'SHA-256 de «$100»' }],
      ['hb', 'SHA2', 350, 260, { Size: '256' }], ['hbo', '__output', 700, 370, { label: 'SHA-256 de «$900»' }],
      ['j', '__concat', 700, 130, { sep: '\n\n' }], ['hd', 'Hamming Distance', 1050, 130, { Unit: 'Bit', 'Input type': 'Hex' }], ['hdo', '__output', 1400, 130, { label: 'Bits distintos (de 256)' }]],
    e: [['a', 'ha'], ['ha', 'hao'], ['b', 'hb'], ['hb', 'hbo'], ['ha', 'j', 0], ['hb', 'j', 1], ['j', 'hd'], ['hd', 'hdo']], open: 'hd',
  },
  'Familias de hash: MD5 a BLAKE2': {
    d: 'La misma entrada en cinco algoritmos. MD5 y SHA-1 tienen colisiones prácticas; SHA-2, SHA-3 y BLAKE2 siguen vigentes.',
    n: [['a', '__input', 0, 440, { text: 'abc' }],
      ['m', 'MD5', 350, 0], ['mo', '__output', 700, 0, { label: 'MD5 · 128 bits · roto' }],
      ['s1', 'SHA1', 350, 220], ['s1o', '__output', 700, 220, { label: 'SHA-1 · 160 bits · roto' }],
      ['s2', 'SHA2', 350, 440, { Size: '256' }], ['s2o', '__output', 700, 440, { label: 'SHA-256 · 256 bits' }],
      ['s3', 'SHA3', 350, 660, { Size: '256' }], ['s3o', '__output', 700, 660, { label: 'SHA3-256 · 256 bits' }],
      ['bl', 'BLAKE2b', 350, 880, { Size: '256' }], ['blo', '__output', 700, 880, { label: 'BLAKE2b-256 · 256 bits' }]],
    e: [['a', 'm'], ['m', 'mo'], ['a', 's1'], ['s1', 's1o'], ['a', 's2'], ['s2', 's2o'], ['a', 's3'], ['s3', 's3o'], ['a', 'bl'], ['bl', 'blo']], open: 's2',
  },
  'Contraseñas: bcrypt y su sal': {
    d: 'La misma contraseña da dos hashes distintos: bcrypt genera una sal aleatoria y la guarda dentro del hash. Así fallan las tablas precalculadas.',
    n: [['a', '__input', 0, 110, { text: 'contraseña123' }],
      ['b1', 'Bcrypt', 350, 0, { Rounds: 10 }], ['o1', '__output', 700, 0, { label: 'Hash 1 ($2b$ · coste 10 · sal · hash)' }],
      ['b2', 'Bcrypt', 350, 220, { Rounds: 10 }], ['o2', '__output', 700, 220, { label: 'Hash 2: distinto' }]],
    e: [['a', 'b1'], ['b1', 'o1'], ['a', 'b2'], ['b2', 'o2']], open: 'b1',
  },
  'Checksum no es seguridad: CRC-32': {
    d: 'CRC-32 detecta errores de transmisión, pero es lineal y cualquiera puede forjar un mensaje con el mismo valor. Para integridad frente a atacantes, un hash criptográfico.',
    n: [['a', '__input', 0, 110, { text: 'Pagar 100 USD a la cuenta 12345' }],
      ['c', 'CRC Checksum', 350, 0, { Algorithm: 'CRC-32' }], ['co', '__output', 700, 0, { label: 'CRC-32 · 32 bits' }],
      ['s', 'SHA2', 350, 220, { Size: '256' }], ['so', '__output', 700, 220, { label: 'SHA-256 · 256 bits' }]],
    e: [['a', 'c'], ['c', 'co'], ['a', 's'], ['s', 'so']], open: 'c',
  },
}

// Firmado con HS256 y la clave JWT_KEY. La firma se comprueba recalculando el HMAC: JWT Sign y JWT Verify
// fallan en este build de CyberChef (su librería espera el KeyObject de Node).
const JWT_KEY = 'clave-del-servidor'
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJqdWFuIiwicm9sIjoiZXN0dWRpYW50ZSIsImlhdCI6MTc2NzIyNTYwMH0.NvdFSusCXwNDIDoutJXcnAFtZC5Bw_Hg8BpeS1detSA'
const RX = (re: string) => ({ string: re, option: 'Regex' })
const WEB: Record<string, Example> = {
  'JWT: leer y verificar un token': {
    d: 'Un JWT va firmado, no cifrado: cualquiera lee su cabecera y su contenido. La firma es un HMAC de «cabecera.payload»: con la clave del servidor coincide; con otra, no.',
    n: [['a', '__input', 0, 440, { text: JWT }],
      ['h', 'Find / Replace', 350, 0, { Find: RX('^([^.]+)\\..*$'), Replace: '$1' }], ['hb', 'From Base64', 700, 0, { Alphabet: 'A-Za-z0-9-_' }], ['ho', '__output', 1050, 0, { label: 'Cabecera: algoritmo de firma' }],
      ['d', 'JWT Decode', 350, 220], ['do', '__output', 700, 220, { label: 'Payload legible sin clave' }],
      ['sg', 'Find / Replace', 350, 440, { Find: RX('^.*\\.([^.]+)$'), Replace: '$1' }], ['sgo', '__output', 700, 440, { label: 'Firma que trae el token' }],
      ['m', 'Find / Replace', 350, 660, { Find: RX('^([^.]+\\.[^.]+)\\..*$'), Replace: '$1' }],
      ['hm', 'HMAC', 700, 660, { Key: UTF8(JWT_KEY), 'Hashing function': 'SHA256' }], ['fh', 'From Hex', 1050, 660], ['b64', 'To Base64', 1400, 660, { Alphabet: 'A-Za-z0-9-_' }],
      ['mo', '__output', 1750, 660, { label: 'Recalculada con la clave del servidor: coincide' }],
      ['hx', 'HMAC', 700, 880, { Key: UTF8('otra-clave'), 'Hashing function': 'SHA256' }], ['fx', 'From Hex', 1050, 880], ['bx', 'To Base64', 1400, 880, { Alphabet: 'A-Za-z0-9-_' }],
      ['xo', '__output', 1750, 880, { label: 'Con otra clave: no coincide' }]],
    e: [['a', 'h'], ['h', 'hb'], ['hb', 'ho'], ['a', 'd'], ['d', 'do'], ['a', 'sg'], ['sg', 'sgo'], ['a', 'm'],
      ['m', 'hm'], ['hm', 'fh'], ['fh', 'b64'], ['b64', 'mo'], ['m', 'hx'], ['hx', 'fx'], ['fx', 'bx'], ['bx', 'xo']], open: 'hm',
  },
  'Codificar para la web: URL y HTML': {
    d: 'El mismo texto preparado para una URL y para insertarse en HTML. Escapar entidades es lo que impide que un <script> se ejecute (XSS).',
    n: [['a', '__input', 0, 220, { text: '<script>alert("¡hola & adiós!")</script>' }],
      ['u', 'URL Encode', 350, 0, { 'Encode all special chars': true }], ['uo', '__output', 700, 0, { label: 'Para una URL' }],
      ['h', 'To HTML Entity', 350, 220, { 'Convert to': 'Named entities' }], ['ho', '__output', 700, 220, { label: 'Seguro dentro de HTML' }],
      ['b', 'From HTML Entity', 700, 440], ['bu', 'Encode text', 1050, 440, { Encoding: 'UTF-8 (65001)' }], ['bo', '__output', 1400, 440, { label: 'De vuelta' }]],
    e: [['a', 'u'], ['u', 'uo'], ['a', 'h'], ['h', 'ho'], ['h', 'b'], ['b', 'bu'], ['bu', 'bo']], open: 'h',
  },
  'Defang: compartir URLs maliciosas': {
    d: 'Al reportar un incidente, los indicadores se «desactivan» (hxxp, [.]) para que nadie los abra por accidente al hacer clic.',
    n: [['a', '__input', 0, 90, { text: 'Detectado phishing en http://login-banco.example.com/verificar y https://paypa1.example.net/cuenta desde 203.0.113.45' }],
      ['e', 'Extract URLs', 350, 0, { Unique: true }], ['eo', '__output', 700, 0, { label: 'URLs encontradas' }],
      ['d', 'Defang URL', 350, 200, { Process: 'Everything' }], ['do', '__output', 700, 200, { label: 'Texto seguro para compartir' }]],
    e: [['a', 'e'], ['e', 'eo'], ['a', 'd'], ['d', 'do']], open: 'd',
  },
}

/** Ejemplos agrupados como aparecen en la galería. */
export const EXAMPLE_GROUPS: ExampleGroup[] = [
  { id: 'codificacion', title: 'Codificación', color: 'blue', desc: 'Representar datos de otra forma, sin clave ni secreto: Base64, hex, Unicode.', examples: ENCODING },
  { id: 'clasica', title: 'Criptografía clásica', color: 'orange', desc: 'Cifrados de lápiz y papel, y por qué se rompen.', examples: CLASSIC },
  { id: 'moderna', title: 'Criptografía moderna', color: 'purple', desc: 'Cifrado simétrico por bloques y de flujo, modos de operación y derivación de claves.', examples: MODERN },
  { id: 'hashing', title: 'Hashes e integridad', color: 'yellow', desc: 'Resúmenes de una vía, autenticación de mensajes y almacenamiento de contraseñas.', examples: HASHING },
  { id: 'web', title: 'Web y tokens', color: 'pink', desc: 'JWT, escapes contra XSS y manejo seguro de indicadores.', examples: WEB },
  { id: 'redes', title: 'Redes', color: 'cyan', desc: 'Protocolos capa por capa: HTTP, DNS, TCP, IP y TLS, con paquetes reales y consultas en vivo.', examples: NET_EXAMPLES },
]

export const EXAMPLES: Record<string, Example> = Object.assign({}, ...EXAMPLE_GROUPS.map(g => g.examples))
export const exampleGroup = (key: string) => EXAMPLE_GROUPS.find(g => key in g.examples)
/** Operaciones que salen a Internet: el ejemplo depende de la red. */
export const LIVE_OPS = new Set(['HTTP request', 'DNS over HTTPS'])
