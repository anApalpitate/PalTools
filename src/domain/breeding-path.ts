import type { BreedingIndexPayload } from './types'

export interface BreedingTreeNode {
  nodeId: string
  palId: string
  generation: number
  recipeIndex: number | null
  alternativeRecipeIndexes: number[]
  parentA?: BreedingTreeNode
  parentB?: BreedingTreeNode
}

export type PathPlanStatus =
  | 'ok'
  | 'empty-start'
  | 'unreachable'
  | 'over-limit'
  | 'no-exact'

export interface PathPlanResult {
  status: PathPlanStatus
  minGeneration: number | null
  tree: BreedingTreeNode | null
  message: string
}

export interface PathPlanRequest {
  index: BreedingIndexPayload
  startIds: string[]
  targetId: string
  mode: 'minimum' | 'exact'
  exactGeneration?: number
  maxDisplayGeneration: number
  preferredRecipes?: Record<string, number>
}

interface MinimumState {
  generation: number
  breedCount: number
  intermediateMask: bigint
  intermediateCount: number
  recipeIndex: number | null
}

function recipeSortKey(
  index: BreedingIndexPayload,
  recipeIndex: number,
): string {
  const [a, b, child] = index.recipes[recipeIndex]
  return `${index.palIds[a]}\0${index.palIds[b]}\0${index.palIds[child]}`
}

function isBetterMinimum(
  nextGeneration: number,
  nextBreedCount: number,
  nextIntermediateMask: bigint,
  current: MinimumState | undefined,
  nextRecipeKey: string,
  currentRecipeKey: string,
): boolean {
  if (!current) return true
  if (nextGeneration !== current.generation) {
    return nextGeneration < current.generation
  }
  if (nextBreedCount !== current.breedCount) {
    return nextBreedCount < current.breedCount
  }
  if (nextIntermediateMask !== current.intermediateMask) {
    const nextIntermediateCount = countBits(nextIntermediateMask)
    if (nextIntermediateCount !== current.intermediateCount) {
      return nextIntermediateCount < current.intermediateCount
    }
  }
  return nextRecipeKey < currentRecipeKey
}

function countBits(value: bigint): number {
  let remaining = value
  let count = 0
  while (remaining > 0n) {
    remaining &= remaining - 1n
    count += 1
  }
  return count
}

function minimumStates(
  index: BreedingIndexPayload,
  startIndexes: ReadonlySet<number>,
): Array<MinimumState | undefined> {
  const states: Array<MinimumState | undefined> = Array(index.palIds.length)
  const recipeSortKeys = index.recipes.map((_, recipeIndex) =>
    recipeSortKey(index, recipeIndex),
  )
  for (const palIndex of startIndexes) {
    states[palIndex] = {
      generation: 0,
      breedCount: 0,
      intermediateMask: 0n,
      intermediateCount: 0,
      recipeIndex: null,
    }
  }

  for (let pass = 0; pass < index.palIds.length; pass += 1) {
    let changed = false
    for (let recipeIndex = 0; recipeIndex < index.recipes.length; recipeIndex += 1) {
      const [parentA, parentB, child] = index.recipes[recipeIndex]
      const stateA = states[parentA]
      const stateB = states[parentB]
      if (!stateA || !stateB) continue
      const nextGeneration =
        Math.max(stateA.generation, stateB.generation) + 1
      const nextBreedCount =
        stateA.breedCount + stateB.breedCount + 1
      const nextIntermediateMask =
        stateA.intermediateMask |
        stateB.intermediateMask |
        (1n << BigInt(child))
      const current = states[child]
      if (
        isBetterMinimum(
          nextGeneration,
          nextBreedCount,
          nextIntermediateMask,
          current,
          recipeSortKeys[recipeIndex],
          current?.recipeIndex === null || current?.recipeIndex === undefined
            ? ''
            : recipeSortKeys[current.recipeIndex],
        )
      ) {
        states[child] = {
          generation: nextGeneration,
          breedCount: nextBreedCount,
          intermediateMask: nextIntermediateMask,
          intermediateCount: countBits(nextIntermediateMask),
          recipeIndex,
        }
        changed = true
      }
    }
    if (!changed) break
  }
  return states
}

function assignNodeIds(node: BreedingTreeNode, nodeId = 'root'): BreedingTreeNode {
  return {
    ...node,
    nodeId,
    parentA: node.parentA
      ? assignNodeIds(node.parentA, `${nodeId}.a`)
      : undefined,
    parentB: node.parentB
      ? assignNodeIds(node.parentB, `${nodeId}.b`)
      : undefined,
  }
}

