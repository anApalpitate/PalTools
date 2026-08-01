import {
  breedingPlanExportV2Schema,
  validateBreedingPlanV2,
  type BreedingPlanExportV2,
  type BreedingPlanV2,
  breedingPlanExportV1Schema,
  validateBreedingPlan,
  type BreedingPlanExportV1,
  type BreedingPlanV1,
} from './breeding-graph'
import { recipeMatchesForParents } from './pals'
import type { BreedingIndexPayload } from './types'

export const BREEDING_PLAN_FILE_EXTENSION = '.paltools-plan.json'
export const MAX_BREEDING_PLAN_FILE_BYTES = 5 * 1024 * 1024
export const MAX_BREEDING_PLAN_NODES = 1_000
export const MAX_BREEDING_PLAN_RELATIONS = 1_000

export interface ImportedBreedingPlan {
  plan: BreedingPlanV1
  sourceDatasetVersion: string
  datasetVersionMismatch: boolean
}

export interface ImportedBreedingPlanV2 {
  plan: BreedingPlanV2
  sourceDatasetVersion: string
  datasetVersionMismatch: boolean
}

export interface ParseBreedingPlanImportV2Options {
  currentDatasetVersion: string
  existingPlanNames: ReadonlySet<string>
  validPalIds: ReadonlySet<string>
  breedingIndex: BreedingIndexPayload
  now?: () => Date
  createId?: (kind: 'plan' | 'node' | 'relation') => string
}

export function serializeBreedingPlanV2(
  plan: BreedingPlanV2,
  datasetVersion: string,
  now: Date = new Date(),
): string {
  const validated = validateBreedingPlanV2(plan)
  if (!validated.valid) {
    throw new Error(validated.issues[0]?.message ?? '当前方案不合法，无法导出。')
  }
  const payload: BreedingPlanExportV2 = breedingPlanExportV2Schema.parse({
    format: 'paltools-breeding-plan',
    schemaVersion: 2,
    datasetVersion,
    exportedAt: now.toISOString(),
    plan: {
      name: plan.name,
      layers: plan.layers,
      nodes: plan.nodes,
      relations: plan.relations,
      viewport: plan.viewport,
    },
  })
  return `${JSON.stringify(payload, null, 2)}\n`
}

