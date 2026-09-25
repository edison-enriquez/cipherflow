import type { ComponentType } from 'react'
import type { ExplainCtx } from './common'
import { FromBase64, FromHex, ToBase64, ToBinary, ToHex } from './encodings'
import { Rot13, VigenereDecode, VigenereEncode, Xor } from './classic'
import { Aes } from './aes'
import { Sha2 } from './sha256'

export type { ExplainCtx }

/** Explicaciones internas por nombre de operación de CyberChef. */
export const EXPLAINERS: Record<string, ComponentType<{ ctx: ExplainCtx }>> = {
  'To Base64': ToBase64,
  'From Base64': FromBase64,
  'To Hex': ToHex,
  'From Hex': FromHex,
  'To Binary': ToBinary,
  XOR: Xor,
  ROT13: Rot13,
  'Vigenère Encode': VigenereEncode,
  'Vigenère Decode': VigenereDecode,
  'AES Encrypt': ({ ctx }) => <Aes ctx={ctx} decrypt={false} />,
  'AES Decrypt': ({ ctx }) => <Aes ctx={ctx} decrypt />,
  SHA2: Sha2,
}
