// Diagramas SVG de writeups/img/, generados con los datos reales de src/labs.data.ts
// y la paleta del tema oscuro de CipherFlow (src/index.css). Uso: node scripts/writeups-svg.mjs
import crypto from 'node:crypto'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const src = fs.readFileSync(ROOT + 'src/labs.data.ts', 'utf8')
const L = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1))
const OUT = ROOT + 'writeups/img/'
const C = { base: '#000000', surface: '#0f0f0f', elev: '#171717', border: '#2e2e2e', wire: '#3d3d3d', muted: '#7d7d7d', text: '#ffffff', green: '#7df7ba', red: '#ff5c5c', yellow: '#ffe066', purple: '#cc99ff', blue: '#4d9eff', orange: '#ffaa4d' }
const FONT = `font-family="'JetBrains Mono', Consolas, 'Courier New', monospace"`
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" ${FONT}>
<rect width="${w}" height="${h}" rx="10" fill="${C.base}"/>
<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${C.muted}"/></marker></defs>
${body}
</svg>\n`
const t = (x, y, s, { c = C.text, size = 13, w = 400, a = 'start', ls = 0 } = {}) => `<text x="${x}" y="${y}" fill="${c}" font-size="${size}" font-weight="${w}" text-anchor="${a}"${ls ? ` letter-spacing="${ls}"` : ''}>${esc(s)}</text>`
const box = (x, y, w, h, { f = C.surface, s = C.border, r = 6, sw = 1 } = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${f}" stroke="${s}" stroke-width="${sw}"/>`
const line = (x1, y1, x2, y2, { c = C.muted, arrow = true, dash = '' } = {}) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${c}" stroke-width="1.5" fill="none"${arrow ? ' marker-end="url(#a)"' : ''}${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
const path = (d, { c = C.muted, arrow = true } = {}) => `<path d="${d}" stroke="${c}" stroke-width="1.5" fill="none"${arrow ? ' marker-end="url(#a)"' : ''}/>`
const xorSym = (x, y, r = 11) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.elev}" stroke="${C.text}" stroke-width="1.5"/><path d="M${x - r} ${y}H${x + r}M${x} ${y - r}V${y + r}" stroke="${C.text}" stroke-width="1.5"/>`
const label = (x, y, s, c = C.muted) => t(x, y, s.toUpperCase(), { c, size: 11, w: 700, ls: 1.5 })
const hex = b => [...b].map(v => v.toString(16).padStart(2, '0'))
const h = x => Buffer.from(x, 'hex')
const write = (name, s) => { fs.writeFileSync(OUT + name, s); console.log('ok', name) }