export function parseBreedingPlanImportV2(
  text: string,
  options: ParseBreedingPlanImportV2Options,
): ImportedBreedingPlanV2 {
  if (new TextEncoder().encode(text).byteLength > MAX_BREEDING_PLAN_FILE_BYTES) {
    throw new Error('方案文件不得超过 5 MiB。')
  }
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch {
    throw new Error('方案文件不是有效的 JSON。')
  }
  const parsed = breedingPlanExportV2Schema.safeParse(input)
  if (!parsed.success) throw new Error('方案文件格式或版本不受支持。')
  const payload = parsed.data
  if (payload.plan.nodes.length > MAX_BREEDING_PLAN_NODES) throw new Error('方案文件最多包含 1,000 个节点。')
  if (payload.plan.relations.length > MAX_BREEDING_PLAN_RELATIONS) throw new Error('方案文件最多包含 1,000 条关系。')
  const sourceValidation = validateBreedingPlanV2({
    id: 'import-source',
    schemaVersion: 2,
    ...payload.plan,
    createdAt: payload.exportedAt,
    updatedAt: payload.exportedAt,
  }, { validPalIds: options.validPalIds, breedingIndex: options.breedingIndex })
  if (!sourceValidation.valid) throw new Error(sourceValidation.issues[0]?.message ?? '方案文件内容不合法。')

  const now = (options.now ?? (() => new Date()))().toISOString()
  const createId = options.createId ?? defaultCreateId
  const usedIds = new Set<string>()
  const uniqueId = (kind: 'plan' | 'node' | 'relation') => {
    const id = createId(kind)
    if (!id || usedIds.has(id)) throw new Error('导入时无法生成唯一资源 ID。')
    usedIds.add(id)
    return id
  }
  const nodeIdMap = new Map<string, string>(payload.plan.nodes.map((node) => [node.id, uniqueId('node')]))
  const nodes = payload.plan.nodes.map((node) => {
    const id = nodeIdMap.get(node.id)!
    return {
      ...node,
      id,
      source: 'import' as const,
      forkOf: node.forkOf ? nodeIdMap.get(node.forkOf) : undefined,
    }
  })
  const layers = payload.plan.layers.map((layer) => ({
    nodeIds: layer.nodeIds.map((nodeId) => nodeIdMap.get(nodeId) ?? (() => { throw new Error(`导入引用的节点 “${nodeId}” 不存在。`) })()),
  }))
  const relations = payload.plan.relations.map((relation) => ({
    ...relation,
    id: uniqueId('relation'),
    parentANodeId: nodeIdMap.get(relation.parentANodeId)!,
    parentBNodeId: nodeIdMap.get(relation.parentBNodeId)!,
    childNodeId: nodeIdMap.get(relation.childNodeId)!,
  }))
  const plan: BreedingPlanV2 = {
    id: uniqueId('plan'),
    schemaVersion: 2,
    name: nextImportedPlanName(payload.plan.name, options.existingPlanNames),
    layers,
    nodes,
    relations,
    viewport: payload.plan.viewport,
    createdAt: now,
    updatedAt: now,
  }
  const validation = validateBreedingPlanV2(plan, {
    validPalIds: options.validPalIds,
    breedingIndex: options.breedingIndex,
  })
  if (!validation.valid) throw new Error(validation.issues[0]?.message ?? '导入方案校验失败。')
  return {
    plan,
    sourceDatasetVersion: payload.datasetVersion,
    datasetVersionMismatch: payload.datasetVersion !== options.currentDatasetVersion,
  }
}

export interface ParseBreedingPlanImportOptions {
  currentDatasetVersion: string
  existingPlanNames: ReadonlySet<string>
  validPalIds: ReadonlySet<string>
  breedingIndex: BreedingIndexPayload
  now?: () => Date
  createId?: (kind: 'plan' | 'node' | 'relation') => string
}

export function serializeBreedingPlan(
  plan: BreedingPlanV1,
  datasetVersion: string,
  now: Date = new Date(),
): string {
  const validated = validateBreedingPlan(plan)
  if (!validated.valid) {
    throw new Error(validated.issues[0]?.message ?? '当前方案不合法，无法导出。')
  }
  const payload: BreedingPlanExportV1 = breedingPlanExportV1Schema.parse({
    format: 'paltools-breeding-plan',
    schemaVersion: 1,
    datasetVersion,
    exportedAt: now.toISOString(),
    plan: {
      name: plan.name,
      nodes: plan.nodes,
      relations: plan.relations,
      viewport: plan.viewport,
    },
  })
  return `${JSON.stringify(payload, null, 2)}\n`
}

