// Ejemplos de la sección «Redes». Los paquetes son sintéticos pero válidos (checksums correctos),
// salvo el ClientHello, que es uno real capturado de Node.js hacia cipherflow.eehub.ing.
// Los datos binarios van como texto hexadecimal y cada operación los lee con su opción «Hex».
import type { Example } from './io'

// Trama Ethernet → IPv4 (192.168.1.10 → 1.1.1.1) → UDP 53000 → 53 → consulta DNS A de cipherflow.eehub.ing
const DNS_FRAME = '00005e0053010200000000010800450000423c21400040113ad6c0a8010a01010101cf080035002e1f111a2b010000010000000000000a636970686572666c6f7705656568756203696e670000010001'
// Segmentos TCP del handshake 192.168.1.10:51514 ↔ 203.0.113.10:443
const SYN = 'c93a01bb2f3a1c00000000008002faf060320000020405b40103030801010402'
const SYNACK = '01bbc93a1b40e2102f3a1c018012faf062d00000020405b40103030801010402'
const ACK = 'c93a01bb2f3a1c011b40e2115010faf0a3a30000'
// Registro TLS con un ClientHello (SNI cipherflow.eehub.ing, ALPN h2 y http/1.1)
const CLIENTHELLO = '160301017a0100017603038dff388f74df2a116870fed6c70949f03634c4ae8442dea7fbaf3bbc8cfa66d5201690c2ac3337f6413665146b54a7ecb05ca8484d9a415ae07e8fdeb024c1ffa50068130213031301c02fc02bc030c02c009ec0270067c028006b00a3009fcca9cca8ccaac0adc09fc05dc061c057c05300a2c0acc09ec05cc060c056c052c024006ac0230040c00ac01400390038c009c01300330032009dc09dc051009cc09cc050003d003c0035002f010000c5ff01000100000000190017000014636970686572666c6f772e65656875622e696e67000b000403000102000a00060004001d0017002300000010000e000c02683208687474702f312e310016000000170000000d0036003409050906090404030503060308070808081a081b081c0809080a080b080408050806040105010601030303010302040205020602002b00050403040303002d00020101003300260024001d0020ed6632868c06787eaa53f7990e6daf39b731d45807947bfb5482d2cb93531e29'

const HTTP_REQ = [
  'GET /buscar?q=cifrado%20AES&pagina=2 HTTP/1.1',
  'Host: cipherflow.eehub.ing',
  'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Authorization: Basic anVhbjpzZWNyZXRvMTIz',
  'Accept: text/html',
  'Cookie: sesion=4f9a2c7e',
  '',
  '',
].join('\n')

const RX = (re: string) => ({ string: re, option: 'Regex' })
const HEX = 'Texto (UTF-8)'