// ── Lab 1: ECB frente a CBC con tres bloques blancos (ff…ff) del candado ──────────
{
  const W = 900, H = 470
  // Valores reales de la salida del bloque AES Encrypt en CipherFlow (clave 2b7e1516…, IV = clave).
  const ecb = '8a f2 86 01 42 f7 86 f4'
  const cbc = ['a9 0f 26 c7 f1 48 d9 15', 'ba e4 b9 c4 22 c7 b1 89', 'e9 ee a3 b4 67 38 92 26']
  const xs = [250, 460, 670], bw = 180
  let b = t(32, 40, 'Tres bloques de píxeles blancos iguales (ff ff … ff) cifrados con la misma clave', { c: C.muted, size: 12.5 })
  const row = (y, name, color, sub, cs, chain) => {
    let s = label(32, y + 20, name, color) + t(32, y + 40, sub, { c: C.muted, size: 11.5 })
    if (chain) s += box(40, y + 88, 110, 36, { f: C.elev }) + t(95, y + 111, 'IV', { a: 'middle', size: 13, w: 700 })
    xs.forEach((x, i) => {
      const cx = x + bw / 2
      s += box(x, y, bw, 36, { f: C.elev }) + t(cx, y + 23, `P${i} = ff ff ff … ff`, { a: 'middle', size: 12.5 })
      let yE = y + 72
      if (chain) {
        s += line(cx, y + 36, cx, y + 94) + xorSym(cx, y + 106)
        s += i === 0 ? path(`M150 ${y + 106}H${cx - 13}`) : path(`M${xs[i - 1] + bw} ${y + 218}H${x - 15}V${y + 106}H${cx - 13}`)
        yE = y + 140
        s += line(cx, y + 117, cx, yE)
      } else s += line(cx, y + 36, cx, yE)
      s += box(x + 40, yE, bw - 80, 34, { f: '#1a1226', s: C.purple }) + t(cx, yE + 22, 'E(K, ·)', { a: 'middle', size: 12.5, c: C.purple, w: 700 })
      s += line(cx, yE + 34, cx, yE + 60)
      s += box(x, yE + 60, bw, 36, { f: C.surface, s: color }) + t(cx, yE + 83, cs[i], { a: 'middle', size: 12, c: color })
    })
    return s
  }
  b += row(64, 'ECB', C.red, 'sin estado', [ecb + '…', ecb + '…', ecb + '…'], false)
  b += t(W - 32, 282, 'C0 = C1 = C2  →  el patrón sobrevive', { a: 'end', c: C.red, size: 12.5, w: 700 })
  b += `<line x1="32" y1="294" x2="${W - 32}" y2="294" stroke="${C.border}"/>`
  b += row(306, 'CBC', C.green, 'encadenado', cbc.map(s => s + '…'), true)
  b += t(W - 32, 572, 'C0 ≠ C1 ≠ C2  →  el patrón desaparece', { a: 'end', c: C.green, size: 12.5, w: 700 })
  write('lab1-ecb-vs-cbc.svg', svg(W, 596, b))
}

// ── Lab 2: crib dragging con las salidas reales del bloque XOR ─────────────────────
{
  const c1 = h(L.ttp.c1), c2 = h(L.ttp.c2)
  const x = c1.map((v, i) => v ^ c2[i])
  const steps = [
    ['Nos vemos a', 'm1', 'm2'],
    ['La clave del cofre ', 'm2', 'm1'],
    ['Nos vemos a las diez en el muelle ', 'm1', 'm2'],
    [L.ttp.m1, 'm1', 'm2'],
  ]
  const W = 1040, rowH = 74, top = 110
  let b = t(32, 38, 'c1 ⊕ c2 = m1 ⊕ m2  —  cada cuña conocida de un mensaje destapa el mismo tramo del otro', { size: 13, w: 700 })
  b += t(32, 62, 'Salida real del bloque XOR (clave UTF8 = la cuña, que se repite): lo legible es exactamente la longitud de la cuña.', { c: C.muted, size: 11.5 })
  b += label(32, top - 16, 'cuña (clave del XOR)') + label(470, top - 16, 'resultado: (m1 ⊕ m2) ⊕ cuña')
  steps.forEach(([k, from, to], i) => {
    const y = top + i * rowH
    const out = Buffer.from(x.map((v, j) => v ^ k.charCodeAt(j % k.length)))
    const n = Math.min(k.length, 64)
    const show = s => [...s].map(ch => (ch >= 32 && ch < 127 ? String.fromCharCode(ch) : '·')).join('')
    const good = show(out.subarray(0, n)), bad = show(out.subarray(n, Math.min(64, n + 14)))
    b += box(24, y, W - 48, rowH - 12, { f: C.surface })
    b += t(40, y + 24, `Paso ${i + 1}`, { c: C.muted, size: 11, w: 700 }) + t(110, y + 24, `cuña de ${from} → sale ${to}`, { c: C.muted, size: 11 })
    const kk = k.length > 44 ? k.slice(0, 40) + '…' : k
    b += t(40, y + 48, `"${kk}"`, { c: C.yellow, size: 12.5 })
    const gg = good.length > 64 ? good.slice(0, 62) + '…' : good
    b += `<text x="470" y="${y + 48}" font-size="12.5" fill="${C.green}" font-weight="700">${esc(gg)}<tspan fill="${C.red}" font-weight="400">${esc(i === 3 ? '' : bad)}</tspan></text>`
    if (i === 3) b += t(W - 40, y + 24, 'm1 completo → m2 completo (64 B)', { a: 'end', c: C.green, size: 11 })
  })
  const y = top + steps.length * rowH + 6
  b += t(32, y + 10, 'Verde: texto recuperado · Rojo: la cuña se repite sobre bytes que aún no conoces y sale basura.', { c: C.muted, size: 11.5 })
  write('lab2-crib-dragging.svg', svg(W, y + 34, b))
}

