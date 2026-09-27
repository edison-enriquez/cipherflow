// Proxy de lectura para el bloque «HTTP request» de CipherFlow.
// Corre como Cloudflare Worker en cipherflow.eehub.ing/proxy/* (mismo origen que la app, así que el
// navegador no aplica CORS) y pide del lado de Cloudflare páginas que no envían Access-Control-Allow-Origin.
//
//   GET https://cipherflow.eehub.ing/proxy/?url=https://www.uao.edu.co/
//
// Admite cualquier sitio público, con límites para que no sirva como proxy abierto útil:
// - Todo se devuelve como text/plain con CSP sandbox: el navegador muestra el código, nunca renderiza la
//   página ni ejecuta sus scripts (no sirve para phishing ni XSS bajo este dominio).
// - Solo GET/HEAD, solo http(s) en los puertos 80/443, sin IPs privadas ni nombres internos (también en
//   cada redirección), sin reenviar cookies ni credenciales y con un tope de tamaño.
// - Las cabeceras originales llegan con el prefijo x-upstream- (content-type, HSTS, CSP…).
// - Hacia el sitio siempre se pide con GET (hay firewalls que bloquean HEAD); un HEAD recibe solo las cabeceras.

// Orígenes que pueden leer el proxy desde otro dominio (desarrollo local); el propio sitio no lo necesita.
const ALLOWED_ORIGINS = [/^https:\/\/cipherflow\.eehub\.ing$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/]
const MAX_BYTES = 2 * 1024 * 1024
const MAX_REDIRECTS = 5
const PASS_HEADERS = ['content-type', 'content-language', 'last-modified', 'etag', 'server', 'x-powered-by', 'strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'location']

const PRIVATE_V4 = [/^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^(22[4-9]|2[3-5]\d)\./]

function blockedHost(host) {
  host = host.toLowerCase().replace(/\.$/, '')
  if (host === 'localhost' || /\.(localhost|local|internal|lan|home|corp|intranet)$/.test(host)) return true
  if (/^\d+(\.\d+){3}$/.test(host)) return PRIVATE_V4.some(re => re.test(host))
  if (/^\d+$/.test(host) || /^0x/i.test(host)) return true // IPv4 escrita como entero u hexadecimal
  if (host.startsWith('[')) {
    const v6 = host.slice(1, -1)
    return v6 === '::' || v6 === '::1' || /^(fc|fd|fe[89ab])/.test(v6) || v6.startsWith('::ffff:')
  }
  return !host.includes('.') // nombres sin dominio (intranet)
}

function checkTarget(raw) {
  let u
  try { u = new URL(raw) } catch { return 'URL no válida' }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'Solo se admiten URL http(s)'
  if (u.port && u.port !== '80' && u.port !== '443') return 'Solo se admiten los puertos 80 y 443'
  if (u.username || u.password) return 'La URL no puede llevar credenciales'
  if (blockedHost(u.hostname)) return `Destino no permitido (red privada o interna): ${u.hostname}`
  return null
}

function cors(request) {
  const origin = request.headers.get('Origin')
  if (!origin || !ALLOWED_ORIGINS.some(re => re.test(origin))) return {}
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Expose-Headers': '*', Vary: 'Origin' }
}

// Cabeceras que impiden que el navegador trate la respuesta como una página de este dominio.
function safeHeaders(request, charset = 'utf-8') {
  return {
    'Content-Type': `text/plain; charset=${charset}`,
    'Content-Security-Policy': "sandbox; default-src 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    ...cors(request),
  }
}

function fail(request, status, message) {
  return new Response(message + '\n', { status, headers: safeHeaders(request) })
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors(request), 'Access-Control-Allow-Methods': 'GET, HEAD', 'Access-Control-Max-Age': '86400' } })
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return fail(request, 405, 'Solo GET y HEAD')

    let target = new URL(request.url).searchParams.get('url')
    if (!target) return fail(request, 400, 'Falta el parámetro ?url=https://…')

    // Las redirecciones se siguen a mano para validar cada salto.
    let res
    for (let hop = 0; ; hop++) {
      const err = checkTarget(target)
      if (err) return fail(request, 403, err)
      try {
        res = await fetch(target, {
          method: 'GET',
          redirect: 'manual',
          headers: { 'User-Agent': 'CipherFlow-proxy (+https://cipherflow.eehub.ing)', Accept: request.headers.get('Accept') || '*/*' },
        })
      } catch (e) {
        return fail(request, 502, `No se pudo conectar con ${new URL(target).hostname}: ${e.message}`)
      }
      const loc = res.headers.get('Location')
      if (res.status < 300 || res.status >= 400 || !loc) break
      await res.body?.cancel()
      if (hop >= MAX_REDIRECTS) return fail(request, 508, 'Demasiadas redirecciones')
      target = new URL(loc, target).toString()
    }

    const len = Number(res.headers.get('Content-Length') || 0)
    if (len > MAX_BYTES) { await res.body?.cancel(); return fail(request, 413, `Respuesta demasiado grande (${len} bytes)`) }

    const charset = /charset=([\w-]+)/i.exec(res.headers.get('Content-Type') || '')?.[1] || 'utf-8'
    const headers = new Headers({ ...safeHeaders(request, charset), 'X-Proxy-Final-Url': target })
    for (const h of PASS_HEADERS) { const v = res.headers.get(h); if (v) headers.set('X-Upstream-' + h, v) }

    if (request.method === 'HEAD') { await res.body?.cancel(); return new Response(null, { status: res.status, statusText: res.statusText, headers }) }
    const body = await res.arrayBuffer()
    if (body.byteLength > MAX_BYTES) return fail(request, 413, `Respuesta demasiado grande (${body.byteLength} bytes)`)
    return new Response(body, { status: res.status, statusText: res.statusText, headers })
  },
}
