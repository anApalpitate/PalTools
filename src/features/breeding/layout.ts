import ELKApi from 'elkjs/lib/elk-api.js'
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url'
import type { GraphEdgeInput, GraphNodeInput } from '../../domain/breeding-graph'

const OUTPUT_LABEL_WIDTH = 88
const OUTPUT_LABEL_HEIGHT = 30
const COMPONENT_COLUMN_GAP = 80
const COMPONENT_ROW_GAP = 96
const MIN_PACKING_WIDTH = 720
const ELK_LABEL_RELATION_LIMIT = 100

export interface LayoutPoint {
  x: number
  y: number
}

export interface LayoutRequest {
  requestId: number
  nodes: GraphNodeInput[]
  edges: GraphEdgeInput[]
  viewport: { width: number; height: number }
}

export interface LayoutEdge extends GraphEdgeInput {
  points: LayoutPoint[]
  label?: LayoutPoint
}

export interface LayoutResult {
  requestId: number
  nodes: Array<GraphNodeInput & { x: number; y: number }>
  edges: LayoutEdge[]
}

export function roundedOrthogonalPath(points: readonly LayoutPoint[], radius = 8): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let path = `M ${points[0].x} ${points[0].y}`
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index]
    if (index === points.length - 1) {
      path += ` L ${current.x} ${current.y}`
      continue
    }
    const previous = points[index - 1]
    const next = points[index + 1]
    const incoming = Math.hypot(current.x - previous.x, current.y - previous.y)
    const outgoing = Math.hypot(next.x - current.x, next.y - current.y)
    const corner = Math.min(radius, incoming / 2, outgoing / 2)
    const before = moveToward(current, previous, corner)
    const after = moveToward(current, next, corner)
    path += ` L ${roundPath(before.x)} ${roundPath(before.y)}`
    path += ` Q ${current.x} ${current.y} ${roundPath(after.x)} ${roundPath(after.y)}`
  }
  return path
}

export function pointAlongRoute(points: readonly LayoutPoint[], ratio: number): LayoutPoint | undefined {
  if (points.length === 0) return undefined
  if (points.length === 1) return points[0]
  const lengths = points.slice(1).map((point, index) =>
    Math.hypot(point.x - points[index].x, point.y - points[index].y),
  )
  const total = lengths.reduce((sum, length) => sum + length, 0)
  let remaining = total * Math.max(0, Math.min(1, ratio))
  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining <= lengths[index] || index === lengths.length - 1) {
      const start = points[index]
      const end = points[index + 1]
      const segmentRatio = lengths[index] === 0 ? 0 : remaining / lengths[index]
      return {
        x: Math.round(start.x + (end.x - start.x) * segmentRatio),
        y: Math.round(start.y + (end.y - start.y) * segmentRatio),
      }
    }
    remaining -= lengths[index]
  }
  return points.at(-1)
}

interface ElkPoint {
  x?: number
  y?: number
}

interface ElkSection {
  startPoint?: ElkPoint
  bendPoints?: ElkPoint[]
  endPoint?: ElkPoint
}

interface ElkEdgeResult {
  id: string
  sections?: ElkSection[]
}

type PositionedNode = GraphNodeInput & { x: number; y: number }
type ElkInstance = InstanceType<typeof ELKApi>

let elkPromise: Promise<ElkInstance> | undefined

function getElk(): Promise<ElkInstance> {
  if (elkPromise) return elkPromise
  elkPromise = (async () => {
    if (typeof Worker !== 'function') {
      const module = await import('elkjs/lib/elk.bundled.js')
      const BundledConstructor = (module.default as unknown as { default?: typeof module.default }).default ?? module.default
      return new BundledConstructor()
    }
    const ApiConstructor = (ELKApi as unknown as { default?: typeof ELKApi }).default ?? ELKApi
    return new ApiConstructor({
      workerUrl: elkWorkerUrl,
      workerFactory: (url) => new Worker(url ?? elkWorkerUrl),
    })
  })()
  return elkPromise
}

export async function layoutGraph(request: LayoutRequest): Promise<LayoutResult> {
  const elk = await getElk()
  const relationCount = request.edges.filter((edge) => edge.role === 'offspringOutput').length
  const letElkPlaceLabels = relationCount <= ELK_LABEL_RELATION_LIMIT
  const graph = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '40',
      'elk.spacing.edgeNode': '24',
      'elk.spacing.edgeEdge': '14',
      'elk.layered.spacing.nodeNodeBetweenLayers': '56',
      'elk.layered.thoroughness': '1',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.cycleBreaking.strategy': 'GREEDY',
      'elk.layered.crossingMinimization.strategy': 'INTERACTIVE',
      'elk.layered.crossingMinimization.greedySwitch.type': 'OFF',
      'elk.layered.nodePlacement.strategy': 'SIMPLE',
      'elk.separateConnectedComponents': 'true',
    },
    children: request.nodes.map((node) => ({
      id: node.id,
      width: node.width,
      height: node.height,
    })),
    edges: request.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
      ...(edge.role === 'offspringOutput' && letElkPlaceLabels
        ? { labels: [{ id: `label:${edge.id}`, width: OUTPUT_LABEL_WIDTH, height: OUTPUT_LABEL_HEIGHT }] }
        : {}),
    })),
  })
  const positions = new Map(
    (graph.children ?? []).map((node) => [node.id, {
      x: Math.round(node.x ?? 0),
      y: Math.round(node.y ?? 0),
    }]),
  )
  const nodes = request.nodes.map<PositionedNode>((node) => ({
    ...node,
    ...(positions.get(node.id) ?? { x: 0, y: 0 }),
  }))
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const elkEdges = new Map(
    ((graph.edges ?? []) as ElkEdgeResult[]).map((edge) => [edge.id, edge]),
  )
  const edges = request.edges.map<LayoutEdge>((edge) => {
    const elkEdge = elkEdges.get(edge.id)
    const points = routePoints(elkEdge?.sections)
    const routedPoints = points.length >= 2 ? points : fallbackRoute(edge, nodeById)
    return {
      ...edge,
      points: routedPoints,
      ...(edge.role === 'offspringOutput'
        ? { label: pointAlongRoute(routedPoints, 0.52) }
        : {}),
    }
  })
  const packed = packComponents(nodes, edges, request.viewport.width)
  return {
    requestId: request.requestId,
    nodes: packed.nodes,
    edges: packed.edges,
  }
}

