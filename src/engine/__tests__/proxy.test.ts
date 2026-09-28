import { describe, expect, it } from 'vitest'
import { PROXY_URL, cyberChefArgs } from '../cyberchef'

const CORS = 'Cross-Origin Resource Sharing'
const NO_CORS = 'No CORS (limited to HEAD, GET or POST)'

describe('HTTP request con el proxy de CipherFlow', () => {
  it('sin proxy (o con args guardados antes de la casilla) pasa los 5 argumentos de CyberChef', () => {
    expect(cyberChefArgs('HTTP request', ['GET', 'https://a.com/', '', CORS, true, false])).toEqual(['GET', 'https://a.com/', '', CORS, true])
    expect(cyberChefArgs('HTTP request', ['GET', 'https://a.com/', '', CORS, false])).toEqual(['GET', 'https://a.com/', '', CORS, false])
  })

  it('con proxy reescribe la URL codificada y fuerza el modo CORS', () => {
    expect(cyberChefArgs('HTTP request', ['GET', ' https://www.uao.edu.co/?a=1&b=2 ', '', NO_CORS, true, true]))
      .toEqual(['GET', PROXY_URL + encodeURIComponent('https://www.uao.edu.co/?a=1&b=2'), '', CORS, true])
  })

  it('no la envuelve dos veces si ya apunta al proxy', () => {
    const u = PROXY_URL + encodeURIComponent('https://a.com/')
    expect(cyberChefArgs('HTTP request', ['HEAD', u, '', CORS, false, true])[1]).toBe(u)
  })

  it('rechaza lo que el proxy no puede reenviar', () => {
    expect(() => cyberChefArgs('HTTP request', ['POST', 'https://a.com/', '', CORS, false, true])).toThrow(/GET y HEAD/)
    expect(() => cyberChefArgs('HTTP request', ['GET', 'https://a.com/', 'Authorization: x', CORS, false, true])).toThrow(/cabeceras/)
  })

  it('no toca otras operaciones', () => {
    const a = ['x', 1, true]
    expect(cyberChefArgs('To Base64', a)).toBe(a)
  })
})
