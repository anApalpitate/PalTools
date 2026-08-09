import { z } from 'zod'
import {
  DEFAULT_PLAN_ID,
  MAX_CUSTOM_PLANS,
  WORKSPACE_SCHEMA_VERSION,
  createEmptyWorkspace,
  detectRecipeCycle,
  validatePlanName,
} from '../domain/breeding-workspace'
import type {
  BreedingWorkspace,
  BreedingWorkspaceExportV1,
  PlanRecord,
  StoredRelation,
} from '../domain/breeding-workspace'

export const BREEDING_WORKSPACE_DB_NAME = 'paltools-breeding-network'
const DATABASE_VERSION = 1

const relationSchema = z.object({
  recipeIndex: z.number().int().nonnegative(),
  parentAId: z.string().min(1),
  parentBId: z.string().min(1),
  childId: z.string().min(1),
  datasetVersion: z.string().min(1),
  addedAt: z.string().datetime(),
  inBag: z.boolean(),
})
const planSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['default', 'custom']),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
const preferencesSchema = z.object({
  lastView: z.enum(['steps', 'graph', 'relations']),
  nodeMode: z.enum(['merged', 'instance']),
})
const exportSchema = z.object({
  format: z.literal('paltools-breeding-workspace'),
  schemaVersion: z.literal(WORKSPACE_SCHEMA_VERSION),
  appVersion: z.string().min(1),
  datasetVersion: z.string().min(1),
  exportedAt: z.string().datetime(),
  relations: z.array(relationSchema),
  plans: z.array(planSchema),
  planRelations: z.record(z.string(), z.array(z.number().int().nonnegative())),
  currentPlanId: z.string().min(1),
  preferences: preferencesSchema,
})

interface WorkspaceMetadata {
  id: 'workspace'
  schemaVersion: 1
  datasetVersion: string
  currentPlanId: string
  preferences: BreedingWorkspace['preferences']
}

interface PlanRelationRow {
  planId: string
  recipeIndex: number
}

export class WorkspaceStorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'WorkspaceStorageError'
  }
}

export class BreedingWorkspaceRepository {
  private databasePromise: Promise<IDBDatabase>

  constructor(factory: IDBFactory = indexedDB) {
    this.databasePromise = openDatabase(factory)
  }

  async load(datasetVersion: string): Promise<BreedingWorkspace> {
    const db = await this.databasePromise
    const transaction = db.transaction(
      ['metadata', 'relations', 'plans', 'planRelations'],
      'readonly',
    )
    const [metadata, relations, plans, planRelationRows] = await Promise.all([
      requestToPromise(transaction.objectStore('metadata').get('workspace')),
      requestToPromise(transaction.objectStore('relations').getAll()),
      requestToPromise(transaction.objectStore('plans').getAll()),
      requestToPromise(transaction.objectStore('planRelations').getAll()),
    ])
    await transactionDone(transaction)
    if (!metadata) {
      const initial = createEmptyWorkspace(datasetVersion)
      await this.replace(initial)
      return initial
    }
    try {
      const planRelations = rowsToPlanRelations(planRelationRows as PlanRelationRow[])
      for (const plan of plans as PlanRecord[]) planRelations[plan.id] ??= []
      return validateWorkspace({
        schemaVersion: (metadata as WorkspaceMetadata).schemaVersion,
        datasetVersion: (metadata as WorkspaceMetadata).datasetVersion,
        currentPlanId: (metadata as WorkspaceMetadata).currentPlanId,
        preferences: (metadata as WorkspaceMetadata).preferences,
        relations,
        plans,
        planRelations,
      })
    } catch (error) {
      throw new WorkspaceStorageError('本机配种工作区已损坏，请重试、导入备份或重置工作区。', { cause: error })
    }
  }

