import type { BreedingIndexPayload, BreedingRecipeMatch, PalRecord } from './types'
import {
  validateBreedingPlanV2,
  type BreedingPlanV2,
  type BreedingGraphNodeV2,
  type BreedingRelationV2,
  type BreedingPlanValidationOptions,
} from './breeding-graph'

export const LAYERED_NODE_WIDTH = 160
export const LAYERED_NODE_HEIGHT = 72
export const LAYERED_HORIZONTAL_GAP = 56
export const LAYERED_VERTICAL_GAP = 108
export const LAYERED_SLOT_PITCH = LAYERED_NODE_WIDTH + LAYERED_HORIZONTAL_GAP

export interface LayeredLayoutNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  row: number
  index: number
}

export interface LayeredLayoutEdge {
  id: string
  relationId: string
  sourceNodeId: string
  targetNodeId: string
}

export interface LayeredGraphBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface LayeredLayout {
  nodes: LayeredLayoutNode[]
  edges: LayeredLayoutEdge[]
  nodeById: ReadonlyMap<string, LayeredLayoutNode>
  bounds: LayeredGraphBounds | null
}

export type LayeredSlotKind = 'empty' | 'insert' | 'combine'

export interface LayeredSlotTarget {
  id: string
  kind: LayeredSlotKind
  row: number
  index: number
  anchorNodeId?: string
  direction?: 'left' | 'right'
  label: string
}

export interface LayeredIdFactory {
  node(): string
  relation(): string
}

export interface LayeredChildResult {
  plan: BreedingPlanV2
  childNodeId: string
  forkNodeIds: string[]
}

export interface LayeredDeleteResult {
  plan: BreedingPlanV2
  deletedNodeIds: string[]
  deletedRelationIds: string[]
}

export interface LayeredChildOptions {
  validPalIds: ReadonlySet<string>
  breedingIndex: BreedingIndexPayload
  direction?: 'left' | 'right'
}

export function createEmptyLayeredPlan(
  id: string,
  name: string,
  now = new Date().toISOString(),
): BreedingPlanV2 {
  return {
    id,
    schemaVersion: 2,
    name,
    layers: [],
    nodes: [],
    relations: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: now,
    updatedAt: now,
  }
}

export function computeLayeredLayout(plan: BreedingPlanV2): LayeredLayout {
  if (plan.nodes.length === 0) {
    return { nodes: [], edges: [], nodeById: new Map(), bounds: null }
  }

  const baseCenters = new Map<string, number>()
  const maxWidth = Math.max(...plan.layers.map((layer) => layer.nodeIds.length), 1)
  const graphWidth = maxWidth * LAYERED_SLOT_PITCH - LAYERED_HORIZONTAL_GAP
  for (const layer of plan.layers) {
    const rowWidth = layer.nodeIds.length * LAYERED_SLOT_PITCH - LAYERED_HORIZONTAL_GAP
    const left = (graphWidth - rowWidth) / 2
    layer.nodeIds.forEach((nodeId, index) => {
      baseCenters.set(nodeId, left + index * LAYERED_SLOT_PITCH + LAYERED_NODE_WIDTH / 2)
    })
  }

  const desired = new Map(baseCenters)
  const nodeById = new Map(plan.nodes.map((node) => [node.id, node]))
  const center = (nodeId: string) => desired.get(nodeId) ?? baseCenters.get(nodeId) ?? 0
  for (const relation of plan.relations) {
    const parentA = center(relation.parentANodeId)
    const parentB = center(relation.parentBNodeId)
    desired.set(relation.childNodeId, (parentA + parentB) / 2)
  }

  const positions = new Map<string, number>()
  for (const layer of plan.layers) {
    let previous = -Infinity
    for (const nodeId of layer.nodeIds) {
      const next = Math.max(desired.get(nodeId) ?? 0, previous + LAYERED_SLOT_PITCH)
      positions.set(nodeId, next)
      previous = next
    }
    let next = Infinity
    for (let index = layer.nodeIds.length - 1; index >= 0; index -= 1) {
      const nodeId = layer.nodeIds[index]
      const current = positions.get(nodeId) ?? 0
      const bounded = Math.min(current, next - LAYERED_SLOT_PITCH)
      positions.set(nodeId, bounded)
      next = bounded
    }
  }

  const allX = [...positions.values()]
  const minX = Math.min(...allX) - LAYERED_NODE_WIDTH / 2
  const offsetX = minX < 0 ? -minX + LAYERED_HORIZONTAL_GAP : LAYERED_HORIZONTAL_GAP
  const nodes = plan.layers.flatMap((layer, row) =>
    layer.nodeIds.map((nodeId, index) => ({
      id: nodeId,
      x: (positions.get(nodeId) ?? 0) - LAYERED_NODE_WIDTH / 2 + offsetX,
      y: row * (LAYERED_NODE_HEIGHT + LAYERED_VERTICAL_GAP) + LAYERED_VERTICAL_GAP,
      width: LAYERED_NODE_WIDTH,
      height: LAYERED_NODE_HEIGHT,
      row,
      index,
    })),
  )
  const renderedNodeById = new Map(nodes.map((node) => [node.id, node]))
  const edges = plan.relations.flatMap((relation) => [
    {
      id: `${relation.id}:a`,
      relationId: relation.id,
      sourceNodeId: relation.parentANodeId,
      targetNodeId: relation.childNodeId,
    },
    {
      id: `${relation.id}:b`,
      relationId: relation.id,
      sourceNodeId: relation.parentBNodeId,
      targetNodeId: relation.childNodeId,
    },
  ])
  const maxX = Math.max(...nodes.map((node) => node.x + node.width))
  const maxY = Math.max(...nodes.map((node) => node.y + node.height))
  return {
    nodes,
    edges,
    nodeById: renderedNodeById,
    bounds: { x: 0, y: 0, width: maxX + LAYERED_HORIZONTAL_GAP, height: maxY + LAYERED_VERTICAL_GAP },
  }
}

