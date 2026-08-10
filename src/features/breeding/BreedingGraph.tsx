import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BaseEdge,
  Background,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  getSmoothStepPath,
  useReactFlow,
} from '@xyflow/react'
import type { Edge, EdgeProps, Node, NodeProps } from '@xyflow/react'
import { LocalPalImage } from '../../components/pal-ui'
import type { DerivedPlanGraph, GraphNodeInput, WorkspaceNodeMode } from '../../domain/breeding-workspace'
import type { PalRecord } from '../../domain/types'
import { layoutGraph, recipeIndexesForTarget } from './layout'
import type { LayoutResult } from './layout'

interface GraphNodeData extends Record<string, unknown> {
  label: string
  kind: GraphNodeInput['kind']
  subtitle: string
  pal?: PalRecord
}

interface GraphEdgeData extends Record<string, unknown> {
  role: 'parent' | 'parents' | 'dependency'
  recipeIndex?: number
  actionAnchor?: boolean
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
        ? palsById.get(node.palId)?.name.zhHans ?? node.palId
        : node.label,
      kind: node.kind,
      subtitle: node.kind === 'occurrence'
        ? node.label.split(' · ')[1] ?? '配方实例'
        : node.kind === 'junction'
          ? '同种帕鲁汇合'
          : palsById.get(node.palId ?? '')?.paldexNo
            ? `#${palsById.get(node.palId ?? '')?.paldexNo}`
            : '帕鲁',
      pal: node.palId ? palsById.get(node.palId) : undefined,
    },
    style: { width: node.width, height: node.height },
  })), [layout, palsById])
  const edges = useMemo<Edge<GraphEdgeData>[]>(() => (layout?.edges ?? []).map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'relationEdge',
    animated: false,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: edge.role === 'parents'
        ? 'var(--theme-warning)'
        : edge.role === 'dependency'
          ? 'rgb(var(--theme-border-rgb) / 0.44)'
          : 'var(--theme-accent)',
    },
    data: {
      role: edge.role,
      recipeIndex: edge.recipeIndex,
      actionAnchor: edge.actionAnchor,
      onRemove,
    },
  })), [layout, onRemove])
  const targets = graph.components.flatMap((component) => component.targetIds)

  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return (
    <section className="solution-graph" aria-label="配种图形网">
      <div className="graph-toolbar">
        <div className="graph-legend" aria-label="图形网图例">
          <span><b>→</b> 亲本关系</span>
          <span><b>×2</b> 同种亲本</span>
        </div>
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
          edgeTypes={{ relationEdge: WorkspaceGraphEdge }}
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
      {data.pal ? <LocalPalImage pal={data.pal} size="tree" /> : <span className="workspace-graph-image-fallback" aria-hidden="true">◇</span>}
      <span className="workspace-graph-node-copy"><strong>{data.label}</strong><small>{data.subtitle}</small></span>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

function WorkspaceGraphEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<Edge<GraphEdgeData>>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 18,
    offset: 24,
  })
  const roleLabel = data?.role === 'parents' ? ' · 同种' : ''
  const showRemove = data?.recipeIndex !== undefined && data.actionAnchor
  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className={`workspace-graph-edge workspace-graph-edge--${data?.role ?? 'dependency'}`}
      />
      {data?.recipeIndex !== undefined && data.actionAnchor && (
        <EdgeLabelRenderer>
          <div
            className="workspace-graph-edge-label nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            <span>#{data.recipeIndex}{roleLabel}</span>
            {showRemove && (
              <button
                aria-label={`从方案移除配方 ${data.recipeIndex}`}
                title={`移除配方 #${data.recipeIndex}`}
                onClick={() => data.onRemove?.(data.recipeIndex as number)}
              >
                ×
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
