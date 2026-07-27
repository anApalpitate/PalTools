import type { AppConfig } from './types'

export const ADMIN_CONFIG_STORAGE_KEY = 'paltools.admin-config.v1'
export const OWNED_PALS_STORAGE_KEY = 'paltools.path-starts.v1'
export const DEFAULT_MAX_EXACT_GENERATION = 6
export const HARD_MAX_EXACT_GENERATION = 12

export const DEFAULT_APP_CONFIG: AppConfig = {
  schemaVersion: 1,
  pathPlanner: {
    maxExactGeneration: DEFAULT_MAX_EXACT_GENERATION,
  },
}

export function parseAppConfig(raw: string | null): {
  config: AppConfig
  recovered: boolean
} {
  if (!raw) return { config: DEFAULT_APP_CONFIG, recovered: false }
  try {
    const value = JSON.parse(raw) as Partial<AppConfig>
    const max = value.pathPlanner?.maxExactGeneration
    if (
      value.schemaVersion !== 1 ||
      !Number.isInteger(max) ||
      (max ?? 0) < 1 ||
      (max ?? 0) > HARD_MAX_EXACT_GENERATION
    ) {
      return { config: DEFAULT_APP_CONFIG, recovered: true }
    }
    return {
      config: {
        schemaVersion: 1,
        pathPlanner: { maxExactGeneration: max as number },
      },
      recovered: false,
    }
  } catch {
    return { config: DEFAULT_APP_CONFIG, recovered: true }
  }
}

export function parseOwnedPalIds(
  raw: string | null,
  validIds: ReadonlySet<string>,
): string[] {
  if (!raw) return []
  try {
    const value = JSON.parse(raw) as { schemaVersion?: number; palIds?: unknown }
    if (value.schemaVersion !== 1 || !Array.isArray(value.palIds)) return []
    return [
      ...new Set(
        value.palIds.filter(
          (id): id is string => typeof id === 'string' && validIds.has(id),
        ),
      ),
    ]
  } catch {
    return []
  }
}

export function serializeOwnedPalIds(ids: readonly string[]): string {
  return JSON.stringify({
    schemaVersion: 1,
    palIds: [...new Set(ids)].sort(),
  })
}
