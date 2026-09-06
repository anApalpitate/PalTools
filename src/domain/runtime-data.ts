import { z } from 'zod'
import type {
  BreedingIndexPayload,
  DatasetManifest,
  ElementsPayload,
  ItemsPayload,
  PalsPayload,
  SkillsPayload,
  WorkSuitabilitiesPayload,
} from './types'

export const RUNTIME_DATA_SCHEMA_VERSION = 4 as const

export type RuntimeDataKind =
  | 'pals'
  | 'elements'
  | 'skills'
  | 'items'
  | 'workSuitabilities'
  | 'breedingIndex'
  | 'manifest'

interface RuntimeDataPayloadMap {
  pals: PalsPayload
  elements: ElementsPayload
  skills: SkillsPayload
  items: ItemsPayload
  workSuitabilities: WorkSuitabilitiesPayload
  breedingIndex: BreedingIndexPayload
  manifest: DatasetManifest
}

export const RUNTIME_DATA_LABELS: Record<RuntimeDataKind, string> = {
  pals: '图鉴数据',
  elements: '属性数据',
  skills: '主动技能数据',
  items: '掉落物数据',
  workSuitabilities: '工作适应性数据',
  breedingIndex: '配种索引',
  manifest: '数据清单',
}

const versionSchema = z.literal(RUNTIME_DATA_SCHEMA_VERSION)
const envelopeSchemas = {
  pals: z.object({ schemaVersion: versionSchema, pals: z.array(z.unknown()) }).passthrough(),
  elements: z.object({ schemaVersion: versionSchema, elements: z.array(z.unknown()) }).passthrough(),
  skills: z.object({ schemaVersion: versionSchema, skills: z.array(z.unknown()) }).passthrough(),
  items: z.object({ schemaVersion: versionSchema, items: z.array(z.unknown()) }).passthrough(),
  workSuitabilities: z.object({ schemaVersion: versionSchema, workSuitabilities: z.array(z.unknown()) }).passthrough(),
  breedingIndex: z.object({
    schemaVersion: versionSchema,
    palIds: z.array(z.string()),
    recipes: z.array(z.unknown()),
    recipesByPair: z.record(z.string(), z.unknown()),
    parentsByChild: z.record(z.string(), z.unknown()),
  }).passthrough(),
  manifest: z.object({
    schemaVersion: versionSchema,
    datasetVersion: z.string().min(1),
    gameReleaseLine: z.string().min(1),
    gameBuildId: z.string().min(1),
    generatedAt: z.string().min(1),
    breedingPolicy: z.object({
      genderMode: z.string().min(1),
      normalizedSpecialPairs: z.number(),
    }).passthrough(),
    sources: z.array(z.unknown()),
    recordCounts: z.record(z.string(), z.number()),
  }).passthrough(),
} satisfies Record<RuntimeDataKind, z.ZodType>

export class RuntimeDataContractError extends Error {
  readonly code = 'runtime-data-contract' as const
  readonly kind: RuntimeDataKind

  constructor(kind: RuntimeDataKind, message: string) {
    super(message)
    this.name = 'RuntimeDataContractError'
    this.kind = kind
  }
}

export function parseRuntimeData<K extends RuntimeDataKind>(
  kind: K,
  value: unknown,
): RuntimeDataPayloadMap[K] {
  const parsed = envelopeSchemas[kind].safeParse(value)
  if (parsed.success) return parsed.data as unknown as RuntimeDataPayloadMap[K]

  const label = RUNTIME_DATA_LABELS[kind]
  const schemaVersion = value && typeof value === 'object'
    ? (value as { schemaVersion?: unknown }).schemaVersion
    : undefined
  if (schemaVersion !== RUNTIME_DATA_SCHEMA_VERSION) {
    throw new RuntimeDataContractError(
      kind,
      `${label}的 Schema 版本不是 ${RUNTIME_DATA_SCHEMA_VERSION}，请先运行 npm run data:build。`,
    )
  }
  throw new RuntimeDataContractError(
    kind,
    `${label}结构不完整，请先运行 npm run data:build。`,
  )
}