  async commit(previous: BreedingWorkspace, next: BreedingWorkspace): Promise<void> {
    const db = await this.databasePromise
    const transaction = db.transaction(
      ['metadata', 'relations', 'plans', 'planRelations'],
      'readwrite',
    )
    try {
      transaction.objectStore('metadata').put(toMetadata(next))
      applyEntityDiff(transaction.objectStore('relations'), previous.relations, next.relations, (item) => item.recipeIndex)
      applyEntityDiff(transaction.objectStore('plans'), previous.plans, next.plans, (item) => item.id)
      applyPlanRelationDiff(transaction.objectStore('planRelations'), previous.planRelations, next.planRelations)
      await transactionDone(transaction)
    } catch (error) {
      transaction.abort()
      throw new WorkspaceStorageError('工作区保存失败，操作前数据已保留。', { cause: error })
    }
  }

  async replace(workspace: BreedingWorkspace): Promise<void> {
    validateWorkspace(workspace)
    const db = await this.databasePromise
    const transaction = db.transaction(
      ['metadata', 'relations', 'plans', 'planRelations'],
      'readwrite',
    )
    try {
      for (const storeName of ['relations', 'plans', 'planRelations'] as const) {
        transaction.objectStore(storeName).clear()
      }
      transaction.objectStore('metadata').put(toMetadata(workspace))
      for (const relation of workspace.relations) transaction.objectStore('relations').put(relation)
      for (const plan of workspace.plans) transaction.objectStore('plans').put(plan)
      for (const [planId, recipeIndexes] of Object.entries(workspace.planRelations)) {
        for (const recipeIndex of recipeIndexes) {
          transaction.objectStore('planRelations').put({ planId, recipeIndex })
        }
      }
      await transactionDone(transaction)
    } catch (error) {
      transaction.abort()
      throw new WorkspaceStorageError('工作区替换失败，原数据已保留。', { cause: error })
    }
  }

  close(): void {
    void this.databasePromise.then((database) => database.close()).catch(() => undefined)
  }
}

export function createWorkspaceExport(
  workspace: BreedingWorkspace,
  appVersion: string,
  datasetVersion: string,
  exportedAt = new Date().toISOString(),
): BreedingWorkspaceExportV1 {
  return {
    format: 'paltools-breeding-workspace',
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    appVersion,
    datasetVersion,
    exportedAt,
    relations: workspace.relations.map((relation) => ({ ...relation })),
    plans: workspace.plans.map((plan) => ({ ...plan })),
    planRelations: Object.fromEntries(
      Object.entries(workspace.planRelations).map(([id, indexes]) => [id, [...indexes]]),
    ),
    currentPlanId: workspace.currentPlanId,
    preferences: { ...workspace.preferences },
  }
}

export function parseWorkspaceImport(value: unknown): BreedingWorkspace {
  const parsed = exportSchema.parse(value)
  return validateWorkspace({
    schemaVersion: parsed.schemaVersion,
    datasetVersion: parsed.datasetVersion,
    relations: parsed.relations,
    plans: parsed.plans,
    planRelations: parsed.planRelations,
    currentPlanId: parsed.currentPlanId,
    preferences: parsed.preferences,
  })
}

