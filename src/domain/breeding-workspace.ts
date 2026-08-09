import { decodeRecipeMatch } from './pals'
import { matchesPalIdentityQuery, normalizeSearchTerm } from './search'
import type { BreedingIndexPayload, BreedingRecipeMatch, PalRecord } from './types'

export const WORKSPACE_SCHEMA_VERSION = 1 as const
export const DEFAULT_PLAN_ID = 'default'
export const MAX_CUSTOM_PLANS = 20
export const LARGE_PLAN_RELATION_THRESHOLD = 100

export type WorkspaceView = 'steps' | 'graph' | 'relations'
export type WorkspaceNodeMode = 'merged' | 'instance'

export interface RelationSnapshot extends BreedingRecipeMatch {
  datasetVersion: string
  addedAt: string
}

export interface StoredRelation extends RelationSnapshot {
  inBag: boolean
}

export interface PlanRecord {
  id: string
  kind: 'default' | 'custom'
  name: string
  createdAt: string
  updatedAt: string
}

export interface WorkspacePreferences {
  lastView: WorkspaceView
  nodeMode: WorkspaceNodeMode
}

export interface BreedingWorkspace {
  schemaVersion: typeof WORKSPACE_SCHEMA_VERSION
  datasetVersion: string
  relations: StoredRelation[]
  plans: PlanRecord[]
  planRelations: Record<string, number[]>
  currentPlanId: string
  preferences: WorkspacePreferences
}

export interface BreedingWorkspaceExportV1 {
  format: 'paltools-breeding-workspace'
  schemaVersion: typeof WORKSPACE_SCHEMA_VERSION
  appVersion: string
  datasetVersion: string
  exportedAt: string
  relations: StoredRelation[]
  plans: PlanRecord[]
  planRelations: Record<string, number[]>
  currentPlanId: string
  preferences: WorkspacePreferences
}

export type ResolvedRelation =
  | { snapshot: StoredRelation; status: 'valid'; recipe: BreedingRecipeMatch }
  | { snapshot: StoredRelation; status: 'invalid'; reason: string }

export interface BagFilters {
  query: string
  onlyNotInPlan: boolean
  excludeSelfBreeding: boolean
  sortKey: 'recipeIndex' | 'addedAt'
  sortDirection: 'asc' | 'desc'
}

export interface PlanStep {
  number: number
  recipe: BreedingRecipeMatch
  prerequisiteSteps: number[]
  componentId: string
  layer: number
}

export interface PlanComponent {
  id: string
  recipeIndexes: number[]
  palIds: string[]
  baseParentIds: string[]
  targetIds: string[]
}

export interface GraphNodeInput {
  id: string
  kind: 'pal' | 'recipe' | 'occurrence' | 'junction'
  label: string
  palId?: string
  recipeIndex?: number
  componentId: string
  width: number
  height: number
}

export interface GraphEdgeInput {
  id: string
  source: string
  target: string
  role: 'parentA' | 'parentB' | 'child' | 'dependency'
  recipeIndex?: number
}

export interface DerivedPlanGraph {
  validRelations: BreedingRecipeMatch[]
  invalidRelations: ResolvedRelation[]
  components: PlanComponent[]
  steps: PlanStep[]
  nodes: GraphNodeInput[]
  edges: GraphEdgeInput[]
}

export interface CycleConflict {
  palIds: string[]
  recipeIndexes: number[]
}

export function createEmptyWorkspace(
  datasetVersion: string,
  now = new Date().toISOString(),
): BreedingWorkspace {
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    datasetVersion,
    relations: [],
    plans: [{
      id: DEFAULT_PLAN_ID,
      kind: 'default',
      name: '默认方案',
      createdAt: now,
      updatedAt: now,
    }],
    planRelations: { [DEFAULT_PLAN_ID]: [] },
    currentPlanId: DEFAULT_PLAN_ID,
    preferences: { lastView: 'steps', nodeMode: 'merged' },
  }
}