export function deriveLayeredSlots(plan: BreedingPlanV2): LayeredSlotTarget[] {
  if (plan.layers.length === 0) {
    return [{ id: 'empty-graph', kind: 'empty', row: 0, index: 0, label: '在空图中创建第一个帕鲁' }]
  }
  const slots: LayeredSlotTarget[] = []
  for (const [row, layer] of plan.layers.entries()) {
    for (let index = 0; index <= layer.nodeIds.length; index += 1) {
      const left = layer.nodeIds[index - 1]
      const right = layer.nodeIds[index]
      if (left && right && isProtectedParentGap(plan, left, right)) continue
      const anchorNodeId = right ?? left
      const direction = right ? 'left' : 'right'
      slots.push({
        id: `insert-${row}-${index}`,
        kind: 'insert',
        row,
        index,
        anchorNodeId,
        direction,
        label: right ? `在${right}左侧创建` : `在${left}右侧创建`,
      })
    }
  }
  return slots
}

export function deriveCombineSlots(plan: BreedingPlanV2): LayeredSlotTarget[] {
  const slots: LayeredSlotTarget[] = []
  for (const [row, layer] of plan.layers.entries()) {
    for (const [index, nodeId] of layer.nodeIds.entries()) {
      slots.push({
        id: `combine-${row}-${index}`,
        kind: 'combine',
        row,
        index,
        anchorNodeId: nodeId,
        direction: 'right',
        label: `与${nodeId}产生子代`,
      })
    }
  }
  return slots
}

export function insertManualNode(
  plan: BreedingPlanV2,
  palId: string,
  slot: LayeredSlotTarget,
  id: string,
  source: BreedingGraphNodeV2['source'] = 'manual',
): BreedingPlanV2 {
  const layers = plan.layers.map((layer) => ({ nodeIds: [...layer.nodeIds] }))
  if (slot.kind === 'empty') {
    layers.push({ nodeIds: [id] })
  } else {
    const layer = layers[slot.row]
    if (!layer) throw new Error('插入目标行不存在。')
    layer.nodeIds.splice(slot.index, 0, id)
  }
  return touchLayeredPlan({
    ...plan,
    layers,
    nodes: [...plan.nodes, { id, palId, source }],
  })
}

