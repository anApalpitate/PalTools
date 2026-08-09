import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  Panel,
  Position,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react'
import type { Edge, Node, NodeProps } from '@xyflow/react'
import type { DerivedPlanGraph, GraphNodeInput, WorkspaceNodeMode } from '../../domain/breeding-workspace'
import type { PalRecord } from '../../domain/types'
import { layoutGraph, recipeIndexesForTarget } from './layout'
import type { LayoutResult } from './layout'

interface GraphNodeData extends Record<string, unknown> {
  label: string
  kind: GraphNodeInput['kind']
  recipeIndex?: number
  onRemove?: (recipeIndex: number) => void
}

export function BreedingGraph({
  graph,
  nodeMode,
  palsById,
  onRemove,
}: {
  graph: DerivedPlanGraph
  nodeMode: WorkspaceNodeMode
  palsById: ReadonlyMap<string, PalRecord>
  onRemove: (recipeIndex: number) => void
}) {
  const requestRef = useRef(0)
  const [layout, setLayout] = useState<LayoutResult | null>(null)
  const [error, setError] = useState('')
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const [expanded, setExpanded] = useState(graph.validRelations.length <= 100)
  const [targetId, setTargetId] = useState(graph.components[0]?.targetIds[0] ?? '')
  const visibleRecipeIndexes = useMemo(() => {
    if (expanded || !targetId) return new Set(graph.validRelations.map((recipe) => recipe.recipeIndex))
    return recipeIndexesForTarget(graph.validRelations, targetId)
  }, [expanded, graph.validRelations, targetId])
  const input = useMemo(() => {
    const visibleNodes = graph.nodes.filter((node) =>
      node.recipeIndex === undefined || visibleRecipeIndexes.has(node.recipeIndex),
    )
    const nodeIds = new Set(visibleNodes.map((node) => node.id))
    return {
      nodes: visibleNodes.filter((node) =>
        node.kind !== 'pal' && node.kind !== 'junction' || graph.edges.some((edge) =>
          nodeIds.has(edge.source) && nodeIds.has(edge.target) && (edge.source === node.id || edge.target === node.id),
        ),
      ),
      edges: graph.edges.filter((edge) =>
        nodeIds.has(edge.source) && nodeIds.has(edge.target) &&
        (edge.recipeIndex === undefined || visibleRecipeIndexes.has(edge.recipeIndex)),
      ),
    }
  }, [graph.edges, graph.nodes, visibleRecipeIndexes])

  useEffect(() => {
    const requestId = ++requestRef.current
    let cancelled = false
    void layoutGraph({ requestId, nodes: input.nodes, edges: input.edges, nodeMode, viewport })
      .then((result) => {
        if (!cancelled && result.requestId === requestRef.current) {
          setLayout(result)
          setError('')
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled && requestId === requestRef.current) {
          setError(reason instanceof Error ? reason.message : '图形布局失败。')
        }
      })
    return () => { cancelled = true }
  }, [input, nodeMode, viewport])

  const nodes = useMemo<Node<GraphNodeData>[]>(() => (layout?.nodes ?? []).map((node) => ({
    id: node.id,
    type: 'workspaceNode',
    position: { x: node.x, y: node.y },
    draggable: false,
    connectable: false,
    selectable: false,
    data: {
      label: node.palId
        ? `${palsById.get(node.palId)?.name.zhHans ?? node.palId}${node.kind === 'occurrence' ? node.label.slice(node.palId.length) : ''}`
        : node.label,
      kind: node.kind,
      recipeIndex: node.recipeIndex,
      onRemove,
    },
    style: { width: node.width, height: node.height },
  })), [layout, onRemove, palsById])
  const edges = useMemo<Edge[]>(() => (layout?.edges ?? []).map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    animated: false,
    label: edge.role === 'parentA' ? 'A' : edge.role === 'parentB' ? 'B' : undefined,
  })), [layout])
  const targets = graph.components.flatMap((component) => component.targetIds)

  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return (
    <section className="solution-graph" aria-label="配种图形网">
      <div className="graph-toolbar">
        <label>
          <span>聚焦目标</span>
          <select value={targetId} onChange={(event) => { setTargetId(event.target.value); setExpanded(false) }}>
            {targets.map((id) => <option key={id} value={id}>{palsById.get(id)?.name.zhHans ?? id}</option>)}
          </select>
        </label>
        {graph.validRelations.length > 100 && (
          <button onClick={() => setExpanded((value) => !value)}>
            {expanded ? '恢复目标聚焦' : '展开全部分支'}
          </button>
        )}
      </div>
      {error && <p role="alert" className="workspace-error">{error}</p>}
      <div className="graph-canvas" tabIndex={0} aria-label={`图形网，共 ${graph.validRelations.length} 条有效关系`}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={{ workspaceNode: WorkspaceGraphNode }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          fitView
          minZoom={0.15}
          maxZoom={1.8}
        >
          <Background gap={24} size={1} />
          <Controls showInteractive={false} />
          <Panel position="top-right">
            <FitButton />
          </Panel>
        </ReactFlow>
      </div>
      {!expanded && graph.validRelations.length > 100 && (
        <p className="graph-summary">当前显示目标相关分支；其余 {graph.components.length} 个连通分量可通过“展开全部分支”查看。</p>
      )}
    </section>
  )
}

function FitButton() {
  const { fitView } = useReactFlow()
  return <button onClick={() => void fitView({ padding: 0.18 })}>适应视图</button>
}

function WorkspaceGraphNode({ data }: NodeProps<Node<GraphNodeData>>) {
  return (
    <div className={`workspace-graph-node workspace-graph-node--${data.kind}`}>
      <Handle type="target" position={Position.Left} />
      <span>{data.label}</span>
      {data.kind === 'recipe' && data.recipeIndex !== undefined && (
        <button aria-label={`从方案移除配方 ${data.recipeIndex}`} onClick={() => data.onRemove?.(data.recipeIndex as number)}>×</button>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