// ── Lab 3: los 6 bytes que separan A de B ─────────────────────────────────────────
{
  const A = h(L.md5.x1), B = h(L.md5.x2)
  const cw = 25, ch = 22, gx = [70, 560], top = 92
  const W = 1050, H = top + 8 * ch + 110
  let b = t(32, 38, 'Bloque A y bloque B: 128 bytes cada uno, distintos solo en 6 posiciones', { size: 13, w: 700 })
  b += t(32, 60, 'Posiciones 19, 45, 59, 83, 109 y 123 (resaltadas). Todo lo demás es idéntico.', { c: C.muted, size: 11.5 })
  ;[[A, 'A'], [B, 'B']].forEach(([buf, name], k) => {
    const x0 = gx[k]
    b += label(x0 - 38, top - 10, name, C.text)
    for (let r = 0; r < 8; r++) {
      b += t(x0 - 8, top + 16 + r * ch, (r * 16).toString(16).padStart(2, '0'), { a: 'end', c: C.muted, size: 10.5 })
      for (let c = 0; c < 16; c++) {
        const i = r * 16 + c, d = A[i] !== B[i]
        if (d) b += `<rect x="${x0 + c * cw + 1}" y="${top + r * ch + 2}" width="${cw - 2}" height="${ch - 3}" rx="3" fill="#3a1414" stroke="${C.red}"/>`
        b += t(x0 + c * cw + cw / 2, top + 17 + r * ch, hex([buf[i]])[0], { a: 'middle', size: 11.5, c: d ? C.red : '#bdbdbd', w: d ? 700 : 400 })
      }
    }
  })
  const md5 = crypto.createHash('md5').update(A).digest('hex')
  const sa = crypto.createHash('sha256').update(A).digest('hex'), sb = crypto.createHash('sha256').update(B).digest('hex')
  const y = top + 8 * ch + 30
  b += `<line x1="32" y1="${y - 10}" x2="${W - 32}" y2="${y - 10}" stroke="${C.border}"/>`
  b += label(32, y + 12, 'MD5') + t(130, y + 12, `A: ${md5}   B: ${md5}`, { size: 12, c: C.red }) + t(W - 32, y + 12, 'iguales', { a: 'end', c: C.red, size: 12, w: 700 })
  b += label(32, y + 40, 'SHA-256') + t(130, y + 40, `A: ${sa.slice(0, 24)}…   B: ${sb.slice(0, 24)}…`, { size: 12, c: C.green }) + t(W - 32, y + 40, 'distintos', { a: 'end', c: C.green, size: 12, w: 700 })
  write('lab3-diferencias.svg', svg(W, H, b))
}

