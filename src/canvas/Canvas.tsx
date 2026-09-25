import { useCallback, useRef } from 'react'
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, type Connection, type IsValidConnection } from '@xyflow/react'
import { OpNode } from './OpNode'
import { DataEdge } from './DataEdge'
import { useStore } from '../state/store'
import { wouldCycle } from '../engine/graph'
import { catColor, opInfo } from '../engine/catalog'
import { cssColor } from '../components/ui'
import type { DataEdgeT, OpNodeT } from '../engine/types'

const nodeTypes = { op: OpNode }
const edgeTypes = { data: DataEdge }

export default function Canvas({ compact }: { compact: boolean }) {
  const nodes = useStore(s => s.nodes)
  const edges = useStore(s => s.edges)
  const onNodesChange = useStore(s => s.onNodesChange)
  const onEdgesChange = useStore(s => s.onEdgesChange)
  const connect = useStore(s => s.connect)
  const openDetail = useStore(s => s.openDetail)
  const reconnected = useRef(true)

  const isValid: IsValidConnection<DataEdgeT> = useCallback(
    c => !!c.source && !!c.target && !wouldCycle(useStore.getState().edges, c.source, c.target),
    [],
  )
  const onConnect = useCallback((c: Connection) => { connect(c) }, [connect])
  const onReconnect = useCallback((old: DataEdgeT, c: Connection) => {
    reconnected.current = true
    onEdgesChange([{ type: 'remove', id: old.id }])
    connect(c)
  }, [connect, onEdgesChange])

  return (
    <ReactFlow<OpNodeT, DataEdgeT>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      isValidConnection={isValid}
      onNodeDoubleClick={(_, n) => openDetail(n.id)}
      edgesReconnectable
      onReconnectStart={() => { reconnected.current = false }}
      onReconnect={onReconnect}
      onReconnectEnd={(_, e) => { if (!reconnected.current) onEdgesChange([{ type: 'remove', id: e.id }]); reconnected.current = true }}
      deleteKeyCode={['Backspace', 'Delete']}
      minZoom={0.2}
      maxZoom={2.5}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      proOptions={{ hideAttribution: false }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="rgb(var(--c-grid))" />
      <Controls showInteractive={false} position="bottom-right" />
      {!compact && (
        <MiniMap<OpNodeT> position="top-right" pannable zoomable nodeColor={n => cssColor(catColor(opInfo(n.data.op).cat))} nodeStrokeWidth={0} maskColor="rgb(var(--c-base) / 0.7)" />
      )}
    </ReactFlow>
  )
}
