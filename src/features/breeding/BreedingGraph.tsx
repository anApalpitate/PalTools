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
  useReactFlow,
} from '@xyflow/react'
import type { Edge, EdgeProps, Node, NodeProps } from '@xyflow/react'
import { LocalPalImage } from '../../components/pal-ui'
import { projectBreedingGraph, recipeIndexesForTarget } from '../../domain/breeding-graph'
import type { GraphNodeInput } from '../../domain/breeding-graph'
import type { DerivedPlanGraph } from '../../domain/breeding-workspace'
import type { PalRecord } from '../../domain/types'
import { layoutGraph, pointAlongRoute, roundedOrthogonalPath } from './layout'
import type { LayoutPoint, LayoutResult } from './layout'

const FIT_VIEW_OPTIONS = { padding: 0.18, maxZoom: 1 } as const

interface GraphNodeData extends Record<string, unknown> {
  label: string
  kind: GraphNodeInput['kind']
  junctionRole?: GraphNodeInput['junctionRole']
  subtitle: string
  pal?: PalRecord
}

interface GraphEdgeData extends Record<string, unknown> {
  role: 'parentInput' | 'offspringOutput' | 'dependency'
  recipeIndex?: number
  multiplicity?: 2
  points: LayoutPoint[]
  label?: LayoutPoint
  onRemove?: (recipeIndex: number) => void
}

export function BreedingGraph({
  graph,
  palsById,
  onRemove,
}: {
  graph: DerivedPlanGraph
  palsById: ReadonlyMap<string, PalRecord>
  onRemove: (recipeIndex: number) => void
}) {
  const requestRef = useRef(0)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<LayoutResult | null>(null)
  const [error, setError] = useState('')
  const [viewport, setViewport] = useState({ width: 1100, height: 560 })
  const [expanded, setExpanded] = useState(graph.validRelations.length <= 100)
  const [targetId, setTargetId] = useState(graph.components[0]?.targetIds[0] ?? '')
  const visibleRecipeIndexes = useMemo(() => {
    if (expanded || !targetId) return new Set(graph.validRelations.map((recipe) => recipe.recipeIndex))
    return recipeIndexesForTarget(graph.validRelations, targetId)
  }, [expanded, graph.validRelations, targetId])
  const input = useMemo(() => projectBreedingGraph({
    nodes: graph.nodes,
    edges: graph.edges,
  }, visibleRecipeIndexes), [graph.edges, graph.nodes, visibleRecipeIndexes])

  useEffect(() => {
    const element = canvasRef.current
    if (!element || typeof ResizeObserver !== 'function') return
    const updateSize = (width: number, height: number) => {
      const next = { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) }
      setViewport((current) => current.width === next.width && current.height === next.height ? current : next)
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) updateSize(entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(element)
    const rect = element.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) updateSize(rect.width, rect.height)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const requestId = ++requestRef.current
    let cancelled = false
    void layoutGraph({ requestId, nodes: input.nodes, edges: input.edges, viewport })
      .then((result) => {
        if (!cancelled && result.requestId === requestRef.current) {
          setLayout(result)
          setError('')
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled && requestId === requestRef.current) {
          setError(`${reason instanceof Error ? reason.message : '图形布局失败。'} 请重试或改用步骤列表。`)
        }
      })
    return () => { cancelled = true }
  }, [input, viewport])

  const nodes = useMemo<Node<GraphNodeData>[]>(() => (layout?.nodes ?? []).map((node) => ({
    id: node.id,
    type: 'workspaceNode',
    position: { x: node.x, y: node.y },
    draggable: false,
    connectable: false,
    selectable: false,
    focusable: false,
    data: {
      label: node.palId
        ? palsById.get(node.palId)?.name.zhHans ?? node.palId
        : node.label,
      kind: node.kind,
      junctionRole: node.junctionRole,
      subtitle: node.kind === 'occurrence'
        ? node.label.split(' · ')[1] ?? '配方实例'
        : node.kind === 'speciesJunction'
          ? '同种帕鲁汇合'
          : node.kind === 'recipeJunction'
            ? ''
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
    markerEnd: edge.role === 'parentInput'
      ? undefined
      : {
          type: MarkerType.ArrowClosed,
          color: edge.role === 'offspringOutput'
            ? 'var(--theme-accent)'
            : 'rgb(var(--theme-border-rgb) / 0.48)',
        },
    data: {
      role: edge.role,
      recipeIndex: edge.recipeIndex,
      multiplicity: edge.multiplicity,
      points: edge.points,
      label: edge.label,
      onRemove,
    },
  })), [layout, onRemove])
  const targets = graph.components.flatMap((component) => component.targetIds)

  return (
    <section className="solution-graph" aria-label="配种图形网">
      <div className="graph-toolbar">
        <div className="graph-legend" aria-label="图形网图例">
          <span><b aria-hidden="true">◇</b> 亲本汇合</span>
          <span><b aria-hidden="true">↓</b> 子代输出</span>
          <span><b aria-hidden="true">×2</b> 同种亲本</span>
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
      <div
        ref={canvasRef}
        className="graph-canvas"
        tabIndex={0}
        aria-label={`图形网，共 ${graph.validRelations.length} 条有效关系；亲本在上，子代在下`}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={{ workspaceNode: WorkspaceGraphNode }}
          edgeTypes={{ relationEdge: WorkspaceGraphEdge }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          fitView
          fitViewOptions={FIT_VIEW_OPTIONS}
          minZoom={0.15}
          maxZoom={1.8}
        >
          <Background gap={24} size={1} />
          <Controls showInteractive={false} />
          <Panel position="top-right">
            <FitButton />
          </Panel>
          {layout && <FitOnLayout requestId={layout.requestId} />}
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
  return <button onClick={() => void fitView(FIT_VIEW_OPTIONS)}>适应视图</button>
}

function FitOnLayout({ requestId }: { requestId: number }) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    const frame = requestAnimationFrame(() => { void fitView(FIT_VIEW_OPTIONS) })
    return () => cancelAnimationFrame(frame)
  }, [fitView, requestId])
  return null
}

