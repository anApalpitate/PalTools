import {
  breedingPlanV1Schema,
  palPresetV1Schema,
  planPresetLinkV1Schema,
  parseLegacyOwnedPalIds,
  validateBreedingPlan,
  type BreedingPlanV1,
  type PalPresetV1,
  type PlanPresetLinkV1,
} from '../domain/breeding-graph'

export const BREEDING_GRAPH_DB_NAME = 'paltools-breeding'
export const BREEDING_GRAPH_DB_VERSION = 1
export const LEGACY_OWNED_PALS_STORAGE_KEY = 'paltools.path-starts.v1'

const STORES = {
  presets: 'presets',
  plans: 'plans',
  links: 'plan-preset-links',
  metadata: 'metadata',
} as const
const LEGACY_MIGRATION_KEY = 'legacy-owned-pals-v1'

interface RepositoryMetadata {
  key: string
  completedAt: string
  presetId: string | null
}

export interface LegacyOwnedPalsMigrationOptions {
  raw: string | null
  validPalIds: ReadonlySet<string>
  now?: () => Date
  createId?: () => string
}

export interface LegacyOwnedPalsMigrationResult {
  status: 'migrated' | 'already-migrated' | 'no-data'
  presetId: string | null
  palCount: number
}

export interface BreedingGraphRepository {
  listPresets(): Promise<PalPresetV1[]>
  getPreset(id: string): Promise<PalPresetV1 | undefined>
  putPreset(preset: PalPresetV1): Promise<void>
  deletePreset(id: string): Promise<void>
  listPlans(): Promise<BreedingPlanV1[]>
  getPlan(id: string): Promise<BreedingPlanV1 | undefined>
  putPlan(plan: BreedingPlanV1): Promise<void>
  deletePlan(id: string): Promise<void>
  listLinks(): Promise<PlanPresetLinkV1[]>
  savePlanBundle(
    plan: BreedingPlanV1,
    links: PlanPresetLinkV1[],
  ): Promise<void>
  migrateLegacyOwnedPals(
    options: LegacyOwnedPalsMigrationOptions,
  ): Promise<LegacyOwnedPalsMigrationResult>
  close(): Promise<void>
}