export function createChildRelation(
  plan: BreedingPlanV2,
  parentAId: string,
  parentBId: string,
  match: BreedingRecipeMatch,
  ids: LayeredIdFactory,
  options: LayeredChildOptions,
): LayeredChildResult {
  const parentA = findNode(plan, parentAId)
  const parentB = findNode(plan, parentBId)
  if (!parentA || !parentB || parentA.id === parentB.id) throw new Error('请选择两个不同的亲本节点。')
  const actualParents = [parentA.palId, parentB.palId].sort()
  const recipeParents = [match.parentAId, match.parentBId].sort()
  if (actualParents[0] !== recipeParents[0] || actualParents[1] !== recipeParents[1]) {
    throw new Error('所选配方与亲本节点不一致。')
  }

  let working = plan
  const forkNodeIds: string[] = []
  const rowA = findNodeRow(working, parentA.id)
  const rowB = findNodeRow(working, parentB.id)
  if (rowA === undefined || rowB === undefined) throw new Error('亲本不在有效行中。')

  if (rowA !== rowB) {
    const deepId = rowA > rowB ? parentA.id : parentB.id
    const shallowId = deepId === parentA.id ? parentB.id : parentA.id
    let deepPairId = deepId
    if (hasDownstreamRelation(working, deepId)) {
      const slot = nearestLegalInsertSlot(working, deepId, options.direction)
      if (!slot) throw new Error('深层亲本没有可用的 fork 槽位。')
      deepPairId = ids.node()
      working = insertForkNode(working, deepId, slot, deepPairId)
      forkNodeIds.push(deepPairId)
    }
    const slot = nearestLegalInsertSlot(working, deepPairId, options.direction)
    if (!slot) throw new Error('不同层亲本没有可用的对齐槽位。')
    const alignedId = ids.node()
    working = insertForkNode(working, shallowId, slot, alignedId)
    forkNodeIds.push(alignedId)
    return appendChild(working, deepPairId, alignedId, match, ids, options, forkNodeIds)
  }

  const indexA = findNodeIndex(working, parentA.id)
  const indexB = findNodeIndex(working, parentB.id)
  if (indexA === undefined || indexB === undefined) throw new Error('亲本不在有效槽位中。')
  if (Math.abs(indexA - indexB) === 1 && !hasDownstreamRelation(working, parentA.id) && !hasDownstreamRelation(working, parentB.id)) {
    return appendChild(working, parentA.id, parentB.id, match, ids, options, forkNodeIds)
  }

  const leftId = indexA < indexB ? parentA.id : parentB.id
  const rightId = leftId === parentA.id ? parentB.id : parentA.id
  let pairLeftId = leftId
  let pairRightId = rightId
  if (hasDownstreamRelation(working, pairLeftId)) {
    const slot = nearestLegalInsertSlot(working, pairRightId, options.direction)
    if (!slot) throw new Error('亲本左侧没有可用的 fork 槽位。')
    pairLeftId = ids.node()
    working = insertForkNode(working, leftId, slot, pairLeftId)
    forkNodeIds.push(pairLeftId)
  } else if (hasDownstreamRelation(working, pairRightId)) {
    const slot = nearestLegalInsertSlot(working, pairLeftId, options.direction)
    if (!slot) throw new Error('亲本右侧没有可用的 fork 槽位。')
    pairRightId = ids.node()
    working = insertForkNode(working, rightId, slot, pairRightId)
    forkNodeIds.push(pairRightId)
  } else {
    const slot = nearestLegalInsertSlot(working, pairRightId, options.direction)
    if (!slot) throw new Error('非相邻亲本没有可用的 fork 槽位。')
    pairLeftId = ids.node()
    working = insertForkNode(working, leftId, slot, pairLeftId)
    forkNodeIds.push(pairLeftId)
  }
  if (hasDownstreamRelation(working, pairRightId)) {
    const slot = nearestLegalInsertSlot(working, pairLeftId, options.direction)
    if (!slot) throw new Error('亲本组合没有可用的第二 fork 槽位。')
    const nextId = ids.node()
    working = insertForkNode(working, pairRightId, slot, nextId)
    pairRightId = nextId
    forkNodeIds.push(nextId)
  }
  return appendChild(working, pairLeftId, pairRightId, match, ids, options, forkNodeIds)
}

export function deleteLayeredNodes(
  plan: BreedingPlanV2,
  selectedNodeIds: ReadonlySet<string>,
): LayeredDeleteResult {
  const deleted = new Set(selectedNodeIds)
  let changed = true
  while (changed) {
    changed = false
    for (const relation of plan.relations) {
      if (
        deleted.has(relation.parentANodeId) ||
        deleted.has(relation.parentBNodeId) ||
        deleted.has(relation.childNodeId)
      ) {
        if (!deleted.has(relation.childNodeId)) {
          deleted.add(relation.childNodeId)
          changed = true
        }
      }
    }
  }
  const deletedRelations = plan.relations.filter((relation) =>
    deleted.has(relation.parentANodeId) || deleted.has(relation.parentBNodeId) || deleted.has(relation.childNodeId),
  )
  const layers = plan.layers
    .map((layer) => ({ nodeIds: layer.nodeIds.filter((nodeId) => !deleted.has(nodeId)) }))
    .filter((layer) => layer.nodeIds.length > 0)
  const nextPlan = touchLayeredPlan({
    ...plan,
    layers,
    nodes: plan.nodes.filter((node) => !deleted.has(node.id)),
    relations: plan.relations.filter((relation) => !deletedRelations.includes(relation)),
  })
  return {
    plan: nextPlan,
    deletedNodeIds: [...deleted],
    deletedRelationIds: deletedRelations.map((relation) => relation.id),
  }
}

