import type { BreedingRecipeMatch } from './types'

export type BreedingGraphNodeMode = 'merged' | 'instance'

export interface BreedingGraphComponent {
  id: string
  recipeIndexes: readonly number[]
  palIds: readonly string[]
}

export interface GraphNodeInput {
  id: string
  kind: 'pal' | 'occurrence' | 'junction'
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
  role: 'parent' | 'parents' | 'dependency'
  recipeIndex?: number
  actionAnchor?: boolean
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

function buildMergedGraph(
  recipes: readonly BreedingRecipeMatch[],
  components: readonly BreedingGraphComponent[],
): BreedingGraphInput {
  const palComponent = palComponentMap(components)
  const palIds = [...new Set(recipes.flatMap((recipe) => [recipe.parentAId, recipe.parentBId, recipe.childId]))]
    .sort((a, b) => a.localeCompare(b))
  const nodes = palIds
    .map<GraphNodeInput>((palId) => ({
      id: `pal:${palId}`,
      kind: 'pal',
      label: palId,
      palId,
      componentId: palComponent.get(palId) ?? 'component-0',
      width: 176,
      height: 70,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
  const edges = recipes.flatMap<GraphEdgeInput>((recipe) => {
    const parentIds = [recipe.parentAId, recipe.parentBId]
      .sort((left, right) => left.localeCompare(right))
    if (parentIds[0] === parentIds[1]) {
      return [{
        id: `edge:${recipe.recipeIndex}:parents`,
        source: `pal:${parentIds[0]}`,
        target: `pal:${recipe.childId}`,
        role: 'parents',
        recipeIndex: recipe.recipeIndex,
        actionAnchor: true,
      }]
    }
    return parentIds.map((parentId, parentIndex) => ({
      id: `edge:${recipe.recipeIndex}:parent:${parentIndex}`,
      source: `pal:${parentId}`,
      target: `pal:${recipe.childId}`,
      role: 'parent',
      recipeIndex: recipe.recipeIndex,
      actionAnchor: parentIndex === 0,
    }))
  }).sort((a, b) => a.id.localeCompare(b.id))
  return { nodes, edges }
}

function buildInstanceGraph(
  recipes: readonly BreedingRecipeMatch[],
  components: readonly BreedingGraphComponent[],
): BreedingGraphInput {
  const palComponent = palComponentMap(components)
  const palIds = [...new Set(recipes.flatMap((recipe) => [recipe.parentAId, recipe.parentBId, recipe.childId]))]
    .sort((a, b) => a.localeCompare(b))
  const nodes: GraphNodeInput[] = palIds.map((palId) => ({
    id: `junction:${palId}`,
    kind: 'junction',
    label: palId,
    palId,
    componentId: palComponent.get(palId) ?? 'component-0',
    width: 154,
    height: 66,
  }))
  const edges: GraphEdgeInput[] = []
  for (const recipe of recipes) {
    const componentId = componentForRecipe(recipe.recipeIndex, components)
    const parentIds = [recipe.parentAId, recipe.parentBId]
      .sort((left, right) => left.localeCompare(right))
    const occurrences = [
      ['parent:0', parentIds[0], '亲本'],
      ['parent:1', parentIds[1], '亲本'],
      ['child', recipe.childId, '子代'],
    ] as const
    for (const [slot, palId, role] of occurrences) {
      nodes.push({
        id: `occ:${recipe.recipeIndex}:${slot}`,
        kind: 'occurrence',
        label: `${palId} · ${role}`,
        palId,
        recipeIndex: recipe.recipeIndex,
        componentId,
        width: 164,
        height: 66,
      })
    }
    const relationshipEdges: GraphEdgeInput[] = parentIds[0] === parentIds[1]
      ? [{
          id: `edge:${recipe.recipeIndex}:parents`,
          source: `occ:${recipe.recipeIndex}:parent:0`,
          target: `occ:${recipe.recipeIndex}:child`,
          role: 'parents',
          recipeIndex: recipe.recipeIndex,
          actionAnchor: true,
        }]
      : parentIds.map((_, parentIndex) => ({
          id: `edge:${recipe.recipeIndex}:parent:${parentIndex}`,
          source: `occ:${recipe.recipeIndex}:parent:${parentIndex}`,
          target: `occ:${recipe.recipeIndex}:child`,
          role: 'parent',
          recipeIndex: recipe.recipeIndex,
          actionAnchor: parentIndex === 0,
        }))
    edges.push(
      ...relationshipEdges,
      { id: `dep:${recipe.recipeIndex}:parent:0`, source: `junction:${parentIds[0]}`, target: `occ:${recipe.recipeIndex}:parent:0`, role: 'dependency' },
      { id: `dep:${recipe.recipeIndex}:parent:1`, source: `junction:${parentIds[1]}`, target: `occ:${recipe.recipeIndex}:parent:1`, role: 'dependency' },
      { id: `dep:${recipe.recipeIndex}:child`, source: `occ:${recipe.recipeIndex}:child`, target: `junction:${recipe.childId}`, role: 'dependency' },
    )
  }
  return {
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => a.id.localeCompare(b.id)),
  }
}