// ── Lab 4: frecuencias del cifrado frente al español ──────────────────────────────
{
  const ct = L.sub.cipher.toLowerCase()
  const fr = {}
  for (const c of ct) if (/[a-z]/.test(c)) fr[c] = (fr[c] || 0) + 1
  const total = Object.values(fr).reduce((a, b) => a + b, 0)
  const sorted = Object.entries(fr).sort((a, b) => b[1] - a[1]).slice(0, 16)
  const map = Object.fromEntries([...L.sub.keyCipher.toLowerCase()].map((c, i) => [c, L.sub.keyPlain[i].toLowerCase()]))
  const W = 940, top = 90, bh = 210, bw = 42, gap = 12, x0 = 70
  const max = sorted[0][1] / total
  let b = t(32, 38, 'Frecuencia de cada letra en el texto cifrado (16 más comunes)', { size: 13, w: 700 })
  b += t(32, 60, `${total} letras. Debajo de cada barra: la letra cifrada y la letra española que resulta ser.`, { c: C.muted, size: 11.5 })
  for (let k = 0; k <= 3; k++) {
    const v = (k * 0.05), y = top + bh - (v / max) * bh
    if (v > max) continue
    b += `<line x1="${x0 - 6}" y1="${y}" x2="${W - 32}" y2="${y}" stroke="${C.border}"${k ? ' stroke-dasharray="3 4"' : ''}/>` + t(x0 - 12, y + 4, (v * 100).toFixed(0) + '%', { a: 'end', c: C.muted, size: 10.5 })
  }
  sorted.forEach(([c, n], i) => {
    const x = x0 + i * (bw + gap), p = n / total, hh = (p / max) * bh
    const top2 = i < 2
    b += `<rect x="${x}" y="${top + bh - hh}" width="${bw}" height="${hh}" rx="3" fill="${top2 ? C.green : C.purple}" fill-opacity="${top2 ? 0.9 : 0.55}"/>`
    b += t(x + bw / 2, top + bh - hh - 6, (p * 100).toFixed(1), { a: 'middle', size: 10, c: C.muted })
    b += t(x + bw / 2, top + bh + 22, c, { a: 'middle', size: 15, w: 700, c: C.yellow })
    b += t(x + bw / 2, top + bh + 38, '↓', { a: 'middle', size: 11, c: C.muted })
    b += t(x + bw / 2, top + bh + 56, map[c].toUpperCase(), { a: 'middle', size: 15, w: 700, c: C.green })
  })
  const y = top + bh + 90
  b += label(32, y, 'Orden típico del español') + t(260, y, 'E  A  O  S  N  R  I  L  D  T  C  U  M  P', { c: C.text, size: 12.5, w: 700 })
  b += t(32, y + 24, 'Las dos barras dominantes (q, t) son A y E: exactamente lo que predice el idioma. El resto se ordena parecido y se afina con palabras cortas.', { c: C.muted, size: 11.5 })
  write('lab4-frecuencias.svg', svg(W, y + 46, b))
}

// ── Lab 5: descifrado CBC del primer bloque y el volteo del IV ─────────────────────
{
  const iv = h(L.cbc.iv), mask = h(L.cbc.mask), pt = Buffer.from('admin=0;alumno=E')
  const d = iv.map((v, i) => v ^ pt[i])
  const iv2 = iv.map((v, i) => v ^ mask[i])
  const pt2 = d.map((v, i) => v ^ iv2[i])
  const W = 1030, cw = 44, x0 = 250, T = 6
  const cells = (y, name, sub, bytes, { asText = false, color = C.text, hl = C.yellow } = {}) => {
    let s = t(x0 - 20, y + 20, name, { a: 'end', size: 13, w: 700, c: color }) + t(x0 - 20, y + 36, sub, { a: 'end', size: 10.5, c: C.muted })
    for (let i = 0; i < 16; i++) {
      const on = i === T
      s += `<rect x="${x0 + i * cw + 2}" y="${y}" width="${cw - 4}" height="30" rx="4" fill="${on ? '#2a2410' : C.surface}" stroke="${on ? hl : C.border}"${on ? ' stroke-width="1.5"' : ''}/>`
      const v = asText ? String.fromCharCode(bytes[i]) : hex([bytes[i]])[0]
      s += t(x0 + i * cw + cw / 2, y + 20, v, { a: 'middle', size: 12.5, w: on ? 700 : 400, c: on ? hl : color })
    }
    return s
  }
  let b = t(32, 38, 'CBC, primer bloque:  P0 = D(K, C0) ⊕ IV', { size: 13, w: 700 })
  b += t(32, 60, 'Voltear un bit del IV voltea el mismo bit de P0. D(K, C0) no cambia: ni la clave ni C0 se tocan.', { c: C.muted, size: 11.5 })
  for (let i = 0; i < 16; i++) b += t(x0 + i * cw + cw / 2, 92, String(i), { a: 'middle', size: 10, c: i === T ? C.yellow : C.muted, w: i === T ? 700 : 400 })
  b += label(32, 92, 'posición')
  b += cells(104, 'D(K, C0)', 'lo fija el cifrado', d, { color: C.purple })
  b += xorSym(x0 + 16 * cw + 26, 155, 10)
  b += cells(176, 'IV original', 'del token', iv)
  b += `<line x1="${x0}" y1="222" x2="${x0 + 16 * cw}" y2="222" stroke="${C.muted}"/>`
  b += cells(232, 'P0', 'texto claro', pt, { asText: true, color: C.text })
  b += `<line x1="32" y1="294" x2="${W - 32}" y2="294" stroke="${C.border}"/>`
  b += t(32, 318, `El atacante XORea el IV con la máscara Δ = '0' ⊕ '1' = 0x01 en la posición ${T}:`, { c: C.muted, size: 11.5 })
  b += cells(336, 'D(K, C0)', 'igual que antes', d, { color: C.purple })
  b += xorSym(x0 + 16 * cw + 26, 371, 10)
  b += cells(376, "IV' = IV ⊕ Δ", `${hex([iv[T]])} → ${hex([iv2[T]])}`, iv2, { hl: C.red })
  b += `<line x1="${x0}" y1="422" x2="${x0 + 16 * cw}" y2="422" stroke="${C.muted}"/>`
  b += cells(432, "P0'", 'sin conocer K', pt2, { asText: true, hl: C.green })
  b += t(32, 500, `P0' = P0 ⊕ Δ  →  «admin=0» pasa a «admin=1»; los demás bytes quedan intactos.`, { c: C.green, size: 12.5, w: 700 })
  write('lab5-cbc-bitflip.svg', svg(W, 524, b))
}