function routePoints(sections: ElkSection[] | undefined): LayoutPoint[] {
  const points: LayoutPoint[] = []
  for (const section of sections ?? []) {
    for (const point of [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]) {
      if (!point) continue
      const rounded = { x: Math.round(point.x ?? 0), y: Math.round(point.y ?? 0) }
      const previous = points.at(-1)
      if (!previous || previous.x !== rounded.x || previous.y !== rounded.y) points.push(rounded)
    }
  }
  return points
}

function moveToward(from: LayoutPoint, to: LayoutPoint, distance: number): LayoutPoint {
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  if (length === 0) return from
  return {
    x: from.x + (to.x - from.x) * distance / length,
    y: from.y + (to.y - from.y) * distance / length,
  }
}

function roundPath(value: number): number {
  return Math.round(value * 100) / 100
}

function fallbackRoute(edge: GraphEdgeInput, nodeById: ReadonlyMap<string, PositionedNode>): LayoutPoint[] {
  const source = nodeById.get(edge.source)
  const target = nodeById.get(edge.target)
  if (!source || !target) return []
  const start = { x: Math.round(source.x + source.width / 2), y: Math.round(source.y + source.height) }
  const end = { x: Math.round(target.x + target.width / 2), y: Math.round(target.y) }
  const middleY = Math.round((start.y + end.y) / 2)
  return [start, { x: start.x, y: middleY }, { x: end.x, y: middleY }, end]
}

function packComponents(
  nodes: PositionedNode[],
  edges: LayoutEdge[],
  viewportWidth: number,
): { nodes: PositionedNode[]; edges: LayoutEdge[] } {
  const componentIds = [...new Set(nodes.map((node) => node.componentId))].sort((a, b) => a.localeCompare(b))
  if (componentIds.length === 0) return { nodes, edges }
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const availableWidth = Math.max(MIN_PACKING_WIDTH, Math.round(viewportWidth) - 64)
  const offsets = new Map<string, LayoutPoint>()
  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0

  for (const componentId of componentIds) {
    const componentNodes = nodes.filter((node) => node.componentId === componentId)
    const componentNodeIds = new Set(componentNodes.map((node) => node.id))
    const componentEdges = edges.filter((edge) => componentNodeIds.has(edge.source))
    const bounds = componentBounds(componentNodes, componentEdges)
    const width = Math.max(1, bounds.maxX - bounds.minX)
    const height = Math.max(1, bounds.maxY - bounds.minY)
    if (cursorX > 0 && cursorX + width > availableWidth) {
      cursorX = 0
      cursorY += rowHeight + COMPONENT_ROW_GAP
      rowHeight = 0
    }
    offsets.set(componentId, { x: cursorX - bounds.minX, y: cursorY - bounds.minY })
    cursorX += width + COMPONENT_COLUMN_GAP
    rowHeight = Math.max(rowHeight, height)
  }

  const packedNodes = nodes.map((node) => {
    const offset = offsets.get(node.componentId) ?? { x: 0, y: 0 }
    return { ...node, x: node.x + offset.x, y: node.y + offset.y }
  })
  const packedEdges = edges.map((edge) => {
    const componentId = nodeById.get(edge.source)?.componentId ?? 'component-0'
    const offset = offsets.get(componentId) ?? { x: 0, y: 0 }
    return {
      ...edge,
      points: edge.points.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y })),
      ...(edge.label ? { label: { x: edge.label.x + offset.x, y: edge.label.y + offset.y } } : {}),
    }
  })
  return { nodes: packedNodes, edges: packedEdges }
}

function componentBounds(nodes: PositionedNode[], edges: LayoutEdge[]) {
  const xs = nodes.flatMap((node) => [node.x, node.x + node.width])
  const ys = nodes.flatMap((node) => [node.y, node.y + node.height])
  for (const edge of edges) {
    xs.push(...edge.points.map((point) => point.x))
    ys.push(...edge.points.map((point) => point.y))
    if (edge.label) {
      xs.push(edge.label.x - OUTPUT_LABEL_WIDTH / 2, edge.label.x + OUTPUT_LABEL_WIDTH / 2)
      ys.push(edge.label.y - OUTPUT_LABEL_HEIGHT / 2, edge.label.y + OUTPUT_LABEL_HEIGHT / 2)
    }
  }
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  }
}