export function snapshotRecipe(
  recipe: BreedingRecipeMatch,
  datasetVersion: string,
  addedAt = new Date().toISOString(),
): StoredRelation {
  return { ...recipe, datasetVersion, addedAt, inBag: true }
}

export function resolveRelation(
  relation: StoredRelation,
  index: BreedingIndexPayload,
): ResolvedRelation {
  const decoded = decodeRecipeMatch(index, relation.recipeIndex)
  if (!decoded) {
    return { snapshot: relation, status: 'invalid', reason: '当前数据中不存在该配方编号' }
  }
  if (
    decoded.parentAId !== relation.parentAId ||
    decoded.parentBId !== relation.parentBId ||
    decoded.childId !== relation.childId
  ) {
    return { snapshot: relation, status: 'invalid', reason: '当前配方三元组与保存快照不一致' }
  }
  return { snapshot: relation, status: 'valid', recipe: decoded }
}

export function resolveWorkspaceRelations(
  workspace: BreedingWorkspace,
  index: BreedingIndexPayload,
): ResolvedRelation[] {
  return workspace.relations
    .map((relation) => resolveRelation(relation, index))
    .sort((left, right) => left.snapshot.recipeIndex - right.snapshot.recipeIndex)
}

export function filterAndSortBagRelations(
  relations: ResolvedRelation[],
  palsById: ReadonlyMap<string, PalRecord>,
  currentPlanRecipeIndexes: ReadonlySet<number>,
  filters: BagFilters,
): ResolvedRelation[] {
  const query = normalizeSearchTerm(filters.query)
  const direction = filters.sortDirection === 'asc' ? 1 : -1
  return relations
    .filter(({ snapshot }) => snapshot.inBag)
    .filter(({ snapshot }) =>
      !filters.onlyNotInPlan || !currentPlanRecipeIndexes.has(snapshot.recipeIndex),
    )
    .filter(({ snapshot }) =>
      !filters.excludeSelfBreeding || snapshot.parentAId !== snapshot.parentBId,
    )
    .filter(({ snapshot }) => {
      if (!query) return true
      if (String(snapshot.recipeIndex).includes(query)) return true
      return [snapshot.parentAId, snapshot.parentBId, snapshot.childId].some((id) => {
        const pal = palsById.get(id)
        return pal ? matchesPalIdentityQuery(pal, query) : id.toLowerCase().includes(query)
      })
    })
    .sort((left, right) => {
      const primary = filters.sortKey === 'recipeIndex'
        ? left.snapshot.recipeIndex - right.snapshot.recipeIndex
        : left.snapshot.addedAt.localeCompare(right.snapshot.addedAt)
      return primary * direction || left.snapshot.recipeIndex - right.snapshot.recipeIndex
    })
}

export function detectRecipeCycle(
  recipes: readonly BreedingRecipeMatch[],
): CycleConflict | null {
  const adjacency = new Map<string, Array<{ target: string; recipeIndex: number }>>()
  const palIds = new Set<string>()
  for (const recipe of [...recipes].sort((a, b) => a.recipeIndex - b.recipeIndex)) {
    palIds.add(recipe.parentAId)
    palIds.add(recipe.parentBId)
    palIds.add(recipe.childId)
    for (const parentId of [recipe.parentAId, recipe.parentBId]) {
      const edges = adjacency.get(parentId) ?? []
      edges.push({ target: recipe.childId, recipeIndex: recipe.recipeIndex })
      adjacency.set(parentId, edges)
    }
  }
  for (const edges of adjacency.values()) {
    edges.sort((a, b) => a.target.localeCompare(b.target) || a.recipeIndex - b.recipeIndex)
  }

  const state = new Map<string, 0 | 1 | 2>()
  const nodeStack: string[] = []
  const edgeStack: number[] = []
  let conflict: CycleConflict | null = null

  const visit = (node: string): boolean => {
    state.set(node, 1)
    nodeStack.push(node)
    for (const edge of adjacency.get(node) ?? []) {
      const targetState = state.get(edge.target) ?? 0
      if (targetState === 0) {
        edgeStack.push(edge.recipeIndex)
        if (visit(edge.target)) return true
        edgeStack.pop()
      } else if (targetState === 1) {
        const start = nodeStack.lastIndexOf(edge.target)
        conflict = {
          palIds: [...nodeStack.slice(start), edge.target],
          recipeIndexes: [...new Set([...edgeStack.slice(start), edge.recipeIndex])].sort((a, b) => a - b),
        }
        return true
      }
    }
    nodeStack.pop()
    state.set(node, 2)
    return false
  }

  for (const palId of [...palIds].sort((a, b) => a.localeCompare(b))) {
    if ((state.get(palId) ?? 0) === 0 && visit(palId)) return conflict
  }
  return null
}