// ── Esquemas de flujo con el aspecto de los bloques del lienzo ────────────────────
// n: { id, x, y, title, cat, lines[], type, size, ins?, hl?, lineColor? }  e: [from, to, puerto?, tipo?]
const CAT = { FLUJO: C.green, UTILIDADES: C.muted, 'CIFRADO Y CODIFICACIÓN': C.purple, HASHING: C.yellow, MULTIMEDIA: '#ff6eb4', 'FORMATO DE DATOS': C.blue }
const TYPE = { ArrayBuffer: C.yellow, string: C.blue, byteArray: C.yellow, html: C.purple }
const NW = 230, HEAD = 34, LH = 17, PORT_Y = 17
function flowSvg(name, W, H, nodes, edges, caption = '') {
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]))
  const nh = n => HEAD + 22 + n.lines.length * LH + 40
  let b = caption ? t(24, 30, caption, { c: C.muted, size: 12 }) : ''
  for (const [f, to, port = 0, ty] of edges) {
    const a = byId[f], z = byId[to]
    const x1 = a.x + NW, y1 = a.y + PORT_Y, x2 = z.x, y2 = z.y + PORT_Y + port * 22
    const mx = (x1 + x2) / 2
    b += `<path d="M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}" stroke="${C.wire}" stroke-width="2" fill="none"/>`
    if (ty) {
      const w = ty.length * 7.2 + 14, lx = mx - w / 2, ly = (y1 + y2) / 2
      b += `<rect x="${lx}" y="${ly - 10}" width="${w}" height="20" rx="3" fill="${C.surface}" stroke="${TYPE[ty] ?? C.muted}" stroke-opacity="0.5"/>` + t(lx + 7, ly + 4, ty, { size: 11, c: TYPE[ty] ?? C.muted })
    }
  }
  for (const n of nodes) {
    const h2 = nh(n), col = n.id.match(/^(in|a|b|iv|mask)$/) ? C.green : CAT[n.cat] ?? C.muted
    b += box(n.x, n.y, NW, h2, { f: C.surface, s: n.hl ?? C.border, sw: n.hl ? 1.5 : 1 })
    b += `<rect x="${n.x + 12}" y="${n.y + 13}" width="9" height="9" fill="${col}"/>` + t(n.x + 28, n.y + 22, n.title, { size: 13, w: 700 })
    b += `<line x1="${n.x}" y1="${n.y + HEAD}" x2="${n.x + NW}" y2="${n.y + HEAD}" stroke="${C.border}"/>`
    b += t(n.x + 12, n.y + HEAD + 17, n.cat, { size: 10, c: C.muted, ls: 1 })
    // {texto} dentro de una línea se resalta en amarillo
    n.lines.forEach((l, i) => { b += `<text x="${n.x + 12}" y="${n.y + HEAD + 38 + i * LH}" font-size="12" fill="${n.lineColor ?? '#e0e0e0'}">${esc(l).replace(/\{([^}]*)\}/g, `<tspan fill="${C.yellow}" font-weight="700">$1</tspan>`)}</text>` })
    const fy = n.y + h2 - 16
    if (n.type) b += `<rect x="${n.x + 12}" y="${fy - 13}" width="${n.type.length * 7.2 + 12}" height="19" rx="3" fill="none" stroke="${TYPE[n.type] ?? C.muted}" stroke-opacity="0.6"/>` + t(n.x + 18, fy + 1, n.type, { size: 11, c: TYPE[n.type] ?? C.muted }) + t(n.x + 30 + n.type.length * 7.2, fy + 1, n.size ?? '', { size: 11, c: C.text, w: 700 })
    for (let i = 0; i < (n.ins ?? 1); i++) {
      b += `<rect x="${n.x - 5}" y="${n.y + PORT_Y + i * 22 - 5}" width="10" height="10" fill="${C.green}"/>`
      if ((n.ins ?? 1) > 1) b += t(n.x - 10, n.y + PORT_Y + i * 22 + 4, String(i + 1), { size: 9, c: C.muted, a: 'end' })
    }
    if (!n.sink) b += `<rect x="${n.x + NW - 5}" y="${n.y + PORT_Y - 5}" width="10" height="10" fill="${C.green}"/>`
  }
  write(name, svg(W, H, b))
}

