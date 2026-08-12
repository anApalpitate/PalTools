import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  DEFAULT_PLAN_ID,
  derivePlanGraph,
  resolveWorkspaceRelations,
} from '../src/domain/breeding-workspace'
import type {
  BreedingWorkspace,
  PlanRecord,
  StoredRelation,
  WorkspaceNodeMode,
  WorkspaceView,
} from '../src/domain/breeding-workspace'
import type {
  BreedingIndexPayload,
  BreedingRecipeMatch,
  DatasetManifest,
  PalRecord,
} from '../src/domain/types'
import { createWorkspaceExport, parseWorkspaceImport } from '../src/storage/breeding-workspace'

const ROOT = process.cwd()
const OUTPUT_DIRECTORY = path.join(ROOT, '.tmp', 'breeding-workspace-samples')
const FIXED_TIME = '2026-08-13T00:00:00.000Z'

interface RankedRecipe extends BreedingRecipeMatch {
  parentAIndex: number
  parentBIndex: number
  childIndex: number
}

interface SampleDefinition {
  number: string
  fileName: string
  name: string
  recipes: RankedRecipe[]
  expectedComponents: number
  minimumTargets: number
  minimumDepth: number
  lastView: WorkspaceView
  nodeMode: WorkspaceNodeMode
  focus: string
}

const [packagePayload, manifest, breedingIndex, palsPayload] = await Promise.all([
  readJson<{ version: string }>('package.json'),
  readJson<DatasetManifest>('public/data/manifest.json'),
  readJson<BreedingIndexPayload>('public/data/breeding-index.json'),
  readJson<{ pals: PalRecord[] }>('public/data/pals.json'),
])
const appVersion = packagePayload.version

const allRecipes = breedingIndex.recipes.map(([parentAIndex, parentBIndex, childIndex], recipeIndex) => ({
  recipeIndex,
  parentAIndex,
  parentBIndex,
  childIndex,
  parentAId: breedingIndex.palIds[parentAIndex],
  parentBId: breedingIndex.palIds[parentBIndex],
  childId: breedingIndex.palIds[childIndex],
}))
const rankedRecipes = allRecipes.filter((recipe) =>
  recipe.parentAIndex < recipe.childIndex &&
  recipe.parentBIndex < recipe.childIndex &&
  recipe.childId !== recipe.parentAId &&
  recipe.childId !== recipe.parentBId,
)

const deep20 = deepestChain(20)
const branching36 = branchingAncestors(36, 8)
const multiComponent60 = buildMultiComponentSample()
const large120 = buildLargeSample()

const samples: SampleDefinition[] = [
  {
    number: '01',
    fileName: '01-deep-chain-20-generations.json',
    name: '样例 01 · 20 代深链',
    recipes: deep20,
    expectedComponents: 1,
    minimumTargets: 1,
    minimumDepth: 20,
    lastView: 'graph',
    nodeMode: 'instance',
    focus: '实例图上下汇合分界、纵向层级、步骤前置关系',
  },
  {
    number: '02',
    fileName: '02-branching-convergence-36-relations.json',
    name: '样例 02 · 分支汇合',
    recipes: branching36,
    expectedComponents: 1,
    minimumTargets: 1,
    minimumDepth: 8,
    lastView: 'graph',
    nodeMode: 'instance',
    focus: '多分支汇合、线路交叉、中间物种双分界',
  },
  {
    number: '03',
    fileName: '03-multi-target-multi-component-60-relations.json',
    name: '样例 03 · 多目标多分量',
    recipes: multiComponent60,
    expectedComponents: 3,
    minimumTargets: 4,
    minimumDepth: 12,
    lastView: 'steps',
    nodeMode: 'instance',
    focus: '3 个分量、目标切换、步骤分组、关系列表虚拟化',
  },
  {
    number: '04',
    fileName: '04-large-collapsed-120-relations.json',
    name: '样例 04 · 120 条大型方案',
    recipes: large120,
    expectedComponents: 1,
    minimumTargets: 2,
    minimumDepth: 12,
    lastView: 'graph',
    nodeMode: 'instance',
    focus: '超过 100 条后的目标折叠、展开全部与布局响应',
  },
]