export function derivePlanGraph(
  relations: ResolvedRelation[],
  planRecipeIndexes: readonly number[],
  nodeMode: WorkspaceNodeMode,
): DerivedPlanGraph {
  const planSet = new Set(planRecipeIndexes)
  const selected = relations.filter(({ snapshot }) => planSet.has(snapshot.recipeIndex))
  const validRelations = selected
    .filter((relation): relation is Extract<ResolvedRelation, { status: 'valid' }> => relation.status === 'valid')
    .map((relation) => relation.recipe)
    .sort((a, b) => a.recipeIndex - b.recipeIndex)
  const invalidRelations = selected.filter((relation) => relation.status === 'invalid')
  const components = buildComponents(validRelations)
  const steps = buildSteps(validRelations, components)
  const { nodes, edges } = nodeMode === 'merged'
    ? buildMergedGraph(validRelations, components)
    : buildInstanceGraph(validRelations, components)
  return { validRelations, invalidRelations, components, steps, nodes, edges }
}

function buildComponents(recipes: BreedingRecipeMatch[]): PlanComponent[] {
  const neighbors = new Map<string, Set<string>>()
  for (const recipe of recipes) {
    const ids = [recipe.parentAId, recipe.parentBId, recipe.childId]
    for (const id of ids) neighbors.set(id, neighbors.get(id) ?? new Set())
    for (const left of ids) for (const right of ids) if (left !== right) neighbors.get(left)?.add(right)
  }
  const seen = new Set<string>()
  const raw: string[][] = []
  for (const start of [...neighbors.keys()].sort((a, b) => a.localeCompare(b))) {
    if (seen.has(start)) continue
    const queue = [start]
    const ids: string[] = []
    seen.add(start)
    while (queue.length) {
      const current = queue.shift() as string
      ids.push(current)
      for (const next of [...(neighbors.get(current) ?? [])].sort((a, b) => a.localeCompare(b))) {
        if (!seen.has(next)) { seen.add(next); queue.push(next) }
      }
    }
    raw.push(ids.sort((a, b) => a.localeCompare(b)))
  }
  return raw.map((palIds, componentIndex) => {
    const palSet = new Set(palIds)
    const componentRecipes = recipes.filter((recipe) => palSet.has(recipe.childId))
    const parentIds = new Set(componentRecipes.flatMap((recipe) => [recipe.parentAId, recipe.parentBId]))
    const childIds = new Set(componentRecipes.map((recipe) => recipe.childId))
    return {
      id: `component-${componentIndex + 1}`,
      palIds,
      recipeIndexes: componentRecipes.map((recipe) => recipe.recipeIndex).sort((a, b) => a - b),
      baseParentIds: palIds.filter((id) => parentIds.has(id) && !childIds.has(id)),
      targetIds: palIds.filter((id) => childIds.has(id) && !parentIds.has(id)),
    }
  })
}