// Lab 1: cabecera intacta + píxeles cifrados
{
  const bmp = Buffer.from(L.ecb.bmpB64, 'base64')
  flowSvg('lab1-esquema.svg', 1540, 360, [
    { id: 'in', x: 24, y: 110, title: 'Entrada', cat: 'ARCHIVO: CANDADO.BMP', lines: ['42 4d 36 6c 00 00 …', 'BMP 96×96, 24 bits'], type: 'ArrayBuffer', size: '27.1 KB', ins: 0 },
    { id: 'head', x: 344, y: 24, title: 'Take bytes', cat: 'UTILIDADES', lines: ['Start 0 · Length 54', '→ cabecera BMP'], type: 'ArrayBuffer', size: '54 B' },
    { id: 'pix', x: 344, y: 190, title: 'Drop bytes', cat: 'UTILIDADES', lines: ['Start 0 · Length 54', '→ píxeles (ff ff ff …)'], type: 'ArrayBuffer', size: `${((bmp.length - 54) / 1024).toFixed(1)} KB` },
    { id: 'aes', x: 664, y: 190, title: 'AES Encrypt', cat: 'CIFRADO Y CODIFICACIÓN', lines: ['Mode ECB/NoPadding', '8a f2 86 01 42 f7 …'], type: 'string', size: '27.0 KB', hl: C.red },
    { id: 'join', x: 984, y: 110, title: 'Unir flujos', cat: 'FLUJO', lines: ['1: cabecera', '2: píxeles cifrados'], type: 'ArrayBuffer', size: '27.1 KB', ins: 2 },
    { id: 'img', x: 1286, y: 110, title: 'Render Image', cat: 'MULTIMEDIA', lines: ['Input format: Raw', '→ la imagen cifrada'], type: 'byteArray', size: '27.1 KB', sink: true },
  ], [['in', 'head', 0, 'ArrayBuffer'], ['in', 'pix', 0, 'ArrayBuffer'], ['pix', 'aes', 0, 'ArrayBuffer'], ['head', 'join', 0], ['aes', 'join', 1, 'string'], ['join', 'img', 0]])
}

