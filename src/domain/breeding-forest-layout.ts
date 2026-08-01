import type { BreedingPlanV1, GraphPositionV1 } from './breeding-graph'
import type { PalRecord } from './types'

export const FOREST_NODE_WIDTH = 160
export const FOREST_NODE_HEIGHT = 72
export const FOREST_HORIZONTAL_GAP = 56
export const FOREST_VERTICAL_GAP = 108
export const FOREST_COMPONENT_GAP = 120
const FOREST_SHELF_WIDTH = 1800

export interface ForestLayoutNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  level: number
  componentId: string
}

export interface ForestLayoutEdge {
  id: string
  relationId: string
  sourceNodeId: string
  targetNodeId: string
}

export interface GraphBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ForestLayout {
  nodes: ForestLayoutNode[]
  edges: ForestLayoutEdge[]
  nodeById: ReadonlyMap<string, ForestLayoutNode>
  bounds: GraphBounds | null
}

interface RelativeComponentLayout {
  id: string
  signature: string
  nodes: Omit<ForestLayoutNode, 'componentId'>[]
  width: number
  height: number
}

export interface ForestLayoutEngine {
  compute(
    plan: BreedingPlanV1,
    palsById: ReadonlyMap<string, PalRecord>,
  ): ForestLayout
  getCacheStats(): { hits: number; misses: number }
}

export function createForestLayoutEngine(): ForestLayoutEngine {
  const cache = new Map<string, RelativeComponentLayout>()
  let hits = 0
  let misses = 0

  return {
    compute(plan, palsById) {
      const components = findComponents(plan)
      const relative = components.map((nodeIds) => {
        const signature = componentSignature(plan, nodeIds)
        const cached = cache.get(signature)
        if (cached) {
          hits += 1
          return cached
        }
        misses += 1
        const computed = layoutComponent(plan, nodeIds, palsById, signature)
        cache.set(signature, computed)
        return computed
      })
      return packComponents(plan, relative)
    },
    getCacheStats: () => ({ hits, misses }),
  }
}

export function computeForestLayout(
  plan: BreedingPlanV1,
  palsById: ReadonlyMap<string, PalRecord>,
): ForestLayout {
  return createForestLayoutEngine().compute(plan, palsById)
}

export function forestLayoutPositions(layout: ForestLayout): Map<string, GraphPositionV1> {
  return new Map(layout.nodes.map((node) => [node.id, { x: node.x, y: node.y }]))
}

