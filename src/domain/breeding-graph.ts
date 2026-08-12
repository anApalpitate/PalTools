import type { BreedingRecipeMatch } from './types'

export type BreedingGraphNodeMode = 'merged' | 'instance'
export type SpeciesJunctionRole = 'source' | 'result' | 'intermediate'

export interface BreedingGraphComponent {
  id: string
  recipeIndexes: readonly number[]
  palIds: readonly string[]
}

export interface GraphNodeInput {
  id: string
  kind: 'pal' | 'occurrence' | 'speciesJunction' | 'recipeJunction'
  label: string
  palId?: string
  recipeIndex?: number
  junctionRole?: SpeciesJunctionRole
  componentId: string
  width: number
  height: number
}

export interface GraphEdgeInput {
  id: string
  source: string
  target: string
  role: 'parentInput' | 'offspringOutput' | 'dependency'
  recipeIndex?: number
  multiplicity?: 2
}

export interface BreedingGraphInput {
  nodes: GraphNodeInput[]
  edges: GraphEdgeInput[]
}

export function buildBreedingGraph(
  recipes: readonly BreedingRecipeMatch[],
  components: readonly BreedingGraphComponent[],
  nodeMode: BreedingGraphNodeMode,
): BreedingGraphInput {
  const stableRecipes = [...recipes].sort((left, right) => left.recipeIndex - right.recipeIndex)
  return nodeMode === 'merged'
    ? buildMergedGraph(stableRecipes, components)
    : buildInstanceGraph(stableRecipes, components)
}

export function projectBreedingGraph(
  graph: BreedingGraphInput,
  visibleRecipeIndexes: ReadonlySet<number>,
): BreedingGraphInput {
  const visibleEdges = graph.edges.filter((edge) =>
    edge.recipeIndex === undefined || visibleRecipeIndexes.has(edge.recipeIndex),
  )
  const connectedNodeIds = new Set(visibleEdges.flatMap((edge) => [edge.source, edge.target]))
  const nodes = graph.nodes.filter((node) =>
      connectedNodeIds.has(node.id) &&
      (node.recipeIndex === undefined || visibleRecipeIndexes.has(node.recipeIndex)),
    )
  const edges = visibleEdges.filter((edge) =>
    connectedNodeIds.has(edge.source) && connectedNodeIds.has(edge.target),
  )
  return withSpeciesJunctionRoles({ nodes, edges })
}

function withSpeciesJunctionRoles(graph: BreedingGraphInput): BreedingGraphInput {
  const parentSpecies = new Set<string>()
  const childSpecies = new Set<string>()
  for (const edge of graph.edges) {
    if (edge.role !== 'dependency') continue
    if (edge.source.startsWith('species:')) parentSpecies.add(edge.source)
    if (edge.target.startsWith('species:')) childSpecies.add(edge.target)
  }
  return {
    nodes: graph.nodes.map((node) => {
      if (node.kind !== 'speciesJunction') return node
      const isParent = parentSpecies.has(node.id)
      const isChild = childSpecies.has(node.id)
      const junctionRole: SpeciesJunctionRole = isParent && isChild
        ? 'intermediate'
        : isParent
          ? 'source'
          : 'result'
      return { ...node, junctionRole }
    }),
    edges: graph.edges,
  }
}

export function recipeIndexesForTarget(
  recipes: readonly BreedingRecipeMatch[],
  targetId: string,
): Set<number> {
  const stableRecipes = [...recipes].sort((left, right) => left.recipeIndex - right.recipeIndex)
  const visible = new Set<number>()
  const needed = new Set([targetId])
  let changed = true
  while (changed) {
    changed = false
    for (const recipe of stableRecipes) {
      if (needed.has(recipe.childId) && !visible.has(recipe.recipeIndex)) {
        visible.add(recipe.recipeIndex)
        if (!needed.has(recipe.parentAId)) { needed.add(recipe.parentAId); changed = true }
        if (!needed.has(recipe.parentBId)) { needed.add(recipe.parentBId); changed = true }
      }
    }
  }
  return visible
}

function componentForRecipe(
  recipeIndex: number,
  components: readonly BreedingGraphComponent[],
): string {
  return components.find((component) => component.recipeIndexes.includes(recipeIndex))?.id ?? 'component-0'
}

function palComponentMap(components: readonly BreedingGraphComponent[]): Map<string, string> {
  return new Map(
    components.flatMap((component) => component.palIds.map((id) => [id, component.id] as const)),
  )
}

function canonicalParentIds(recipe: BreedingRecipeMatch): string[] {
  return [...new Set([recipe.parentAId, recipe.parentBId].sort((left, right) => left.localeCompare(right)))]
}