function buildMinimumTree(
  index: BreedingIndexPayload,
  states: Array<MinimumState | undefined>,
  palIndex: number,
): BreedingTreeNode | null {
  const state = states[palIndex]
  if (!state) return null
  if (state.recipeIndex === null) {
    return {
      nodeId: '',
      palId: index.palIds[palIndex],
      generation: 0,
      recipeIndex: null,
      alternativeRecipeIndexes: [],
    }
  }
  const [parentA, parentB] = index.recipes[state.recipeIndex]
  const alternatives = (
    index.parentsByChild[String(palIndex)] ?? []
  ).filter((recipeIndex) => {
    const [a, b] = index.recipes[recipeIndex]
    const aState = states[a]
    const bState = states[b]
    return (
      aState !== undefined &&
      bState !== undefined &&
      Math.max(aState.generation, bState.generation) + 1 === state.generation
    )
  })
  const treeA = buildMinimumTree(index, states, parentA)
  const treeB = buildMinimumTree(index, states, parentB)
  if (!treeA || !treeB) return null
  return {
    nodeId: '',
    palId: index.palIds[palIndex],
    generation: state.generation,
    recipeIndex: state.recipeIndex,
    alternativeRecipeIndexes: alternatives,
    parentA: treeA,
    parentB: treeB,
  }
}

function feasibleDepths(
  index: BreedingIndexPayload,
  startIndexes: ReadonlySet<number>,
  maxDepth: number,
): boolean[][] {
  const feasible = Array.from({ length: index.palIds.length }, () =>
    Array(maxDepth + 1).fill(false) as boolean[],
  )
  for (const palIndex of startIndexes) feasible[palIndex][0] = true
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    for (const [parentA, parentB, child] of index.recipes) {
      for (let otherDepth = 0; otherDepth < depth; otherDepth += 1) {
        if (
          (feasible[parentA][depth - 1] &&
            feasible[parentB][otherDepth]) ||
          (feasible[parentB][depth - 1] &&
            feasible[parentA][otherDepth])
        ) {
          feasible[child][depth] = true
          break
        }
      }
    }
  }
  return feasible
}

interface ExactCandidate {
  recipeIndex: number
  depthA: number
  depthB: number
}

interface BuiltExact {
  tree: BreedingTreeNode
  breedCount: number
  intermediates: Set<number>
}

function exactCandidates(
  index: BreedingIndexPayload,
  feasible: boolean[][],
  palIndex: number,
  depth: number,
): ExactCandidate[] {
  const candidates: ExactCandidate[] = []
  for (const recipeIndex of index.parentsByChild[String(palIndex)] ?? []) {
    const [parentA, parentB] = index.recipes[recipeIndex]
    for (let otherDepth = 0; otherDepth < depth; otherDepth += 1) {
      if (
        feasible[parentA][depth - 1] &&
        feasible[parentB][otherDepth]
      ) {
        candidates.push({
          recipeIndex,
          depthA: depth - 1,
          depthB: otherDepth,
        })
      }
      if (
        otherDepth !== depth - 1 &&
        feasible[parentA][otherDepth] &&
        feasible[parentB][depth - 1]
      ) {
        candidates.push({
          recipeIndex,
          depthA: otherDepth,
          depthB: depth - 1,
        })
      }
    }
  }
  return candidates.sort(
    (a, b) =>
      a.depthA + a.depthB - (b.depthA + b.depthB) ||
      recipeSortKey(index, a.recipeIndex).localeCompare(
        recipeSortKey(index, b.recipeIndex),
      ),
  )
}

