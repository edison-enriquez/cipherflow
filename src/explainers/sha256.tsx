import { useMemo, useState } from 'react'
import { sha256Trace } from '../lib/sha256'
import { hx, w32 } from '../lib/bytes'
import { H, More, Note, P, Table, Verify, type ExplainCtx } from './common'

export function Sha2({ ctx }: { ctx: ExplainCtx }) {
  const size = ctx.arg('Size')
  const rounds = Math.max(1, Math.min(64, +ctx.args[1] || 64))
  const R = useMemo(() => sha256Trace(ctx.inBytes, rounds), [ctx.inBytes, rounds])
  const [bi, setBi] = useState(0)
  if (size !== '256') return <P>La explicación detallada está disponible para SHA-256. Cambia «Size» a 256 para verla.</P>
  const B = R.blocks[Math.min(bi, R.blocks.length - 1)]
  return (
    <>
      <Verify ok={ctx.outStr.trim().toLowerCase() === R.hex} />
      <P>SHA-256 procesa el mensaje en bloques de 512 bits (64 bytes). Primero rellena el mensaje, luego cada bloque pasa por una función de compresión de {rounds} rondas que actualiza ocho registros de 32 bits (a–h). El hash final son esos ocho registros concatenados.</P>
      <H>1. Relleno</H>
      <P>El mensaje mide {R.L} bytes ({R.L * 8} bits). Se agrega <span className="pad-a">un bit 1 (byte 80)</span>, <span className="pad-z">ceros</span> hasta que falten 64 bits para completar un múltiplo de 512, y <span className="pad-l">la longitud original en 64 bits</span>. Resultado: {R.total} bytes, {R.total / 64} bloque(s).</P>
      <pre className="panel-pre max-w-[760px] whitespace-pre-wrap">
        {Array.from(R.padded.subarray(0, 256), (x, i) => (
          <span key={i} className={i < R.L ? '' : i === R.L ? 'pad-a' : i >= R.total - 8 ? 'pad-l' : 'pad-z'}>{hx(x)}{i % 16 === 15 ? '\n' : ' '}</span>
        ))}
      </pre>
      <More shown={Math.min(R.total, 256)} total={R.total} unit="bytes" />
      <H>2. Compresión del bloque {bi + 1} de {R.blocks.length}</H>
      {R.blocks.length > 1 && (
        <div className="my-2 flex flex-wrap gap-1">
          {R.blocks.slice(0, 20).map((_, i) => <button key={i} className={`btn px-2 py-0.5 text-[10px] ${i === bi ? 'btn-on' : ''}`} onClick={() => setBi(i)}>Bloque {i + 1}</button>)}
        </div>
      )}
      <P>Las primeras 16 palabras W0–W15 son el bloque tal cual; las siguientes se derivan de las anteriores con rotaciones y XOR. En cada ronda t se calcula T1 = h + Σ1(e) + Ch(e,f,g) + Kt + Wt y T2 = Σ0(a) + Maj(a,b,c); los registros se desplazan una posición y entran T1 + T2 en «a» y d + T1 en «e».</P>
      <details className="my-2 text-xs">
        <summary className="cursor-pointer">Registros iniciales (H) antes del bloque</summary>
        <p className="mt-1.5 text-[12px]">{B.Hin.map((x, i) => `${'abcdefgh'[i]} = ${w32(x)}`).join('   ')}</p>
      </details>
      <Table heads={['t', 'Wt', 'Kt', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']} rows={B.rows.map(x => [x.t, w32(x.W), w32(x.K), ...x.v.map((v, k) => (k === 0 || k === 4 ? <b className="text-green">{w32(v)}</b> : w32(v)))])} />
      <Note>Resaltados, los registros a y e: los únicos que reciben un valor nuevo en cada ronda; los demás solo se desplazan.</Note>
      <H>3. Resultado</H>
      <P>Al terminar las rondas, cada registro se suma (módulo 2³²) al valor que tenía antes del bloque. Tras el último bloque, los ocho valores concatenados forman el hash:</P>
      <p className="break-all text-[13px] font-bold text-green">{R.hex}</p>
    </>
  )
}
