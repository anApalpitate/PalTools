import ELKApi from 'elkjs/lib/elk-api.js'
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url'
import type { GraphEdgeInput, GraphNodeInput, WorkspaceNodeMode } from '../../domain/breeding-workspace'
import type { BreedingRecipeMatch } from '../../domain/types'

export interface LayoutRequest {
  requestId: number
  nodes: GraphNodeInput[]
  edges: GraphEdgeInput[]
  nodeMode: WorkspaceNodeMode
  viewport: { width: number; height: number }
}

export interface LayoutResult {
  requestId: number
  nodes: Array<GraphNodeInput & { x: number; y: number }>
  edges: GraphEdgeInput[]
}

export function recipeIndexesForTarget(
  recipes: readonly BreedingRecipeMatch[],
  targetId: string,
): Set<number> {
  const visible = new Set<number>()
  const needed = new Set([targetId])
  let changed = true
  while (changed) {
    changed = false
    for (const recipe of recipes) {
      if (needed.has(recipe.childId) && !visible.has(recipe.recipeIndex)) {
        visible.add(recipe.recipeIndex)
        if (!needed.has(recipe.parentAId)) { needed.add(recipe.parentAId); changed = true }
        if (!needed.has(recipe.parentBId)) { needed.add(recipe.parentBId); changed = true }
      }
    }
  }
  return visible
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
