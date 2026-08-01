import type {
  BreedingGraphNodeV1,
  BreedingPlanV1,
  BreedingRelationV1,
  GraphPositionV1,
} from './breeding-graph'
import { validateBreedingPlan } from './breeding-graph'
import type {
  BreedingIndexPayload,
  BreedingRecipeMatch,
  PalRecord,
} from './types'

export interface GraphIdFactory {
  node(): string
  relation(): string
}

export interface AddRecipeResult {
  plan: BreedingPlanV1
  childNodeId: string
}

export function addPalNode(
  plan: BreedingPlanV1,
  palId: string,
  source: BreedingGraphNodeV1['source'],
  id: string,
  position: GraphPositionV1 = nextNodePosition(plan),
): BreedingPlanV1 {
  return touchPlan({
    ...plan,
    nodes: [...plan.nodes, { id, palId, source, position }],
  })
}

export function addChildRelation(
  plan: BreedingPlanV1,
  parentANodeId: string,
  parentBNodeId: string,
  match: BreedingRecipeMatch,
  ids: GraphIdFactory,
  options: {
    validPalIds: ReadonlySet<string>
    breedingIndex: BreedingIndexPayload
  },
): AddRecipeResult {
  const parentA = plan.nodes.find((node) => node.id === parentANodeId)
  const parentB = plan.nodes.find((node) => node.id === parentBNodeId)
  if (!parentA || !parentB) throw new Error('请选择两个仍存在于方案中的亲本节点。')
  if (parentA.id === parentB.id) throw new Error('必须选择两个不同的亲本节点实例。')

  const actualParents = [parentA.palId, parentB.palId].sort()
  const recipeParents = [match.parentAId, match.parentBId].sort()
  if (
    actualParents[0] !== recipeParents[0] ||
    actualParents[1] !== recipeParents[1]
  ) {
    throw new Error('所选配方与亲本节点不一致。')
  }

  const childNodeId = ids.node()
  const childPosition = {
    x: (parentA.position.x + parentB.position.x) / 2,
    y: Math.max(parentA.position.y, parentB.position.y) + 180,
  }
  const relation: BreedingRelationV1 = {
    id: ids.relation(),
    parentANodeId,
    parentBNodeId,
    childNodeId,
    recipeIndex: match.recipeIndex,
  }
  const candidate = touchPlan({
    ...plan,
    nodes: [
      ...plan.nodes,
      {
        id: childNodeId,
        palId: match.childId,
        source: 'manual-child',
        position: childPosition,
      },
    ],
    relations: [...plan.relations, relation],
  })
  const validation = validateBreedingPlan(candidate, options)
  if (!validation.valid) {
    throw new Error(validation.issues[0]?.message ?? '配种关系不合法。')
  }
  return { plan: candidate, childNodeId }
}

export function updateNodePositions(
  plan: BreedingPlanV1,
  positions: ReadonlyMap<string, GraphPositionV1>,
): BreedingPlanV1 {
  let changed = false
  const nodes = plan.nodes.map((node) => {
    const position = positions.get(node.id)
    if (!position || (position.x === node.position.x && position.y === node.position.y)) {
      return node
    }
    changed = true
    return { ...node, position }
  })
  return changed ? touchPlan({ ...plan, nodes }) : plan
}

export function layoutBreedingPlan(
  plan: BreedingPlanV1,
  palsById: ReadonlyMap<string, PalRecord>,
): BreedingPlanV1 {
  if (plan.nodes.length === 0) return plan
  const level = new Map(plan.nodes.map((node) => [node.id, 0]))
  const children = new Map(plan.nodes.map((node) => [node.id, new Set<string>()]))
  const indegree = new Map(plan.nodes.map((node) => [node.id, 0]))
  for (const relation of plan.relations) {
    for (const parentId of [relation.parentANodeId, relation.parentBNodeId]) {
      if (!children.get(parentId)?.has(relation.childNodeId)) {
        children.get(parentId)?.add(relation.childNodeId)
        indegree.set(
          relation.childNodeId,
          (indegree.get(relation.childNodeId) ?? 0) + 1,
        )
      }
    }
  }

  const nodeById = new Map(plan.nodes.map((node) => [node.id, node]))
  const compareNodeIds = (leftId: string, rightId: string) => {
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
  const queue = plan.nodes
    .filter((node) => indegree.get(node.id) === 0)
    .map((node) => node.id)
    .sort(compareNodeIds)
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const parentId = queue[cursor]
    for (const childId of [...(children.get(parentId) ?? [])].sort(compareNodeIds)) {
      level.set(childId, Math.max(level.get(childId) ?? 0, (level.get(parentId) ?? 0) + 1))
      const nextIndegree = (indegree.get(childId) ?? 1) - 1
      indegree.set(childId, nextIndegree)
      if (nextIndegree === 0) queue.push(childId)
    }
  }

  const layers = new Map<number, string[]>()
  for (const node of plan.nodes) {
    const nodeLevel = level.get(node.id) ?? 0
    const layer = layers.get(nodeLevel) ?? []
    layer.push(node.id)
    layers.set(nodeLevel, layer)
  }
  const positions = new Map<string, GraphPositionV1>()
  for (const [nodeLevel, ids] of [...layers.entries()].sort(([a], [b]) => a - b)) {
    ids.sort(compareNodeIds)
    const width = (ids.length - 1) * 190
    ids.forEach((id, index) => {
      positions.set(id, { x: index * 190 - width / 2, y: nodeLevel * 180 })
    })
  }
  return updateNodePositions(plan, positions)
}

function nextNodePosition(plan: BreedingPlanV1): GraphPositionV1 {
  const index = plan.nodes.length
  return { x: (index % 5) * 190, y: Math.floor(index / 5) * 150 }
}

function touchPlan(plan: BreedingPlanV1): BreedingPlanV1 {
  return { ...plan, updatedAt: new Date().toISOString() }
}