// Lab 3: MD5 y SHA-256 de cada bloque
{
  const A = h(L.md5.x1), B = h(L.md5.x2)
  const pair = (alg, title, file, same) => {
    const d = b => crypto.createHash(alg).update(b).digest('hex')
    const lines = b => alg === 'md5' ? [d(b).slice(0, 16), d(b).slice(16)] : [d(b).slice(0, 16), d(b).slice(16, 32) + '…']
    const col = same ? C.red : C.green
    const name = alg === 'md5' ? 'MD5' : 'SHA-256'
    flowSvg(file, 924, 356, [
      { id: 'a', x: 24, y: 24, title: 'Entrada A', cat: 'COMO HEX', lines: [hex(A.subarray(0, 8)).join(' '), '… 128 bytes'], type: 'ArrayBuffer', size: '128 B', ins: 0 },
      { id: 'b', x: 24, y: 190, title: 'Entrada B', cat: 'COMO HEX', lines: [hex(B.subarray(0, 8)).join(' '), '… 128 bytes'], type: 'ArrayBuffer', size: '128 B', ins: 0 },
      { id: 'ha', x: 347, y: 24, title, cat: 'HASHING', lines: [alg === 'md5' ? 'sin parámetros' : 'Size 256', ''], type: 'string', size: alg === 'md5' ? '32 B' : '64 B' },
      { id: 'hb', x: 347, y: 190, title, cat: 'HASHING', lines: [alg === 'md5' ? 'sin parámetros' : 'Size 256', ''], type: 'string', size: alg === 'md5' ? '32 B' : '64 B' },
      { id: 'oa', x: 670, y: 24, title: name + ' de A', cat: 'FLUJO', lines: lines(A), type: 'string', size: alg === 'md5' ? '32 B' : '64 B', sink: true, hl: col, lineColor: col },
      { id: 'ob', x: 670, y: 190, title: name + ' de B', cat: 'FLUJO', lines: lines(B), type: 'string', size: alg === 'md5' ? '32 B' : '64 B', sink: true, hl: col, lineColor: col },
    ], [['a', 'ha', 0, 'ArrayBuffer'], ['b', 'hb', 0, 'ArrayBuffer'], ['ha', 'oa', 0, 'string'], ['hb', 'ob', 0, 'string']])
  }
  pair('md5', 'MD5', 'lab3-md5.svg', true)
  pair('sha256', 'SHA2', 'lab3-sha.svg', false)
}

// Lab 5: IV ⊕ máscara → To Hex → IV modificado
{
  const iv = h(L.cbc.iv), mask = h(L.cbc.mask), iv2 = iv.map((v, i) => v ^ mask[i])
  const rows = b => { const x = hex(b); x[6] = `{${x[6]}}`; return [x.slice(0, 8).join(' '), x.slice(8).join(' ')] }
  const s = hex(iv2).join('')
  flowSvg('lab5-esquema.svg', 1260, 360, [
    { id: 'iv', x: 24, y: 24, title: 'Entrada', cat: 'COMO HEX · IV DEL TOKEN', lines: rows(iv), type: 'ArrayBuffer', size: '16 B', ins: 0 },
    { id: 'mask', x: 24, y: 196, title: 'Entrada', cat: 'COMO HEX · MÁSCARA Δ', lines: rows(mask), type: 'ArrayBuffer', size: '16 B', ins: 0 },
    { id: 'xor', x: 354, y: 110, title: 'XOR de dos flujos', cat: 'FLUJO', lines: rows(iv2), type: 'ArrayBuffer', size: '16 B', ins: 2 },
    { id: 'hex', x: 684, y: 110, title: 'To Hex', cat: 'FORMATO DE DATOS', lines: ['Delimiter: None', ''], type: 'string', size: '32 B' },
    { id: 'out', x: 1006, y: 110, title: 'IV modificado', cat: 'FLUJO', lines: [s.slice(0, 12) + '{' + s.slice(12, 14) + '}' + s.slice(14, 16), s.slice(16)], type: 'string', size: '32 B', sink: true, hl: C.green, lineColor: C.green },
  ], [['iv', 'xor', 0, 'ArrayBuffer'], ['mask', 'xor', 1, 'ArrayBuffer'], ['xor', 'hex', 0, 'ArrayBuffer'], ['hex', 'out', 0, 'string']])
}