await mkdir(OUTPUT_DIRECTORY, { recursive: true })
const summaries = await Promise.all(samples.map(writeAndValidateSample))
await Promise.all(summaries.map(async ({ definition, payload }) => {
  await writeFile(
    path.join(OUTPUT_DIRECTORY, definition.fileName),
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8',
  )
}))
await writeFile(path.join(OUTPUT_DIRECTORY, 'README.md'), buildReadme(summaries), 'utf8')

console.log(`Generated ${samples.length} breeding workspace samples in ${OUTPUT_DIRECTORY}`)

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), 'utf8')) as T
}

function deepestChain(length: number, forbidden = new Set<number>()): RankedRecipe[] {
  const depths = Array<number>(breedingIndex.palIds.length).fill(0)
  const choices = Array<RankedRecipe | undefined>(breedingIndex.palIds.length)
  const recipesByChild = groupByChild()
  for (let childIndex = 0; childIndex < breedingIndex.palIds.length; childIndex += 1) {
    if (forbidden.has(childIndex)) continue
    for (const recipe of recipesByChild[childIndex]) {
      if (forbidden.has(recipe.parentAIndex) || forbidden.has(recipe.parentBIndex)) continue
      const depth = Math.max(depths[recipe.parentAIndex], depths[recipe.parentBIndex]) + 1
      if (depth > depths[childIndex] || (depth === depths[childIndex] && recipe.recipeIndex < (choices[childIndex]?.recipeIndex ?? Number.POSITIVE_INFINITY))) {
        depths[childIndex] = depth
        choices[childIndex] = recipe
      }
    }
  }
  let cursor = depths.indexOf(Math.max(...depths))
  const chain: RankedRecipe[] = []
  while (choices[cursor]) {
    const recipe = choices[cursor] as RankedRecipe
    chain.push(recipe)
    cursor = depths[recipe.parentAIndex] >= depths[recipe.parentBIndex]
      ? recipe.parentAIndex
      : recipe.parentBIndex
  }
  chain.reverse()
  invariant(chain.length >= length, `无法构造 ${length} 代深链。`)
  return chain.slice(-length)
}

function branchingAncestors(count: number, minimumParentDepth: number): RankedRecipe[] {
  const { depths, choices } = rankedChoices()
  const roots = rankedRecipes.filter((recipe) =>
    depths[recipe.parentAIndex] >= minimumParentDepth && depths[recipe.parentBIndex] >= minimumParentDepth,
  ).sort((left, right) =>
    Math.min(depths[right.parentAIndex], depths[right.parentBIndex]) - Math.min(depths[left.parentAIndex], depths[left.parentBIndex]) ||
    left.recipeIndex - right.recipeIndex,
  )
  for (const root of roots) {
    const selected = new Map<number, RankedRecipe>([[root.recipeIndex, root]])
    const produced = new Set([root.childIndex])
    const queue = [root.parentAIndex, root.parentBIndex]
    while (queue.length && selected.size < count) {
      queue.sort((left, right) => depths[right] - depths[left] || left - right)
      const childIndex = queue.shift() as number
      if (produced.has(childIndex) || !choices[childIndex]) continue
      const recipe = choices[childIndex] as RankedRecipe
      selected.set(recipe.recipeIndex, recipe)
      produced.add(childIndex)
      queue.push(recipe.parentAIndex, recipe.parentBIndex)
    }
    if (selected.size === count) return stableRecipes([...selected.values()])
  }
  throw new Error(`无法构造 ${count} 条分支汇合关系。`)
}

function buildMultiComponentSample(): RankedRecipe[] {
  const first = deepestChain(19)
  const firstPalIds = recipePalIndexes(first)
  const second = deepestChain(19, firstPalIds)
  const secondPalIds = recipePalIndexes(second)
  const third = deepestChain(20, new Set([...firstPalIds, ...secondPalIds]))
  const allCorePalIds = new Set([...firstPalIds, ...secondPalIds, ...recipePalIndexes(third)])
  const branches = terminalBranches(first, 2, new Set([...secondPalIds, ...recipePalIndexes(third)]), allCorePalIds)
  return stableRecipes([...first, ...branches, ...second, ...third])
}

function buildLargeSample(): RankedRecipe[] {
  const core = deepestChain(100)
  const branches = terminalBranches(core, 20, new Set(), recipePalIndexes(core))
  return stableRecipes([...core, ...branches])
}