export function validateLayeredCandidate(
  plan: BreedingPlanV2,
  options: BreedingPlanValidationOptions,
): BreedingPlanV2 {
  const validation = validateBreedingPlanV2(plan, options)
  if (!validation.valid) throw new Error(validation.issues[0]?.message ?? '配种图变更不合法。')
  return validation.plan!
}

function appendChild(
  plan: BreedingPlanV2,
  parentAId: string,
  parentBId: string,
  match: BreedingRecipeMatch,
  ids: LayeredIdFactory,
  options: LayeredChildOptions,
  forkNodeIds: string[],
): LayeredChildResult {
  const rowA = findNodeRow(plan, parentAId)
  const rowB = findNodeRow(plan, parentBId)
  const indexA = findNodeIndex(plan, parentAId)
  const indexB = findNodeIndex(plan, parentBId)
  if (rowA === undefined || rowB === undefined || rowA !== rowB || indexA === undefined || indexB === undefined || Math.abs(indexA - indexB) !== 1) {
    throw new Error('两个亲本必须在同一行相邻。')
  }
  const childId = ids.node()
  const nextLayers = plan.layers.map((layer) => ({ nodeIds: [...layer.nodeIds] }))
  const childRow = rowA + 1
  while (nextLayers.length <= childRow) nextLayers.push({ nodeIds: [] })
  const childIndex = Math.min(nextLayers[childRow].nodeIds.length, Math.max(indexA, indexB))
  nextLayers[childRow].nodeIds.splice(childIndex, 0, childId)
  const child: BreedingGraphNodeV2 = { id: childId, palId: match.childId, source: 'child' }
  const relation: BreedingRelationV2 = {
    id: ids.relation(),
    parentANodeId: parentAId,
    parentBNodeId: parentBId,
    childNodeId: childId,
    recipeIndex: match.recipeIndex,
  }
  const candidate = {
    ...plan,
    layers: nextLayers,
    nodes: [...plan.nodes, child],
    relations: [...plan.relations, relation],
  }
  return {
    plan: validateLayeredCandidate(candidate, options),
    childNodeId: childId,
    forkNodeIds,
  }
}

function insertForkNode(plan: BreedingPlanV2, sourceNodeId: string, slot: LayeredSlotTarget, id: string): BreedingPlanV2 {
  const source = findNode(plan, sourceNodeId)
  if (!source || slot.kind === 'empty') throw new Error('fork 来源或目标无效。')
  const layers = plan.layers.map((layer) => ({ nodeIds: [...layer.nodeIds] }))
  const layer = layers[slot.row]
  if (!layer) throw new Error('fork 目标行不存在。')
  layer.nodeIds.splice(slot.index, 0, id)
  return touchLayeredPlan({
    ...plan,
    layers,
    nodes: [...plan.nodes, { id, palId: source.palId, source: 'fork', forkOf: sourceNodeId }],
  })
}

function nearestLegalInsertSlot(plan: BreedingPlanV2, anchorId: string, direction?: 'left' | 'right'): LayeredSlotTarget | null {
  const row = findNodeRow(plan, anchorId)
  const index = findNodeIndex(plan, anchorId)
  if (row === undefined || index === undefined) return null
  const candidates = deriveLayeredSlots(plan).filter((slot) => slot.row === row && slot.anchorNodeId === anchorId)
  const preferred = direction ? candidates.find((slot) => slot.direction === direction) : undefined
  return preferred ?? candidates[0] ?? null
}

function isProtectedParentGap(plan: BreedingPlanV2, leftId: string, rightId: string): boolean {
  return plan.relations.some((relation) =>
    (relation.parentANodeId === leftId && relation.parentBNodeId === rightId) ||
    (relation.parentANodeId === rightId && relation.parentBNodeId === leftId),
  )
}

function hasDownstreamRelation(plan: BreedingPlanV2, nodeId: string): boolean {
  return plan.relations.some((relation) => relation.parentANodeId === nodeId || relation.parentBNodeId === nodeId)
}

function findNode(plan: BreedingPlanV2, nodeId: string): BreedingGraphNodeV2 | undefined {
  return plan.nodes.find((node) => node.id === nodeId)
}

function findNodeRow(plan: BreedingPlanV2, nodeId: string): number | undefined {
  const index = plan.layers.findIndex((layer) => layer.nodeIds.includes(nodeId))
  return index >= 0 ? index : undefined
}

function findNodeIndex(plan: BreedingPlanV2, nodeId: string): number | undefined {
  for (const layer of plan.layers) {
    const index = layer.nodeIds.indexOf(nodeId)
    if (index >= 0) return index
  }
  return undefined
}

function touchLayeredPlan(plan: BreedingPlanV2): BreedingPlanV2 {
  return { ...plan, updatedAt: new Date().toISOString() }
}