export class IndexedDbBreedingGraphRepository
implements BreedingGraphRepository {
  private readonly dbPromise: Promise<IDBDatabase>

  constructor(factory: IDBFactory = indexedDB) {
    this.dbPromise = openDatabase(factory)
  }

  async listPresets(): Promise<PalPresetV1[]> {
    const values = await this.getAll<PalPresetV1>(STORES.presets)
    return values.map((value) => palPresetV1Schema.parse(value))
  }

  async getPreset(id: string): Promise<PalPresetV1 | undefined> {
    const value = await this.get<PalPresetV1>(STORES.presets, id)
    return value ? palPresetV1Schema.parse(value) : undefined
  }

  async putPreset(preset: PalPresetV1): Promise<void> {
    const value = palPresetV1Schema.parse(preset)
    const db = await this.dbPromise
    const transaction = db.transaction(STORES.presets, 'readwrite')
    const completed = transactionComplete(transaction)
    transaction.objectStore(STORES.presets).put(value)
    await completed
  }

  async deletePreset(id: string): Promise<void> {
    const db = await this.dbPromise
    const transaction = db.transaction(
      [STORES.presets, STORES.links],
      'readwrite',
    )
    const completed = transactionComplete(transaction)
    transaction.objectStore(STORES.presets).delete(id)
    const links = await requestResult<PlanPresetLinkV1[]>(
      transaction.objectStore(STORES.links).getAll(),
    )
    for (const link of links) {
      if (link.presetId === id) {
        transaction.objectStore(STORES.links).delete([link.planId, link.presetId])
      }
    }
    await completed
  }

  async listPlans(): Promise<BreedingPlanV1[]> {
    const values = await this.getAll<BreedingPlanV1>(STORES.plans)
    return values.map((value) => breedingPlanV1Schema.parse(value))
  }

  async getPlan(id: string): Promise<BreedingPlanV1 | undefined> {
    const value = await this.get<BreedingPlanV1>(STORES.plans, id)
    return value ? breedingPlanV1Schema.parse(value) : undefined
  }

  async putPlan(plan: BreedingPlanV1): Promise<void> {
    const value = parseValidPlan(plan)
    const db = await this.dbPromise
    const transaction = db.transaction(STORES.plans, 'readwrite')
    const completed = transactionComplete(transaction)
    transaction.objectStore(STORES.plans).put(value)
    await completed
  }

  async deletePlan(id: string): Promise<void> {
    const db = await this.dbPromise
    const transaction = db.transaction(
      [STORES.plans, STORES.links],
      'readwrite',
    )
    const completed = transactionComplete(transaction)
    transaction.objectStore(STORES.plans).delete(id)
    const links = await requestResult<PlanPresetLinkV1[]>(
      transaction.objectStore(STORES.links).getAll(),
    )
    for (const link of links) {
      if (link.planId === id) {
        transaction.objectStore(STORES.links).delete([link.planId, link.presetId])
      }
    }
    await completed
  }

  async listLinks(): Promise<PlanPresetLinkV1[]> {
    const values = await this.getAll<PlanPresetLinkV1>(STORES.links)
    return values.map((value) => planPresetLinkV1Schema.parse(value))
  }

  async savePlanBundle(
    plan: BreedingPlanV1,
    links: PlanPresetLinkV1[],
  ): Promise<void> {
    const validPlan = parseValidPlan(plan)
    const linkedPresetIds = new Set<string>()
    const validLinks = links.map((link) => {
      const parsed = planPresetLinkV1Schema.parse(link)
      if (parsed.planId !== validPlan.id) {
        throw new Error('计划关联必须属于同一个计划。')
      }
      if (linkedPresetIds.has(parsed.presetId)) {
        throw new Error(`计划重复关联了预设 “${parsed.presetId}”。`)
      }
      linkedPresetIds.add(parsed.presetId)
      return parsed
    })
    const db = await this.dbPromise
    const transaction = db.transaction(
      [STORES.plans, STORES.links, STORES.presets],
      'readwrite',
    )
    const completed = transactionComplete(transaction)
    const presetStore = transaction.objectStore(STORES.presets)
    for (const presetId of linkedPresetIds) {
      const linkedPreset = await requestResult<PalPresetV1 | undefined>(
        presetStore.get(presetId),
      )
      if (!linkedPreset) {
        transaction.abort()
        await completed.catch(() => undefined)
        throw new Error(`计划关联的预设 “${presetId}” 不存在。`)
      }
    }
    transaction.objectStore(STORES.plans).put(validPlan)
    const linkStore = transaction.objectStore(STORES.links)
    const existingLinks = await requestResult<PlanPresetLinkV1[]>(
      linkStore.getAll(),
    )
    for (const link of existingLinks) {
      if (link.planId === validPlan.id) {
        linkStore.delete([link.planId, link.presetId])
      }
    }
    for (const link of validLinks) linkStore.put(link)
    await completed
  }

  async migrateLegacyOwnedPals({
    raw,
    validPalIds,
    now = () => new Date(),
    createId = () => crypto.randomUUID(),
  }: LegacyOwnedPalsMigrationOptions): Promise<LegacyOwnedPalsMigrationResult> {
    const palIds = parseLegacyOwnedPalIds(raw, validPalIds)
    const db = await this.dbPromise
    const transaction = db.transaction(
      [STORES.presets, STORES.metadata],
      'readwrite',
    )
    const completed = transactionComplete(transaction)
    const metadataStore = transaction.objectStore(STORES.metadata)
    const existing = await requestResult<RepositoryMetadata | undefined>(
      metadataStore.get(LEGACY_MIGRATION_KEY),
    )
    if (existing) {
      await completed
      return {
        status: 'already-migrated',
        presetId: existing.presetId,
        palCount: 0,
      }
    }

    const completedAt = now().toISOString()
    const presetId = palIds.length > 0 ? createId() : null
    if (presetId) {
      const existingPresets = await requestResult<PalPresetV1[]>(
        transaction.objectStore(STORES.presets).getAll(),
      )
      const preset: PalPresetV1 = {
        id: presetId,
        schemaVersion: 1,
        name: nextAvailableName(
          '旧版已有帕鲁',
          new Set(existingPresets.map((preset) => preset.name)),
        ),
        palIds,
        createdAt: completedAt,
        updatedAt: completedAt,
      }
      transaction.objectStore(STORES.presets).put(palPresetV1Schema.parse(preset))
    }
    metadataStore.put({
      key: LEGACY_MIGRATION_KEY,
      completedAt,
      presetId,
    } satisfies RepositoryMetadata)
    await completed
    return {
      status: presetId ? 'migrated' : 'no-data',
      presetId,
      palCount: palIds.length,
    }
  }

  async close(): Promise<void> {
    try {
      const db = await this.dbPromise
      db.close()
    } catch {
      // 初始化失败时没有可关闭的数据库；原始错误由调用方的操作返回。
    }
  }

  private async get<T>(
    storeName: (typeof STORES)[keyof typeof STORES],
    key: IDBValidKey,
  ): Promise<T | undefined> {
    const db = await this.dbPromise
    const transaction = db.transaction(storeName, 'readonly')
    const completed = transactionComplete(transaction)
    const result = await requestResult<T | undefined>(
      transaction.objectStore(storeName).get(key),
    )
    await completed
    return result
  }

  private async getAll<T>(
    storeName: (typeof STORES)[keyof typeof STORES],
  ): Promise<T[]> {
    const db = await this.dbPromise
    const transaction = db.transaction(storeName, 'readonly')
    const completed = transactionComplete(transaction)
    const result = await requestResult<T[]>(
      transaction.objectStore(storeName).getAll(),
    )
    await completed
    return result
  }
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false
    const request = factory.open(
      BREEDING_GRAPH_DB_NAME,
      BREEDING_GRAPH_DB_VERSION,
    )
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORES.presets)) {
        db.createObjectStore(STORES.presets, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORES.plans)) {
        db.createObjectStore(STORES.plans, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORES.links)) {
        db.createObjectStore(STORES.links, {
          keyPath: ['planId', 'presetId'],
        })
      }
      if (!db.objectStoreNames.contains(STORES.metadata)) {
        db.createObjectStore(STORES.metadata, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => {
      if (settled) {
        request.result.close()
        return
      }
      settled = true
      resolve(request.result)
    }
    request.onerror = () => {
      settled = true
      reject(request.error)
    }
    request.onblocked = () => {
      settled = true
      reject(new Error('配种图数据库升级被其他窗口阻止。'))
    }
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('配种图数据库事务已中止。'))
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('配种图数据库事务失败。'))
  })
}

function parseValidPlan(plan: BreedingPlanV1): BreedingPlanV1 {
  const result = validateBreedingPlan(plan)
  if (!result.valid || !result.plan) {
    throw new Error(result.issues.map((issue) => issue.message).join(' '))
  }
  return result.plan
}

function nextAvailableName(baseName: string, existingNames: ReadonlySet<string>) {
  if (!existingNames.has(baseName)) return baseName
  let suffix = 2
  while (existingNames.has(`${baseName}（${suffix}）`)) suffix += 1
  return `${baseName}（${suffix}）`
}
