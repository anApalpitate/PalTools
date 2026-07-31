import type {
  BreedingIndexPayload,
  DatasetManifest,
  ElementId,
  PalRecord,
} from '../src/domain/types'
import type { CliDataset } from './data-loader'

export function makePal(overrides: {
  internalId: string
  paldbId?: string
  paldexNo?: string | null
  zhName?: string
  enName?: string
  elements?: ElementId[]
}): PalRecord {
  return {
    internalId: overrides.internalId,
    paldbId: overrides.paldbId ?? overrides.internalId,
    paldexNo: overrides.paldexNo ?? null,
    name: {
      zhHans: overrides.zhName ?? overrides.internalId,
      en: overrides.enName ?? overrides.internalId,
    },
    elements: overrides.elements ?? ['neutral'],
    rarity: null,
    workSuitabilities: {},
    partnerSkill: null,
    stats: {
      hp: null,
      attack: null,
      defense: null,
      workSpeed: null,
      walkSpeed: null,
      runSpeed: null,
      swimSpeed: null,
      rideSprintSpeed: null,
      transportSpeed: null,
      stamina: null,
      foodAmount: null,
    },
    statSources: {},
    activeSkills: null,
    passiveSkills: null,
    drops: null,
    image: { localPath: '', sourceUrl: '', sha256: '' },
    sourceUrl: '',
  }
}

export const TEST_PALS = [
  makePal({
    internalId: 'SheepBall',
    paldbId: 'Lamball',
    paldexNo: '1',
    zhName: '棉悠悠',
    enName: 'Lamball',
  }),
  makePal({
    internalId: 'PinkCat',
    paldbId: 'Cattiva',
    paldexNo: '2',
    zhName: '喵丝特',
    enName: 'Cattiva',
  }),
  makePal({
    internalId: 'ChickenPal',
    paldbId: 'Chikipi',
    paldexNo: '3',
    zhName: '皮皮鸡',
    enName: 'Chikipi',
  }),
]

export const TEST_BREEDING_INDEX: BreedingIndexPayload = {
  schemaVersion: 4,
  palIds: ['SheepBall', 'PinkCat', 'ChickenPal'],
  recipes: [[0, 1, 2]],
  recipesByPair: { '0|1': [0] },
  parentsByChild: { '2': [0] },
}

export function makeTestDataset(): CliDataset {
  return {
    pals: TEST_PALS,
    breedingIndex: TEST_BREEDING_INDEX,
    skills: new Map(),
    items: new Map(),
    elementNames: new Map([['neutral', '无属性']]),
    manifest: makeTestManifest(),
  }
}

export function makeTestManifest(): DatasetManifest {
  return {
    schemaVersion: 4,
    datasetVersion: 'test.1',
    gameReleaseLine: '1.0',
    gameBuildId: '24181527',
    generatedAt: '2026-01-01T00:00:00.000Z',
    breedingPolicy: { genderMode: 'ignored', normalizedSpecialPairs: 1 },
    sources: [],
    recordCounts: {
      pals: 3,
      recipes: 1,
      localImages: 3,
      elementIcons: 9,
      activeSkills: 0,
      activeSkillRefs: 0,
      passiveSkills: 0,
      drops: 0,
      itemIcons: 0,
      workSuitabilityIcons: 12,
    },
  }
}

export interface PlanExportFixture {
  format: 'paltools-breeding-plan'
  schemaVersion: 1
  datasetVersion: string
  exportedAt: string
  plan: {
    name: string
    nodes: Array<{
      id: string
      palId: string
      position: { x: number; y: number }
      source: string
    }>
    relations: Array<{
      id: string
      parentANodeId: string
      parentBNodeId: string
      childNodeId: string
      recipeIndex: number
    }>
    viewport: { x: number; y: number; zoom: number }
  }
}

export function makeValidPlanExport(): PlanExportFixture {
  return {
    format: 'paltools-breeding-plan',
    schemaVersion: 1,
    datasetVersion: 'test.1',
    exportedAt: '2026-07-31T00:00:00.000Z',
    plan: {
      name: '测试方案',
      nodes: [
        {
          id: 'n1',
          palId: 'SheepBall',
          position: { x: 0, y: 0 },
          source: 'preset',
        },
        {
          id: 'n2',
          palId: 'PinkCat',
          position: { x: 200, y: 0 },
          source: 'preset',
        },
        {
          id: 'n3',
          palId: 'ChickenPal',
          position: { x: 100, y: 200 },
          source: 'manual-child',
        },
      ],
      relations: [
        {
          id: 'r1',
          parentANodeId: 'n1',
          parentBNodeId: 'n2',
          childNodeId: 'n3',
          recipeIndex: 0,
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  }
}