function WorkspaceGraphNode({ data }: NodeProps<Node<GraphNodeData>>) {
  if (data.kind === 'recipeJunction') {
    return (
      <div className="workspace-graph-recipe-junction" aria-hidden="true">
        <Handle className="workspace-graph-handle" type="target" position={Position.Top} isConnectable={false} />
        <span />
        <Handle className="workspace-graph-handle" type="source" position={Position.Bottom} isConnectable={false} />
      </div>
    )
  }
  return (
    <div className={`workspace-graph-node workspace-graph-node--${data.kind}${data.junctionRole ? ` workspace-graph-node--junction-${data.junctionRole}` : ''}`}>
      <Handle className="workspace-graph-handle" type="target" position={Position.Top} isConnectable={false} />
      {data.pal ? <LocalPalImage pal={data.pal} size="tree" /> : <span className="workspace-graph-image-fallback" aria-hidden="true">◇</span>}
      <span className="workspace-graph-node-copy"><strong>{data.label}</strong><small>{data.subtitle}</small></span>
      <Handle className="workspace-graph-handle" type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  )
}

function WorkspaceGraphEdge({ id, markerEnd, data }: EdgeProps<Edge<GraphEdgeData>>) {
  const edgePath = roundedOrthogonalPath(data?.points ?? [])
  const multiplierPosition = data?.multiplicity === 2
    ? pointAlongRoute(data.points, 0.76)
    : undefined
  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className={`workspace-graph-edge workspace-graph-edge--${data?.role ?? 'dependency'}`}
      />
      {multiplierPosition && (
        <EdgeLabelRenderer>
          <span
            className="workspace-graph-multiplier nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${multiplierPosition.x}px, ${multiplierPosition.y}px)` }}
          >
            ×2
          </span>
        </EdgeLabelRenderer>
      )}
      {data?.role === 'offspringOutput' && data.recipeIndex !== undefined && data.label && (
        <EdgeLabelRenderer>
          <div
            className="workspace-graph-edge-label nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${data.label.x}px, ${data.label.y}px)` }}
          >
            <span translate="no">#{data.recipeIndex}</span>
            <button
              aria-label={`从方案移除配方 ${data.recipeIndex}`}
              title={`移除配方 #${data.recipeIndex}`}
              onClick={() => data.onRemove?.(data.recipeIndex as number)}
            >
              ×
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