function findComponents(plan: BreedingPlanV1): string[][] {
  const neighbors = new Map(plan.nodes.map((node) => [node.id, new Set<string>()]))
  for (const relation of plan.relations) {
    const ids = [
      relation.parentANodeId,
      relation.parentBNodeId,
      relation.childNodeId,
    ]
    for (const left of ids) {
      for (const right of ids) {
        if (left !== right) neighbors.get(left)?.add(right)
      }
    }
  }
  const visited = new Set<string>()
  const components: string[][] = []
  for (const node of [...plan.nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    if (visited.has(node.id)) continue
    const component: string[] = []
    const stack = [node.id]
    visited.add(node.id)
    while (stack.length > 0) {
      const current = stack.pop()!
      component.push(current)
      for (const neighbor of [...(neighbors.get(current) ?? [])].sort().reverse()) {
        if (visited.has(neighbor)) continue
        visited.add(neighbor)
        stack.push(neighbor)
      }
    }
    components.push(component.sort())
  }
  return components
}

function componentSignature(plan: BreedingPlanV1, nodeIds: string[]): string {
  const ids = new Set(nodeIds)
  const nodes = plan.nodes
    .filter((node) => ids.has(node.id))
    .map((node) => `${node.id}:${node.palId}`)
    .sort()
  const relations = plan.relations
    .filter((relation) => ids.has(relation.childNodeId))
    .map(
      (relation) =>
        `${relation.id}:${relation.parentANodeId}:${relation.parentBNodeId}:${relation.childNodeId}`,
    )
    .sort()
  return `${nodes.join(',')}|${relations.join(',')}`
}

function layoutComponent(
  plan: BreedingPlanV1,
  nodeIds: string[],
  palsById: ReadonlyMap<string, PalRecord>,
  signature: string,
): RelativeComponentLayout {
  const ids = new Set(nodeIds)
  const nodeById = new Map(
    plan.nodes.filter((node) => ids.has(node.id)).map((node) => [node.id, node]),
  )
  const children = new Map(nodeIds.map((id) => [id, new Set<string>()]))
  const parents = new Map(nodeIds.map((id) => [id, new Set<string>()]))
  const indegree = new Map(nodeIds.map((id) => [id, 0]))
  for (const relation of plan.relations) {
    if (!ids.has(relation.childNodeId)) continue
    for (const parentId of [relation.parentANodeId, relation.parentBNodeId]) {
      if (children.get(parentId)?.has(relation.childNodeId)) continue
      children.get(parentId)?.add(relation.childNodeId)
      parents.get(relation.childNodeId)?.add(parentId)
      indegree.set(relation.childNodeId, (indegree.get(relation.childNodeId) ?? 0) + 1)
    }
  }
  const compareIds = createNodeComparator(nodeById, palsById)
  const queue = nodeIds.filter((id) => indegree.get(id) === 0).sort(compareIds)
  const levels = new Map(nodeIds.map((id) => [id, 0]))
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const parentId = queue[cursor]
    for (const childId of [...(children.get(parentId) ?? [])].sort(compareIds)) {
      levels.set(
        childId,
        Math.max(levels.get(childId) ?? 0, (levels.get(parentId) ?? 0) + 1),
      )
      const next = (indegree.get(childId) ?? 1) - 1
      indegree.set(childId, next)
      if (next === 0) queue.push(childId)
    }
  }

  const layers = new Map<number, string[]>()
  for (const id of nodeIds) {
    const level = levels.get(id) ?? 0
    layers.set(level, [...(layers.get(level) ?? []), id])
  }
  const stride = FOREST_NODE_WIDTH + FOREST_HORIZONTAL_GAP
  const maxLayerSize = Math.max(...[...layers.values()].map((layer) => layer.length), 1)
  const componentWidth = (maxLayerSize - 1) * stride + FOREST_NODE_WIDTH
  const assignedX = new Map<string, number>()
  const nodes: Omit<ForestLayoutNode, 'componentId'>[] = []
  for (const [level, layerIds] of [...layers].sort(([a], [b]) => a - b)) {
    layerIds.sort((left, right) => {
      const leftParents = [...(parents.get(left) ?? [])]
      const rightParents = [...(parents.get(right) ?? [])]
      const leftCenter = average(leftParents.map((id) => assignedX.get(id) ?? 0))
      const rightCenter = average(rightParents.map((id) => assignedX.get(id) ?? 0))
      return leftCenter - rightCenter || compareIds(left, right)
    })
    const layerWidth = (layerIds.length - 1) * stride + FOREST_NODE_WIDTH
    const offset = (componentWidth - layerWidth) / 2
    layerIds.forEach((id, index) => {
      const x = offset + index * stride
      assignedX.set(id, x + FOREST_NODE_WIDTH / 2)
      nodes.push({
        id,
        x,
        y: level * (FOREST_NODE_HEIGHT + FOREST_VERTICAL_GAP),
        width: FOREST_NODE_WIDTH,
        height: FOREST_NODE_HEIGHT,
        level,
      })
    })
  }
  const maxLevel = Math.max(...nodes.map((node) => node.level), 0)
  return {
    id: nodeIds[0] ?? '',
    signature,
    nodes,
    width: componentWidth,
    height: maxLevel * (FOREST_NODE_HEIGHT + FOREST_VERTICAL_GAP) + FOREST_NODE_HEIGHT,
  }
}

function packComponents(
  plan: BreedingPlanV1,
  components: RelativeComponentLayout[],
): ForestLayout {
  const nodes: ForestLayoutNode[] = []
  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0
  for (const component of components) {
    if (cursorX > 0 && cursorX + component.width > FOREST_SHELF_WIDTH) {
      cursorX = 0
      cursorY += rowHeight + FOREST_COMPONENT_GAP
      rowHeight = 0
    }
    for (const node of component.nodes) {
      nodes.push({
        ...node,
        x: node.x + cursorX,
        y: node.y + cursorY,
        componentId: component.id,
      })
    }
    cursorX += component.width + FOREST_COMPONENT_GAP
    rowHeight = Math.max(rowHeight, component.height)
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const edges = plan.relations.flatMap((relation) => [
    {
      id: `${relation.id}-a`,
      relationId: relation.id,
      sourceNodeId: relation.parentANodeId,
      targetNodeId: relation.childNodeId,
    },
    {
      id: `${relation.id}-b`,
      relationId: relation.id,
      sourceNodeId: relation.parentBNodeId,
      targetNodeId: relation.childNodeId,
    },
  ])
  return { nodes, edges, nodeById, bounds: boundsForNodes(nodes) }
}

function boundsForNodes(nodes: ForestLayoutNode[]): GraphBounds | null {
  if (nodes.length === 0) return null
  const minX = Math.min(...nodes.map((node) => node.x))
  const minY = Math.min(...nodes.map((node) => node.y))
  const maxX = Math.max(...nodes.map((node) => node.x + node.width))
  const maxY = Math.max(...nodes.map((node) => node.y + node.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function createNodeComparator(
  nodeById: ReadonlyMap<string, BreedingPlanV1['nodes'][number]>,
  palsById: ReadonlyMap<string, PalRecord>,
) {
  return (leftId: string, rightId: string) => {
    const left = nodeById.get(leftId)
    const right = nodeById.get(rightId)
    const leftNo = left ? palsById.get(left.palId)?.paldexNo : null
    const rightNo = right ? palsById.get(right.palId)?.paldexNo : null
    return (
      (leftNo ?? '9999').localeCompare(rightNo ?? '9999', undefined, {
        numeric: true,
      }) || leftId.localeCompare(rightId)
    )
  }
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length
}