function terminalBranches(
  core: RankedRecipe[],
  count: number,
  forbidden: ReadonlySet<number>,
  reserved: ReadonlySet<number>,
): RankedRecipe[] {
  const coreIds = recipePalIndexes(core)
  const childIds = new Set<number>()
  const branches: RankedRecipe[] = []
  for (const recipe of rankedRecipes) {
    if (branches.length === count) break
    if (core.some((item) => item.recipeIndex === recipe.recipeIndex)) continue
    if (!coreIds.has(recipe.parentAIndex) && !coreIds.has(recipe.parentBIndex)) continue
    if (forbidden.has(recipe.parentAIndex) || forbidden.has(recipe.parentBIndex) || forbidden.has(recipe.childIndex)) continue
    if (reserved.has(recipe.childIndex) || childIds.has(recipe.childIndex)) continue
    if (childIds.has(recipe.parentAIndex) || childIds.has(recipe.parentBIndex)) continue
    branches.push(recipe)
    childIds.add(recipe.childIndex)
  }
  invariant(branches.length === count, `只能构造 ${branches.length}/${count} 条终端分支。`)
  return branches
}

function rankedChoices(): { depths: number[]; choices: Array<RankedRecipe | undefined> } {
  const depths = Array<number>(breedingIndex.palIds.length).fill(0)
  const choices = Array<RankedRecipe | undefined>(breedingIndex.palIds.length)
  const recipesByChild = groupByChild()
  for (let childIndex = 0; childIndex < breedingIndex.palIds.length; childIndex += 1) {
    for (const recipe of recipesByChild[childIndex]) {
      const depth = Math.max(depths[recipe.parentAIndex], depths[recipe.parentBIndex]) + 1
      if (depth > depths[childIndex] || (depth === depths[childIndex] && recipe.recipeIndex < (choices[childIndex]?.recipeIndex ?? Number.POSITIVE_INFINITY))) {
        depths[childIndex] = depth
        choices[childIndex] = recipe
      }
    }
  }
  return { depths, choices }
}

function groupByChild(): RankedRecipe[][] {
  const result = Array.from({ length: breedingIndex.palIds.length }, () => [] as RankedRecipe[])
  for (const recipe of rankedRecipes) result[recipe.childIndex].push(recipe)
  for (const recipes of result) recipes.sort((left, right) => left.recipeIndex - right.recipeIndex)
  return result
}

function recipePalIndexes(recipes: readonly RankedRecipe[]): Set<number> {
  return new Set(recipes.flatMap((recipe) => [recipe.parentAIndex, recipe.parentBIndex, recipe.childIndex]))
}

function stableRecipes(recipes: RankedRecipe[]): RankedRecipe[] {
  return recipes.sort((left, right) => left.recipeIndex - right.recipeIndex)
}