function recipeJunction(recipe: BreedingRecipeMatch, componentId: string): GraphNodeInput {
  return {
    id: `recipe:${recipe.recipeIndex}`,
    kind: 'recipeJunction',
    label: `配方 #${recipe.recipeIndex}`,
    recipeIndex: recipe.recipeIndex,
    componentId,
    width: 14,
    height: 14,
  }
}

function recipeRelationshipEdges(
  recipe: BreedingRecipeMatch,
  parentNodeIds: readonly string[],
  childNodeId: string,
): GraphEdgeInput[] {
  const junctionId = `recipe:${recipe.recipeIndex}`
  const selfBreeding = recipe.parentAId === recipe.parentBId
  return [
    ...parentNodeIds.map((parentNodeId, parentIndex) => ({
      id: `edge:${recipe.recipeIndex}:input:${parentIndex}`,
      source: parentNodeId,
      target: junctionId,
      role: 'parentInput' as const,
      recipeIndex: recipe.recipeIndex,
      ...(selfBreeding ? { multiplicity: 2 as const } : {}),
    })),
    {
      id: `edge:${recipe.recipeIndex}:output`,
      source: junctionId,
      target: childNodeId,
      role: 'offspringOutput' as const,
      recipeIndex: recipe.recipeIndex,
    },
  ]
}

function buildMergedGraph(
  recipes: readonly BreedingRecipeMatch[],
  components: readonly BreedingGraphComponent[],
): BreedingGraphInput {
  const palComponent = palComponentMap(components)
  const palIds = [...new Set(recipes.flatMap((recipe) => [recipe.parentAId, recipe.parentBId, recipe.childId]))]
    .sort((a, b) => a.localeCompare(b))
  const nodes: GraphNodeInput[] = palIds.map((palId) => ({
    id: `pal:${palId}`,
    kind: 'pal',
    label: palId,
    palId,
    componentId: palComponent.get(palId) ?? 'component-0',
    width: 176,
    height: 70,
  }))
  const edges: GraphEdgeInput[] = []
  for (const recipe of recipes) {
    const componentId = componentForRecipe(recipe.recipeIndex, components)
    const parentIds = canonicalParentIds(recipe)
    nodes.push(recipeJunction(recipe, componentId))
    edges.push(...recipeRelationshipEdges(
      recipe,
      parentIds.map((parentId) => `pal:${parentId}`),
      `pal:${recipe.childId}`,
    ))
  }
  return {
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => a.id.localeCompare(b.id)),
  }
}

function buildInstanceGraph(
  recipes: readonly BreedingRecipeMatch[],
  components: readonly BreedingGraphComponent[],
): BreedingGraphInput {
  const palComponent = palComponentMap(components)
  const palIds = [...new Set(recipes.flatMap((recipe) => [recipe.parentAId, recipe.parentBId, recipe.childId]))]
    .sort((a, b) => a.localeCompare(b))
  const nodes: GraphNodeInput[] = palIds.map((palId) => ({
    id: `species:${palId}`,
    kind: 'speciesJunction',
    label: palId,
    palId,
    componentId: palComponent.get(palId) ?? 'component-0',
    width: 154,
    height: 66,
  }))
  const edges: GraphEdgeInput[] = []
  for (const recipe of recipes) {
    const componentId = componentForRecipe(recipe.recipeIndex, components)
    const parentIds = canonicalParentIds(recipe)
    const parentNodeIds = parentIds.map((parentId, parentIndex) => {
      const nodeId = `occ:${recipe.recipeIndex}:parent:${parentIndex}`
      nodes.push({
        id: nodeId,
        kind: 'occurrence',
        label: `${parentId} · 亲本`,
        palId: parentId,
        recipeIndex: recipe.recipeIndex,
        componentId,
        width: 164,
        height: 66,
      })
      edges.push({
        id: `dep:${recipe.recipeIndex}:parent:${parentIndex}`,
        source: `species:${parentId}`,
        target: nodeId,
        role: 'dependency',
        recipeIndex: recipe.recipeIndex,
      })
      return nodeId
    })
    const childNodeId = `occ:${recipe.recipeIndex}:child`
    nodes.push(
      recipeJunction(recipe, componentId),
      {
        id: childNodeId,
        kind: 'occurrence',
        label: `${recipe.childId} · 子代`,
        palId: recipe.childId,
        recipeIndex: recipe.recipeIndex,
        componentId,
        width: 164,
        height: 66,
      },
    )
    edges.push(
      ...recipeRelationshipEdges(recipe, parentNodeIds, childNodeId),
      {
        id: `dep:${recipe.recipeIndex}:child`,
        source: childNodeId,
        target: `species:${recipe.childId}`,
        role: 'dependency',
        recipeIndex: recipe.recipeIndex,
      },
    )
  }
  return withSpeciesJunctionRoles({
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => a.id.localeCompare(b.id)),
  })
}