function buildSteps(recipes: BreedingRecipeMatch[], components: PlanComponent[]): PlanStep[] {
  const producers = new Map<string, number[]>()
  for (const recipe of recipes) {
    const items = producers.get(recipe.childId) ?? []
    items.push(recipe.recipeIndex)
    producers.set(recipe.childId, items)
  }
  const byIndex = new Map(recipes.map((recipe) => [recipe.recipeIndex, recipe]))
  const steps: PlanStep[] = []
  let number = 1
  for (const component of components) {
    const remaining = new Set(component.recipeIndexes)
    const completed = new Set<number>()
    const stepNumberByRecipe = new Map<number, number>()
    let layer = 0
    while (remaining.size) {
      const ready = [...remaining].filter((recipeIndex) => {
        const recipe = byIndex.get(recipeIndex) as BreedingRecipeMatch
        const dependencies = [...new Set([
          ...(producers.get(recipe.parentAId) ?? []),
          ...(producers.get(recipe.parentBId) ?? []),
        ])].filter((index) => index !== recipeIndex && component.recipeIndexes.includes(index))
        return dependencies.every((index) => completed.has(index))
      }).sort((a, b) => a - b)
      if (!ready.length) break
      for (const recipeIndex of ready) {
        const recipe = byIndex.get(recipeIndex) as BreedingRecipeMatch
        const prerequisiteSteps = [...new Set([
          ...(producers.get(recipe.parentAId) ?? []),
          ...(producers.get(recipe.parentBId) ?? []),
        ])]
          .filter((index) => index !== recipeIndex)
          .map((index) => stepNumberByRecipe.get(index))
          .filter((value): value is number => value !== undefined)
          .sort((a, b) => a - b)
        steps.push({ number, recipe, prerequisiteSteps, componentId: component.id, layer })
        stepNumberByRecipe.set(recipeIndex, number++)
        completed.add(recipeIndex)
        remaining.delete(recipeIndex)
      }
      layer += 1
    }
  }
  return steps
}

function componentForRecipe(recipeIndex: number, components: PlanComponent[]): string {
  return components.find((component) => component.recipeIndexes.includes(recipeIndex))?.id ?? 'component-0'
}

function buildMergedGraph(recipes: BreedingRecipeMatch[], components: PlanComponent[]) {
  const palComponent = new Map(components.flatMap((component) => component.palIds.map((id) => [id, component.id] as const)))
  const palIds = [...new Set(recipes.flatMap((recipe) => [recipe.parentAId, recipe.parentBId, recipe.childId]))]
    .sort((a, b) => a.localeCompare(b))
  const nodes: GraphNodeInput[] = [
    ...palIds.map((palId) => ({ id: `pal:${palId}`, kind: 'pal' as const, label: palId, palId, componentId: palComponent.get(palId) ?? 'component-0', width: 150, height: 64 })),
    ...recipes.map((recipe) => ({ id: `recipe:${recipe.recipeIndex}`, kind: 'recipe' as const, label: `配方 #${recipe.recipeIndex}`, recipeIndex: recipe.recipeIndex, componentId: componentForRecipe(recipe.recipeIndex, components), width: 104, height: 48 })),
  ].sort((a, b) => a.id.localeCompare(b.id))
  const edges: GraphEdgeInput[] = recipes.flatMap((recipe) => [
    { id: `edge:${recipe.recipeIndex}:a`, source: `pal:${recipe.parentAId}`, target: `recipe:${recipe.recipeIndex}`, role: 'parentA' as const, recipeIndex: recipe.recipeIndex },
    { id: `edge:${recipe.recipeIndex}:b`, source: `pal:${recipe.parentBId}`, target: `recipe:${recipe.recipeIndex}`, role: 'parentB' as const, recipeIndex: recipe.recipeIndex },
    { id: `edge:${recipe.recipeIndex}:c`, source: `recipe:${recipe.recipeIndex}`, target: `pal:${recipe.childId}`, role: 'child' as const, recipeIndex: recipe.recipeIndex },
  ]).sort((a, b) => a.id.localeCompare(b.id))
  return { nodes, edges }
}

