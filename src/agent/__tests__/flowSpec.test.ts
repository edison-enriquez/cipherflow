import { describe, expect, it } from 'vitest'
import { layoutFlow, validateAIFlow } from '../flowSpec'
import { b64Flow, fakeCatalog } from './fixtures'

const errs = (o: object) => { const v = validateAIFlow(o, fakeCatalog); return v.ok ? [] : v.errors }

describe('validateAIFlow', () => {
  it('acepta un flujo correcto y normaliza enlaces a objetos', () => {
    const v = validateAIFlow(b64Flow(), fakeCatalog)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.value.links).toEqual([{ from: 'in', to: 'b64', port: 0 }, { from: 'b64', to: 'out', port: 0 }])
  })

  it('rechaza una operación inventada y sugiere las parecidas', () => {
    const f = b64Flow(); (f.blocks[1] as any).op = 'Base64 Encode'
    expect(errs(f)[0]).toMatch(/«Base64 Encode» no existe.*«To Base64»/)
  })

  it('una operación inventada no genera errores en cascada en sus cables', () => {
    const f = b64Flow(); (f.blocks[1] as any).op = 'Base64 Encode'
    expect(errs(f)).toHaveLength(1)
  })

  it('rechaza un parámetro inexistente y lista los válidos', () => {
    const f = b64Flow(); (f.blocks[1] as any).args = { Alfabeto: 'x' }
    expect(errs(f)[0]).toContain('«Alfabeto» no existe. Parámetros: «Alphabet»')
  })

  it('corrige mayúsculas en desplegables y rechaza valores fuera de la lista', () => {
    const ok = validateAIFlow({ ...b64Flow(), blocks: [...b64Flow().blocks.slice(0, 1), { key: 'b64', op: 'SHA2', args: { size: '256' } }, b64Flow().blocks[2]] }, fakeCatalog)
    expect(ok.ok && ok.value.blocks[1].args).toEqual({ Size: '256' })
    const bad = errs({ ...b64Flow(), blocks: [...b64Flow().blocks.slice(0, 1), { key: 'b64', op: 'SHA2', args: { Size: '128' } }, b64Flow().blocks[2]] })
    expect(bad[0]).toContain('no es válido')
  })

  it('exige el formato de los toggleString (clave/IV)', () => {
    const f = { title: 't', blocks: [{ key: 'in', op: '__input', params: { text: 'x' } }, { key: 'aes', op: 'AES Encrypt', args: { Key: '000102' } }], links: [['in', 'aes']] }
    expect(errs(f)[0]).toContain('{"string": "…", "option"')
    const g = { ...f, blocks: [f.blocks[0], { key: 'aes', op: 'AES Encrypt', args: { Key: { string: '00', option: 'hex' }, Mode: 'gcm' } }] }
    const v = validateAIFlow(g, fakeCatalog)
    expect(v.ok && v.value.blocks[1].args).toEqual({ Key: { string: '00', option: 'Hex' }, Mode: 'GCM' })
  })

  it('detecta puertos inválidos, entradas sin conectar, dobles cables y ciclos', () => {
    const f = {
      title: 't',
      blocks: [{ key: 'a', op: '__input', params: { text: '1' } }, { key: 'x', op: '__xor2' }, { key: 'b', op: 'To Base64' }, { key: 'c', op: 'To Base64' }],
      links: [['a', 'x', 0], ['a', 'x', 0], ['a', 'b', 3], ['b', 'c'], ['c', 'b']],
    }
    const e = errs(f).join('\n')
    expect(e).toContain('El puerto 0 de «x» tiene dos cables')
    expect(e).toContain('«b» solo tiene 1 entrada(s)')
    expect(e).toContain('«x» (__xor2) no tiene nada conectado en el puerto 1')
    expect(e).toContain('forman un ciclo')
  })

  it('rechaza conectar la salida de una Salida y comprobaciones sobre bloques inexistentes', () => {
    const f = b64Flow({ links: [['in', 'b64'], ['b64', 'out'], ['out', 'b64', 0]], checks: [{ block: 'nada', contains: 'x' }] })
    const e = errs(f).join('\n')
    expect(e).toContain('«out» es una Salida')
    expect(e).toContain('bloque inexistente')
  })
})

describe('layoutFlow', () => {
  it('coloca los bloques en columnas por profundidad', () => {
    const v = validateAIFlow(b64Flow(), fakeCatalog)
    if (!v.ok) throw new Error('flujo inválido')
    const { n, e } = layoutFlow(v.value)
    expect(n.map(x => [x[0], x[2]])).toEqual([['in', 0], ['b64', 340], ['out', 680]])
    expect(e).toEqual([['in', 'b64', 0], ['b64', 'out', 0]])
  })

  it('rechaza una Entrada vacía (el flujo quedaría sin datos)', () => {
    const f = b64Flow(); (f.blocks[0] as any).params.text = '  '
    const v = validateAIFlow(f, fakeCatalog)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.errors.join(' ')).toContain('no puede estar vacío')
  })
})
