import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  ActiveSkillRecord,
  BreedingIndexPayload,
  DatasetManifest,
  ItemRecord,
  PalRecord,
} from '../src/domain/types'

export const EXPECTED_DATA_SCHEMA_VERSION = 4

export interface CliDataset {
  pals: PalRecord[]
  breedingIndex: BreedingIndexPayload
  skills: ReadonlyMap<string, ActiveSkillRecord>
  items: ReadonlyMap<string, ItemRecord>
  elementNames: ReadonlyMap<string, string>
  manifest: DatasetManifest
}

export class DataUnavailableError extends Error {
  readonly code = 'data-unavailable' as const
}

export function resolveDataDir(
  cwd: string,
  override: string | undefined,
  env: Record<string, string | undefined> = {},
): string {
  return override || env.PALTOOLS_DATA_DIR || join(cwd, 'public', 'data')
}

function readJson<T>(filePath: string, label: string): T {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T
  } catch {
    throw new DataUnavailableError(`无法读取${label}：${filePath}`)
  }
}

function requireSchemaVersion(
  value: unknown,
  label: string,
): asserts value is { schemaVersion: number } {
  if (
    typeof value !== 'object' ||
    value === null ||
    (value as { schemaVersion?: unknown }).schemaVersion !==
      EXPECTED_DATA_SCHEMA_VERSION
  ) {
    throw new DataUnavailableError(
      `${label}的 Schema 版本不是 ${EXPECTED_DATA_SCHEMA_VERSION}，请先运行 npm run data:build。`,
    )
  }
}

export function loadDataset(dataDir: string): CliDataset {
  const palsPayload = readJson<{ schemaVersion: number; pals: unknown }>(
    join(dataDir, 'pals.json'),
    '图鉴数据',
  )
  requireSchemaVersion(palsPayload, '图鉴数据')
  if (!Array.isArray(palsPayload.pals)) {
    throw new DataUnavailableError('图鉴数据缺少 pals 数组。')
  }

  const breedingIndex = readJson<BreedingIndexPayload>(
    join(dataDir, 'breeding-index.json'),
    '配种索引',
  )
  requireSchemaVersion(breedingIndex, '配种索引')
  if (
    !Array.isArray(breedingIndex.palIds) ||
    !Array.isArray(breedingIndex.recipes)
  ) {
    throw new DataUnavailableError('配种索引结构不完整。')
  }

  const skillsPayload = readJson<{ schemaVersion: number; skills: unknown }>(
    join(dataDir, 'skills.json'),
    '主动技能数据',
  )
  requireSchemaVersion(skillsPayload, '主动技能数据')
  if (!Array.isArray(skillsPayload.skills)) {
    throw new DataUnavailableError('主动技能数据缺少 skills 数组。')
  }

  const itemsPayload = readJson<{ schemaVersion: number; items: unknown }>(
    join(dataDir, 'items.json'),
    '掉落物数据',
  )
  requireSchemaVersion(itemsPayload, '掉落物数据')
  if (!Array.isArray(itemsPayload.items)) {
    throw new DataUnavailableError('掉落物数据缺少 items 数组。')
  }

  const elementsPayload = readJson<{
    schemaVersion: number
    elements: Array<{ id: string; name: { zhHans: string } }>
  }>(join(dataDir, 'elements.json'), '属性数据')
  requireSchemaVersion(elementsPayload, '属性数据')
  if (!Array.isArray(elementsPayload.elements)) {
    throw new DataUnavailableError('属性数据缺少 elements 数组。')
  }

  const manifest = readJson<DatasetManifest>(
    join(dataDir, 'manifest.json'),
    '数据清单',
  )
  requireSchemaVersion(manifest, '数据清单')

  return {
    pals: palsPayload.pals as PalRecord[],
    breedingIndex,
    skills: new Map(
      (skillsPayload.skills as ActiveSkillRecord[]).map((skill) => [
        skill.id,
        skill,
      ]),
    ),
    items: new Map(
      (itemsPayload.items as ItemRecord[]).map((item) => [item.id, item]),
    ),
    elementNames: new Map(
      elementsPayload.elements.map((element) => [
        element.id,
        element.name.zhHans,
      ]),
    ),
    manifest,
  }
}
