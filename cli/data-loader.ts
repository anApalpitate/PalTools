import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  ActiveSkillRecord,
  BreedingIndexPayload,
  DatasetManifest,
  ItemRecord,
  PalRecord,
} from '../src/domain/types'
import {
  RUNTIME_DATA_LABELS,
  RUNTIME_DATA_SCHEMA_VERSION,
  RuntimeDataContractError,
  parseRuntimeData,
  type RuntimeDataKind,
} from '../src/domain/runtime-data'

export const EXPECTED_DATA_SCHEMA_VERSION = RUNTIME_DATA_SCHEMA_VERSION

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

function readRuntimeJson<K extends RuntimeDataKind>(
  dataDir: string,
  fileName: string,
  kind: K,
) {
  const filePath = join(dataDir, fileName)
  let value: unknown
  try {
    value = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    throw new DataUnavailableError(
      `无法读取${RUNTIME_DATA_LABELS[kind]}：${filePath}`,
    )
  }
  try {
    return parseRuntimeData(kind, value)
  } catch (error) {
    if (error instanceof RuntimeDataContractError) {
      throw new DataUnavailableError(error.message)
    }
    throw error
  }
}

export function loadDataset(dataDir: string): CliDataset {
  const palsPayload = readRuntimeJson(dataDir, 'pals.json', 'pals')
  const breedingIndex = readRuntimeJson(
    dataDir,
    'breeding-index.json',
    'breedingIndex',
  )
  const skillsPayload = readRuntimeJson(dataDir, 'skills.json', 'skills')
  const itemsPayload = readRuntimeJson(dataDir, 'items.json', 'items')
  const elementsPayload = readRuntimeJson(
    dataDir,
    'elements.json',
    'elements',
  )
  const manifest = readRuntimeJson(dataDir, 'manifest.json', 'manifest')

  return {
    pals: palsPayload.pals,
    breedingIndex,
    skills: new Map(
      skillsPayload.skills.map((skill) => [
        skill.id,
        skill,
      ]),
    ),
    items: new Map(
      itemsPayload.items.map((item) => [item.id, item]),
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
