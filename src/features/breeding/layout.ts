import ELKApi from 'elkjs/lib/elk-api.js'
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url'
import type { BreedingGraphNodeMode, GraphEdgeInput, GraphNodeInput } from '../../domain/breeding-graph'

export interface LayoutRequest {
  requestId: number
  nodes: GraphNodeInput[]
  edges: GraphEdgeInput[]
  nodeMode: BreedingGraphNodeMode
  viewport: { width: number; height: number }
}

export interface LayoutResult {
  requestId: number
  nodes: Array<GraphNodeInput & { x: number; y: number }>
  edges: GraphEdgeInput[]
}

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
  const graph = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '34',
      'elk.layered.spacing.nodeNodeBetweenLayers': '72',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
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
    })),
  })
  const positions = new Map(
    (graph.children ?? []).map((node) => [node.id, {
      x: Math.round(node.x ?? 0),
      y: Math.round(node.y ?? 0),
    }]),
  )
  return {
    requestId: request.requestId,
    nodes: request.nodes.map((node) => ({ ...node, ...(positions.get(node.id) ?? { x: 0, y: 0 }) })),
    edges: request.edges,
  }
}
