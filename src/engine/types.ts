import type { Edge, Node } from '@xyflow/react'

export interface OpData extends Record<string, unknown> {
  op: string
  args?: any[]
  params?: Record<string, any>
}
export type OpNodeT = Node<OpData, 'op'>
export type DataEdgeT = Edge<Record<string, unknown>, 'data'>

export interface Result {
  ok: boolean
  serial: number
  err?: string
  dish?: any
  type?: string
  bytes?: Uint8Array
  ms?: number
  op?: any
}