export function validateWorkspace(value: BreedingWorkspace): BreedingWorkspace {
  if (value.schemaVersion !== WORKSPACE_SCHEMA_VERSION) throw new Error('不支持的工作区 Schema')
  const relationIds = value.relations.map((relation) => relation.recipeIndex)
  if (new Set(relationIds).size !== relationIds.length) throw new Error('关系重复')
  const planIds = value.plans.map((plan) => plan.id)
  if (new Set(planIds).size !== planIds.length) throw new Error('方案 ID 重复')
  const defaults = value.plans.filter((plan) => plan.kind === 'default')
  if (defaults.length !== 1 || defaults[0].id !== DEFAULT_PLAN_ID || defaults[0].name !== '默认方案') {
    throw new Error('默认方案缺失或非法')
  }
  if (value.plans.filter((plan) => plan.kind === 'custom').length > MAX_CUSTOM_PLANS) throw new Error('自定义方案超过 20 个')
  if (!planIds.includes(value.currentPlanId)) throw new Error('当前方案不存在')
  for (const plan of value.plans) {
    if (plan.kind === 'custom' && validatePlanName(plan.name) !== plan.name) throw new Error('方案名称非法')
    const indexes = value.planRelations[plan.id]
    if (!indexes) throw new Error(`方案 ${plan.id} 缺少关系集合`)
    if (new Set(indexes).size !== indexes.length) throw new Error(`方案 ${plan.id} 包含重复关系`)
    if (indexes.some((index) => !relationIds.includes(index))) throw new Error(`方案 ${plan.id} 包含悬空关系`)
    const recipes = indexes.map((index) => {
      const relation = value.relations.find((item) => item.recipeIndex === index) as StoredRelation
      return {
        recipeIndex: relation.recipeIndex,
        parentAId: relation.parentAId,
        parentBId: relation.parentBId,
        childId: relation.childId,
      }
    })
    if (detectRecipeCycle(recipes)) throw new Error(`方案 ${plan.name} 包含循环关系`)
  }
  if (Object.keys(value.planRelations).some((id) => !planIds.includes(id))) throw new Error('存在未知方案关系')
  return {
    ...value,
    relations: [...value.relations].sort((a, b) => a.recipeIndex - b.recipeIndex),
    plans: [...value.plans].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
    planRelations: Object.fromEntries(Object.entries(value.planRelations).map(([id, indexes]) => [id, [...indexes].sort((a, b) => a - b)])),
  }
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(BREEDING_WORKSPACE_DB_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains('metadata')) database.createObjectStore('metadata', { keyPath: 'id' })
      if (!database.objectStoreNames.contains('relations')) database.createObjectStore('relations', { keyPath: 'recipeIndex' })
      if (!database.objectStoreNames.contains('plans')) database.createObjectStore('plans', { keyPath: 'id' })
      if (!database.objectStoreNames.contains('planRelations')) database.createObjectStore('planRelations', { keyPath: ['planId', 'recipeIndex'] })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new WorkspaceStorageError('无法打开本机配种工作区。', { cause: request.error }))
    request.onblocked = () => reject(new WorkspaceStorageError('本机配种工作区被另一个窗口占用。'))
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
  })
}

function rowsToPlanRelations(rows: PlanRelationRow[]): Record<string, number[]> {
  const result: Record<string, number[]> = {}
  for (const row of rows) (result[row.planId] ??= []).push(row.recipeIndex)
  return result
}

function toMetadata(workspace: BreedingWorkspace): WorkspaceMetadata {
  return {
    id: 'workspace',
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    datasetVersion: workspace.datasetVersion,
    currentPlanId: workspace.currentPlanId,
    preferences: workspace.preferences,
  }
}

function applyEntityDiff<T>(
  store: IDBObjectStore,
  previous: T[],
  next: T[],
  keyOf: (item: T) => IDBValidKey,
) {
  const previousMap = new Map(previous.map((item) => [String(keyOf(item)), item]))
  const nextMap = new Map(next.map((item) => [String(keyOf(item)), item]))
  for (const [key, item] of previousMap) if (!nextMap.has(key)) store.delete(keyOf(item))
  for (const [key, item] of nextMap) {
    if (JSON.stringify(previousMap.get(key)) !== JSON.stringify(item)) store.put(item)
  }
}

function applyPlanRelationDiff(
  store: IDBObjectStore,
  previous: Record<string, number[]>,
  next: Record<string, number[]>,
) {
  const oldKeys = new Set(Object.entries(previous).flatMap(([planId, indexes]) => indexes.map((index) => `${planId}\0${index}`)))
  const newKeys = new Set(Object.entries(next).flatMap(([planId, indexes]) => indexes.map((index) => `${planId}\0${index}`)))
  for (const key of oldKeys) {
    if (!newKeys.has(key)) {
      const [planId, recipeIndex] = key.split('\0')
      store.delete([planId, Number(recipeIndex)])
    }
  }
  for (const key of newKeys) {
    if (!oldKeys.has(key)) {
      const [planId, recipeIndex] = key.split('\0')
      store.put({ planId, recipeIndex: Number(recipeIndex) })
    }
  }
}