export function parseBreedingPlanImport(
  text: string,
  options: ParseBreedingPlanImportOptions,
): ImportedBreedingPlan {
  if (new TextEncoder().encode(text).byteLength > MAX_BREEDING_PLAN_FILE_BYTES) {
    throw new Error('方案文件不得超过 5 MiB。')
  }

  let input: unknown
  try {
    input = JSON.parse(text)
  } catch {
    throw new Error('方案文件不是有效的 JSON。')
  }
  const parsed = breedingPlanExportV1Schema.safeParse(input)
  if (!parsed.success) {
    throw new Error('方案文件格式或版本不受支持。')
  }
  const payload = parsed.data
  if (payload.plan.nodes.length > MAX_BREEDING_PLAN_NODES) {
    throw new Error('方案文件最多包含 1,000 个节点。')
  }
  if (payload.plan.relations.length > MAX_BREEDING_PLAN_RELATIONS) {
    throw new Error('方案文件最多包含 1,000 条关系。')
  }

  const sourcePlan: BreedingPlanV1 = {
    id: 'import-source',
    schemaVersion: 1,
    ...payload.plan,
    createdAt: payload.exportedAt,
    updatedAt: payload.exportedAt,
  }
  const sourceValidation = validateBreedingPlan(sourcePlan, {
    validPalIds: options.validPalIds,
  })
  if (!sourceValidation.valid) {
    throw new Error(sourceValidation.issues[0]?.message ?? '方案文件内容不合法。')
  }

  const now = (options.now ?? (() => new Date()))().toISOString()
  const createId = options.createId ?? defaultCreateId
  const usedIds = new Set<string>()
  const uniqueId = (kind: 'plan' | 'node' | 'relation') => {
    const id = createId(kind)
    if (!id || usedIds.has(id)) throw new Error('导入时无法生成唯一资源 ID。')
    usedIds.add(id)
    return id
  }
  const nodeIdMap = new Map<string, string>()
  const sourceNodeById = new Map(payload.plan.nodes.map((node) => [node.id, node]))
  const nodes = payload.plan.nodes.map((node) => {
    const id = uniqueId('node')
    nodeIdMap.set(node.id, id)
    return { ...node, id, source: 'import' as const }
  })
  const relations = payload.plan.relations.map((relation) => {
    const parentA = sourceNodeById.get(relation.parentANodeId)!
    const parentB = sourceNodeById.get(relation.parentBNodeId)!
    const child = sourceNodeById.get(relation.childNodeId)!
    const currentRecipe = recipeMatchesForParents(
      options.breedingIndex,
      parentA.palId,
      parentB.palId,
    ).find((match) => match.childId === child.palId)
    if (!currentRecipe) {
      throw new Error(
        `当前数据集中不存在配方 ${parentA.palId} + ${parentB.palId} → ${child.palId}。`,
      )
    }
    return {
      id: uniqueId('relation'),
      parentANodeId: nodeIdMap.get(relation.parentANodeId)!,
      parentBNodeId: nodeIdMap.get(relation.parentBNodeId)!,
      childNodeId: nodeIdMap.get(relation.childNodeId)!,
      recipeIndex: currentRecipe.recipeIndex,
    }
  })
  const plan: BreedingPlanV1 = {
    id: uniqueId('plan'),
    schemaVersion: 1,
    name: nextImportedPlanName(payload.plan.name, options.existingPlanNames),
    nodes,
    relations,
    viewport: payload.plan.viewport,
    createdAt: now,
    updatedAt: now,
  }
  const validation = validateBreedingPlan(plan, {
    validPalIds: options.validPalIds,
    breedingIndex: options.breedingIndex,
  })
  if (!validation.valid) {
    throw new Error(validation.issues[0]?.message ?? '导入方案校验失败。')
  }
  return {
    plan,
    sourceDatasetVersion: payload.datasetVersion,
    datasetVersionMismatch: payload.datasetVersion !== options.currentDatasetVersion,
  }
}

export function breedingPlanFileName(name: string): string {
  const safeName = name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .slice(0, 80) || 'breeding-plan'
  return `${safeName}${BREEDING_PLAN_FILE_EXTENSION}`
}

function nextImportedPlanName(
  rawName: string,
  existingNames: ReadonlySet<string>,
): string {
  const baseName = (rawName.trim() || '导入方案').slice(0, 40)
  if (!existingNames.has(baseName)) return baseName
  let suffix = 2
  while (true) {
    const marker = `（${suffix}）`
    const candidate = `${baseName.slice(0, 40 - marker.length)}${marker}`
    if (!existingNames.has(candidate)) return candidate
    suffix += 1
  }
}

function defaultCreateId(kind: 'plan' | 'node' | 'relation'): string {
  return `${kind}-${crypto.randomUUID()}`
}