export const NET_EXAMPLES: Record<string, Example> = {
  'HTTP: anatomía de una petición': {
    n: [['a', '__input', 0, 220, { text: HTTP_REQ }],
      ['u', 'Find / Replace', 350, 0, { Find: RX('^\\S+ (\\S+) HTTP\\/[\\d.]+\\n[\\s\\S]*?Host: (\\S+)[\\s\\S]*$'), Replace: 'https://$2$1' }],
      ['uri', 'Parse URI', 700, 0], ['uo', '__output', 1050, 0, { label: 'URL y parámetros' }],
      ['g', 'Find / Replace', 350, 220, { Find: RX('^[\\s\\S]*User-Agent: ([^\\n]+)[\\s\\S]*$'), Replace: '$1' }],
      ['ua', 'Parse User Agent', 700, 220], ['uao', '__output', 1050, 220, { label: 'Navegador y sistema' }],
      ['c', 'Find / Replace', 350, 440, { Find: RX('^[\\s\\S]*Authorization: Basic ([^\\n]+)[\\s\\S]*$'), Replace: '$1' }],
      ['b64', 'From Base64', 700, 440], ['co', '__output', 1050, 440, { label: 'Credenciales: Basic no cifra' }]],
    e: [['a', 'u'], ['u', 'uri'], ['uri', 'uo'], ['a', 'g'], ['g', 'ua'], ['ua', 'uao'], ['a', 'c'], ['c', 'b64'], ['b64', 'co']], open: 'b64',
  },
  'HTTP: petición en vivo': {
    n: [['req', 'HTTP request', 0, 90, { Method: 'GET', URL: location.origin + import.meta.env.BASE_URL + 'favicon.svg', 'Show response metadata': true }],
      ['o', '__output', 350, 90, { label: 'Estado, cabeceras y cuerpo' }]],
    e: [['req', 'o']], open: 'req',
  },
  'DNS: consulta en vivo (DoH)': {
    n: [['d1', '__input', 0, 0, { text: 'cipherflow.eehub.ing' }],
      ['a', 'DNS over HTTPS', 350, 0, { Resolver: 'https://dns.google.com/resolve', 'Request Type': 'A', 'Answer Data Only': true }],
      ['ao', '__output', 700, 0, { label: 'A: direcciones IPv4' }],
      ['d2', '__input', 0, 330, { text: 'gmail.com' }],
      ['mx', 'DNS over HTTPS', 350, 220, { Resolver: 'https://cloudflare-dns.com/dns-query', 'Request Type': 'MX', 'Answer Data Only': true }],
      ['mxo', '__output', 700, 220, { label: 'MX: servidores de correo' }],
      ['txt', 'DNS over HTTPS', 350, 440, { Resolver: 'https://dns.google.com/resolve', 'Request Type': 'TXT', 'Answer Data Only': true }],
      ['txto', '__output', 700, 440, { label: 'TXT: SPF y verificaciones' }]],
    e: [['d1', 'a'], ['a', 'ao'], ['d2', 'mx'], ['mx', 'mxo'], ['d2', 'txt'], ['txt', 'txto']], open: 'a',
  },
  'DNS: paquete capa por capa': {
    n: [['in', '__input', 0, 240, { text: DNS_FRAME, fmt: HEX }],
      ['eth', 'Parse Ethernet frame', 350, 0, { 'Input type': 'Hex', 'Return type': 'Text output' }], ['etho', '__output', 700, 0, { label: 'Capa 2 · Ethernet' }],
      ['ethd', 'Parse Ethernet frame', 350, 240, { 'Input type': 'Hex', 'Return type': 'Packet data (hex)' }],
      ['ip', 'Parse IPv4 header', 700, 240, { 'Input format': 'Hex', 'Output format': 'Table' }], ['ipo', '__output', 1050, 240, { label: 'Capa 3 · IPv4' }],
      ['ipd', 'Parse IPv4 header', 700, 480, { 'Input format': 'Hex', 'Output format': 'Data (hex)' }],
      ['udp', 'Parse UDP', 1050, 480, { 'Input format': 'Hex' }], ['udpo', '__output', 1400, 480, { label: 'Capa 4 · UDP' }],
      ['fh', 'From Hex', 1050, 720], ['su', 'Strip UDP header', 1400, 720], ['hd', 'To Hexdump', 1750, 720], ['dnso', '__output', 2100, 720, { label: 'Capa 7 · DNS (consulta)' }]],
    e: [['in', 'eth'], ['eth', 'etho'], ['in', 'ethd'], ['ethd', 'ip'], ['ip', 'ipo'], ['ethd', 'ipd'], ['ipd', 'udp'], ['udp', 'udpo'], ['ipd', 'fh'], ['fh', 'su'], ['su', 'hd'], ['hd', 'dnso']], open: 'ip',
  },
  'TCP: three-way handshake': {
    n: [['s1', '__input', 0, 0, { text: SYN, fmt: HEX }], ['p1', 'Parse TCP', 350, 0, { 'Input format': 'Hex' }], ['o1', '__output', 700, 0, { label: '1 · SYN (cliente → servidor)' }],
      ['s2', '__input', 0, 240, { text: SYNACK, fmt: HEX }], ['p2', 'Parse TCP', 350, 240, { 'Input format': 'Hex' }], ['o2', '__output', 700, 240, { label: '2 · SYN-ACK (servidor → cliente)' }],
      ['s3', '__input', 0, 480, { text: ACK, fmt: HEX }], ['p3', 'Parse TCP', 350, 480, { 'Input format': 'Hex' }], ['o3', '__output', 700, 480, { label: '3 · ACK (cliente → servidor)' }]],
    e: [['s1', 'p1'], ['p1', 'o1'], ['s2', 'p2'], ['p2', 'o2'], ['s3', 'p3'], ['p3', 'o3']], open: 'p1',
  },
  'IP: subredes y formatos': {
    n: [['c', '__input', 0, 0, { text: '192.168.10.77/26' }], ['r', 'Parse IP range', 350, 0, { 'Include network info': true, 'Enumerate IP addresses': false }], ['ro', '__output', 700, 0, { label: 'Red, máscara y rango' }],
      ['l', '__input', 0, 240, { text: '10.0.0.5\n192.168.10.77\n10.0.3.7\n192.168.10.200\n172.16.4.1\n10.0.0.99' }], ['g', 'Group IP addresses', 350, 240, { 'Subnet (CIDR)': 24 }], ['go', '__output', 700, 240, { label: 'Agrupadas por /24' }],
      ['i', '__input', 0, 520, { text: '192.168.10.77' }], ['h', 'Change IP format', 350, 460, { 'Input format': 'Dotted Decimal', 'Output format': 'Hex' }], ['ho', '__output', 700, 460, { label: 'Hexadecimal' }],
      ['d', 'Change IP format', 350, 660, { 'Input format': 'Dotted Decimal', 'Output format': 'Decimal' }], ['do', '__output', 700, 660, { label: 'Entero de 32 bits' }]],
    e: [['c', 'r'], ['r', 'ro'], ['l', 'g'], ['g', 'go'], ['i', 'h'], ['h', 'ho'], ['i', 'd'], ['d', 'do']], open: 'r',
  },
  'TLS: ClientHello y huella JA3': {
    n: [['in', '__input', 0, 220, { text: CLIENTHELLO, fmt: HEX }],
      ['fh', 'From Hex', 350, 0], ['tls', 'Parse TLS record', 700, 0], ['tlso', '__output', 1050, 0, { label: 'ClientHello desglosado (SNI, cifrados…)' }],
      ['js', 'JA3 Fingerprint', 350, 240, { 'Input format': 'Hex', 'Output format': 'JA3 string' }], ['jso', '__output', 700, 240, { label: 'Cadena JA3' }],
      ['jh', 'JA3 Fingerprint', 350, 460, { 'Input format': 'Hex', 'Output format': 'Hash digest' }], ['jho', '__output', 700, 460, { label: 'Huella JA3 (MD5)' }]],
    e: [['in', 'fh'], ['fh', 'tls'], ['tls', 'tlso'], ['in', 'js'], ['js', 'jso'], ['in', 'jh'], ['jh', 'jho']], open: 'tls',
  },
}
