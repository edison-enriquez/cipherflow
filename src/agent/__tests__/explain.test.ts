import { describe, expect, it } from 'vitest'
import { citationExists, explainNode, validateExplanation } from '../explain'
import { cfg, scripted } from './fixtures'

const ctx = {
  op: 'AES Decrypt', category: 'Cifrado', description: 'AES decrypt', params: { Mode: 'GCM', IV: { string: '000102', option: 'Hex' } },
  inputText: '76 c6 e8 20 87', outputText: '', error: 'Unable to decrypt input with these parameters.',
}

describe('citas verificables', () => {
  it('reconoce valores hex aunque cambien espacios y mayúsculas', () => {
    expect(citationExists('76C6E8', '76 c6 e8 20')).toBe(true)
    expect(citationExists('ffff', '76 c6 e8 20')).toBe(false)
  })

  it('descarta pocas citas inventadas y conserva las reales', () => {
    const v = validateExplanation({ explicacion: 'El IV 000102 y los bytes 76 c6…', citas: ['000102', '76 c6', 'deadbeef'] }, JSON.stringify(ctx))
    expect(v.ok && v.value).toEqual({ text: 'El IV 000102 y los bytes 76 c6…', citations: ['000102', '76 c6'], rejected: ['deadbeef'] })
  })

  it('si la mayoría son inventadas, pide rehacer la explicación', async () => {
    const m = scripted([
      { explicacion: 'La clave era 1234 y el tag abcd.', citas: ['1234', 'abcd'] },
      { explicacion: 'GCM rechazó el mensaje: el cifrado 76 c6 fue alterado.', citas: ['76 c6', 'GCM'] },
    ])
    const r = await explainNode(ctx, cfg, m.complete)
    expect(r?.citations).toEqual(['76 c6', 'GCM'])
    expect(m.seen[1].at(-1)!.content).toContain('NO aparecen en los datos del bloque')
  })
})