async function writeAndValidateSample(definition: SampleDefinition) {
  const selfBreeding = allRecipes.filter((recipe) =>
    recipe.parentAId === recipe.parentBId &&
    !definition.recipes.some((item) => item.recipeIndex === recipe.recipeIndex),
  ).slice(0, 3)
  invariant(selfBreeding.length === 3, '没有足够的自交配方用于背包过滤样例。')
  const relations = stableRecipes([...definition.recipes, ...selfBreeding]).map((recipe, index): StoredRelation => ({
    recipeIndex: recipe.recipeIndex,
    parentAId: recipe.parentAId,
    parentBId: recipe.parentBId,
    childId: recipe.childId,
    datasetVersion: manifest.datasetVersion,
    addedAt: new Date(Date.parse(FIXED_TIME) + index * 1_000).toISOString(),
    inBag: true,
  }))
  const customPlanId = `sample-${definition.number}`
  const plans: PlanRecord[] = [
    { id: DEFAULT_PLAN_ID, kind: 'default', name: '默认方案', createdAt: FIXED_TIME, updatedAt: FIXED_TIME },
    { id: customPlanId, kind: 'custom', name: definition.name, createdAt: FIXED_TIME, updatedAt: FIXED_TIME },
  ]
  const workspace: BreedingWorkspace = {
    schemaVersion: 1,
    datasetVersion: manifest.datasetVersion,
    relations,
    plans,
    planRelations: {
      [DEFAULT_PLAN_ID]: [],
      [customPlanId]: definition.recipes.map((recipe) => recipe.recipeIndex).sort((a, b) => a - b),
    },
    currentPlanId: customPlanId,
    preferences: { lastView: definition.lastView, nodeMode: definition.nodeMode },
  }
  const payload = createWorkspaceExport(workspace, appVersion, manifest.datasetVersion, FIXED_TIME)
  const reparsed = parseWorkspaceImport(JSON.parse(JSON.stringify(payload)))
  const resolved = resolveWorkspaceRelations(reparsed, breedingIndex)
  invariant(resolved.every((relation) => relation.status === 'valid'), `${definition.fileName} 包含失效快照。`)
  const graph = derivePlanGraph(resolved, reparsed.planRelations[customPlanId], definition.nodeMode)
  const depth = graph.steps.reduce((maximum, step) => Math.max(maximum, step.layer + 1), 0)
  const targetCount = graph.components.reduce((sum, component) => sum + component.targetIds.length, 0)
  invariant(graph.validRelations.length === definition.recipes.length, `${definition.fileName} 关系数量不符。`)
  invariant(graph.components.length === definition.expectedComponents, `${definition.fileName} 分量数量不符：${graph.components.length}。`)
  invariant(targetCount >= definition.minimumTargets, `${definition.fileName} 目标数量不足：${targetCount}。`)
  invariant(depth >= definition.minimumDepth, `${definition.fileName} 拓扑深度不足：${depth}。`)
  return { definition, payload, depth, targetCount, componentCount: graph.components.length }
}

function buildReadme(summaries: Array<Awaited<ReturnType<typeof writeAndValidateSample>>>): string {
  const palNames = new Map(palsPayload.pals.map((pal) => [pal.internalId, pal.name.zhHans]))
  const rows = summaries.map(({ definition, payload, depth, targetCount, componentCount }) => {
    const current = payload.currentPlanId
    const recipeIndexes = payload.planRelations[current]
    const snapshots = new Map(payload.relations.map((relation) => [relation.recipeIndex, relation]))
    const childIds = new Set(recipeIndexes.map((index) => snapshots.get(index)?.childId).filter(Boolean))
    const parentIds = new Set(recipeIndexes.flatMap((index) => {
      const recipe = snapshots.get(index)
      return recipe ? [recipe.parentAId, recipe.parentBId] : []
    }))
    const targets = [...childIds].filter((id) => !parentIds.has(id as string)).map((id) => palNames.get(id as string) ?? id).slice(0, 6)
    return `| ${definition.number} | [${definition.fileName}](./${definition.fileName}) | ${recipeIndexes.length} | ${depth} | ${componentCount} | ${targetCount}（${targets.join('、')}${targetCount > targets.length ? '…' : ''}） | ${definition.nodeMode === 'instance' ? '实例' : '合并'} | ${definition.focus} |`
  })
  return `# 配种方案网导入测试样例\n\n这些文件由 \`npm.cmd run samples:breeding-workspaces\` 根据当前紧凑配种索引稳定生成，并在写入前完成 Schema、快照身份、DAG、关系数量、拓扑深度、分量与目标校验。\n\n- 数据版本：\`${manifest.datasetVersion}\`\n- 应用版本：\`${appVersion}\`\n- 生成时间戳：\`${FIXED_TIME}\`（固定值，保证重复生成一致）\n- 每个文件包含空的默认方案、1 个当前测试方案，以及 3 条仅在背包中的自交配方。\n\n| 编号 | 文件 | 方案关系 | 拓扑深度 | 分量 | 目标 | 推荐视图 | 验收重点 |\n| --- | --- | ---: | ---: | ---: | --- | --- | --- |\n${rows.join('\n')}\n\n## 导入方法\n\n1. 打开“配种方案网”。\n2. 点击“导入”，选择上表中的 JSON 文件。\n3. 核对预览数量后确认；导入会完整替换当前本机工作区。\n4. 测试完成后可导入自己的备份或重置本机工作区。\n\n> \`.tmp/\` 已被 Git 忽略。这些样例不会进入提交；数据更新后重新运行生成命令即可。\n`
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