function buildInstanceGraph(recipes: BreedingRecipeMatch[], components: PlanComponent[]) {
  const palComponent = new Map(components.flatMap((component) => component.palIds.map((id) => [id, component.id] as const)))
  const palIds = [...new Set(recipes.flatMap((recipe) => [recipe.parentAId, recipe.parentBId, recipe.childId]))]
    .sort((a, b) => a.localeCompare(b))
  const nodes: GraphNodeInput[] = palIds.map((palId) => ({
    id: `junction:${palId}`, kind: 'junction', label: palId, palId,
    componentId: palComponent.get(palId) ?? 'component-0', width: 118, height: 38,
  }))
  const edges: GraphEdgeInput[] = []
  for (const recipe of recipes) {
    const componentId = componentForRecipe(recipe.recipeIndex, components)
    const occurrences = [
      ['a', recipe.parentAId, '亲本 A'],
      ['b', recipe.parentBId, '亲本 B'],
      ['c', recipe.childId, '子代'],
    ] as const
    nodes.push({ id: `recipe:${recipe.recipeIndex}`, kind: 'recipe', label: `配方 #${recipe.recipeIndex}`, recipeIndex: recipe.recipeIndex, componentId, width: 104, height: 48 })
    for (const [slot, palId, role] of occurrences) {
      nodes.push({ id: `occ:${recipe.recipeIndex}:${slot}`, kind: 'occurrence', label: `${palId} · ${role}`, palId, recipeIndex: recipe.recipeIndex, componentId, width: 142, height: 58 })
    }
    edges.push(
      { id: `edge:${recipe.recipeIndex}:a`, source: `occ:${recipe.recipeIndex}:a`, target: `recipe:${recipe.recipeIndex}`, role: 'parentA', recipeIndex: recipe.recipeIndex },
      { id: `edge:${recipe.recipeIndex}:b`, source: `occ:${recipe.recipeIndex}:b`, target: `recipe:${recipe.recipeIndex}`, role: 'parentB', recipeIndex: recipe.recipeIndex },
      { id: `edge:${recipe.recipeIndex}:c`, source: `recipe:${recipe.recipeIndex}`, target: `occ:${recipe.recipeIndex}:c`, role: 'child', recipeIndex: recipe.recipeIndex },
      { id: `dep:${recipe.recipeIndex}:a`, source: `junction:${recipe.parentAId}`, target: `occ:${recipe.recipeIndex}:a`, role: 'dependency' },
      { id: `dep:${recipe.recipeIndex}:b`, source: `junction:${recipe.parentBId}`, target: `occ:${recipe.recipeIndex}:b`, role: 'dependency' },
      { id: `dep:${recipe.recipeIndex}:c`, source: `occ:${recipe.recipeIndex}:c`, target: `junction:${recipe.childId}`, role: 'dependency' },
    )
  }
  return {
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => a.id.localeCompare(b.id)),
  }
}

export function validatePlanName(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || Array.from(trimmed).length > 40 || /[\p{Cc}\p{Cs}\r\n]/u.test(trimmed)) return null
  return trimmed
}

export function nextPlanName(plans: PlanRecord[]): string {
  const names = new Set(plans.map((plan) => plan.name))
  let index = 1
  while (names.has(`方案 ${index}`)) index += 1
  return `方案 ${index}`
}

export function formatPlanSteps(
  graph: DerivedPlanGraph,
  palsById: ReadonlyMap<string, PalRecord>,
): string {
  const name = (id: string) => palsById.get(id)?.name.zhHans ?? id
  const lines: string[] = []
  for (const component of graph.components) {
    lines.push(`${component.id} · 目标：${component.targetIds.map(name).join('、')}`)
    for (const step of graph.steps.filter((item) => item.componentId === component.id)) {
      lines.push(`${step.number}. ${name(step.recipe.parentAId)} + ${name(step.recipe.parentBId)} → ${name(step.recipe.childId)}（配方 #${step.recipe.recipeIndex}${step.prerequisiteSteps.length ? `；前置 ${step.prerequisiteSteps.join('、')}` : ''}）`)
    }
  }
  if (graph.invalidRelations.length) {
    lines.push('失效关系：')
    for (const relation of graph.invalidRelations) {
      lines.push(`- 配方 #${relation.snapshot.recipeIndex}：${name(relation.snapshot.parentAId)} + ${name(relation.snapshot.parentBId)} → ${name(relation.snapshot.childId)}`)
    }
  }
  return lines.join('\n')
}