function buildExactTree(
  index: BreedingIndexPayload,
  feasible: boolean[][],
  startIndexes: ReadonlySet<number>,
  palIndex: number,
  depth: number,
  ancestors: ReadonlySet<number>,
  nodePath: string,
  preferredRecipes: Readonly<Record<string, number>>,
  budget: { remaining: number },
): BuiltExact | null {
  budget.remaining -= 1
  if (budget.remaining < 0 || ancestors.has(palIndex)) return null
  if (depth === 0) {
    if (!startIndexes.has(palIndex)) return null
    return {
      tree: {
        nodeId: nodePath,
        palId: index.palIds[palIndex],
        generation: 0,
        recipeIndex: null,
        alternativeRecipeIndexes: [],
      },
      breedCount: 0,
      intermediates: new Set(),
    }
  }
  const preferred = preferredRecipes[nodePath]
  const candidates = exactCandidates(index, feasible, palIndex, depth).filter(
    (candidate) =>
      preferred === undefined || candidate.recipeIndex === preferred,
  )
  const nextAncestors = new Set(ancestors)
  nextAncestors.add(palIndex)
  let best: BuiltExact | null = null
  const viableRecipeIndexes = new Set<number>()
  for (const candidate of candidates) {
    const [parentA, parentB] = index.recipes[candidate.recipeIndex]
    const builtA = buildExactTree(
      index,
      feasible,
      startIndexes,
      parentA,
      candidate.depthA,
      nextAncestors,
      `${nodePath}.a`,
      preferredRecipes,
      budget,
    )
    if (!builtA) continue
    const builtB = buildExactTree(
      index,
      feasible,
      startIndexes,
      parentB,
      candidate.depthB,
      nextAncestors,
      `${nodePath}.b`,
      preferredRecipes,
      budget,
    )
    if (!builtB) continue
    viableRecipeIndexes.add(candidate.recipeIndex)
    const intermediates = new Set([
      ...builtA.intermediates,
      ...builtB.intermediates,
      palIndex,
    ])
    const built: BuiltExact = {
      tree: {
        nodeId: nodePath,
        palId: index.palIds[palIndex],
        generation: depth,
        recipeIndex: candidate.recipeIndex,
        alternativeRecipeIndexes: [],
        parentA: builtA.tree,
        parentB: builtB.tree,
      },
      breedCount: builtA.breedCount + builtB.breedCount + 1,
      intermediates,
    }
    if (
      !best ||
      built.breedCount < best.breedCount ||
      (built.breedCount === best.breedCount &&
        built.intermediates.size < best.intermediates.size) ||
      (built.breedCount === best.breedCount &&
        built.intermediates.size === best.intermediates.size &&
        recipeSortKey(index, candidate.recipeIndex) <
          recipeSortKey(index, best.tree.recipeIndex ?? 0))
    ) {
      best = built
    }
  }
  if (best) {
    best.tree.alternativeRecipeIndexes = [...viableRecipeIndexes].sort(
      (a, b) => recipeSortKey(index, a).localeCompare(recipeSortKey(index, b)),
    )
  }
  return best
}

export function planBreedingPath(request: PathPlanRequest): PathPlanResult {
  const { index } = request
  const startIndexes = new Set(
    request.startIds
      .map((id) => index.palIds.indexOf(id))
      .filter((value) => value >= 0),
  )
  if (startIndexes.size === 0) {
    return {
      status: 'empty-start',
      minGeneration: null,
      tree: null,
      message: '请先选择至少一种第 0 代帕鲁。',
    }
  }
  const targetIndex = index.palIds.indexOf(request.targetId)
  if (targetIndex < 0) {
    return {
      status: 'unreachable',
      minGeneration: null,
      tree: null,
      message: '目标不在当前正式版配方矩阵中。',
    }
  }
  const states = minimumStates(index, startIndexes)
  const targetState = states[targetIndex]
  if (!targetState) {
    return {
      status: 'unreachable',
      minGeneration: null,
      tree: null,
      message: '当前起始集合无法配种得到该目标。',
    }
  }
  const minGeneration = targetState.generation
  if (request.mode === 'minimum') {
    if (minGeneration > request.maxDisplayGeneration) {
      return {
        status: 'over-limit',
        minGeneration,
        tree: null,
        message: `最少需要 ${minGeneration} 代，超过当前可视化上限 ${request.maxDisplayGeneration} 代。`,
      }
    }
    return {
      status: 'ok',
      minGeneration,
      tree: assignNodeIds(
        buildMinimumTree(index, states, targetIndex) as BreedingTreeNode,
      ),
      message: `最少需要 ${minGeneration} 代。`,
    }
  }

  const exactGeneration = request.exactGeneration ?? 1
  if (exactGeneration < minGeneration) {
    return {
      status: 'no-exact',
      minGeneration,
      tree: null,
      message: `目标最少需要 ${minGeneration} 代，无法在第 ${exactGeneration} 代获得。`,
    }
  }
  if (exactGeneration > request.maxDisplayGeneration) {
    return {
      status: 'over-limit',
      minGeneration,
      tree: null,
      message: `指定代数超过当前可视化上限 ${request.maxDisplayGeneration}。`,
    }
  }
  const feasible = feasibleDepths(index, startIndexes, exactGeneration)
  if (!feasible[targetIndex][exactGeneration]) {
    return {
      status: 'no-exact',
      minGeneration,
      tree: null,
      message: `第 ${exactGeneration} 代不存在符合条件的配种树。`,
    }
  }
  const built = buildExactTree(
    index,
    feasible,
    startIndexes,
    targetIndex,
    exactGeneration,
    new Set(),
    'root',
    request.preferredRecipes ?? {},
    { remaining: 250_000 },
  )
  if (!built) {
    return {
      status: 'no-exact',
      minGeneration,
      tree: null,
      message: `第 ${exactGeneration} 代不存在无循环的配种树。`,
    }
  }
  return {
    status: 'ok',
    minGeneration,
    tree: built.tree,
    message: `已生成第 ${exactGeneration} 代推荐配种树。`,
  }
}
