export type ElementId =
  | 'neutral'
  | 'fire'
  | 'water'
  | 'electric'
  | 'grass'
  | 'dark'
  | 'dragon'
  | 'ground'
  | 'ice'
  | 'unknown'

export type PalStatKey =
  | 'hp'
  | 'attack'
  | 'defense'
  | 'workSpeed'
  | 'walkSpeed'
  | 'runSpeed'
  | 'swimSpeed'
  | 'rideSprintSpeed'
  | 'transportSpeed'
  | 'stamina'
  | 'foodAmount'

export type PalStatSource = 'paldb' | 'palcalc'

export interface PalActiveSkillRef {
  skillId: string
  unlockLevel: number
  nameOverride?: string
  attackRangeOverride?: string
}

export interface PassiveSkillRecord {
  name: string
  description: string
  rank: number | null
}

export interface PalDropRecord {
  itemId: string
  quantityMin: number
  quantityMax: number
  probabilityPercent: number
  requiredLevel: number | null
}

export interface PalRecord {
  internalId: string
  paldbId: string
  paldexNo: string | null
  name: {
    zhHans: string
    en: string
  }
  elements: ElementId[]
  rarity: number | null
  workSuitabilities: Record<string, number>
  partnerSkill: {
    name: string | null
    description: string
  } | null
  stats: Record<PalStatKey, number | null>
  statSources: Partial<Record<PalStatKey, PalStatSource>>
  activeSkills: PalActiveSkillRef[] | null
  passiveSkills: PassiveSkillRecord[] | null
  drops: PalDropRecord[] | null
  image: {
    localPath: string
    sourceUrl: string
    sha256: string
  }
  sourceUrl: string
}

export interface ActiveSkillRecord {
  id: string
  name: string
  element: ElementId
  attackType: 'melee' | 'ranged'
  power: number | null
  cooldownSeconds: number | null
  attackRange: string | null
  effects: string[]
  description: string
  sourceUrl: string
}

export interface ItemRecord {
  id: string
  name: string
  icon: {
    localPath: string
    sourceUrl: string
    sha256: string
  }
}

export interface ElementRecord {
  id: ElementId
  name: {
    zhHans: string
  }
  icon: {
    localPath: string
    sourceUrl: string
    sha256: string
  } | null
}

export interface WorkSuitabilityRecord {
  name: string
  icon: {
    localPath: string
    sourceUrl: string
    sha256: string
  }
}

export interface BreedingRecipe {
  parentAId: string
  parentBId: string
  childId: string
}

export type CompactBreedingRecipe = [
  parentAIndex: number,
  parentBIndex: number,
  childIndex: number,
]

export interface BreedingIndexPayload {
  schemaVersion: 4
  palIds: string[]
  recipes: CompactBreedingRecipe[]
  recipesByPair: Record<string, number[]>
  parentsByChild: Record<string, number[]>
}

export interface DatasetManifest {
  schemaVersion: number
  datasetVersion: string
  gameReleaseLine: '1.0'
  gameBuildId: '24181527'
  generatedAt: string
  breedingPolicy: {
    genderMode: 'ignored'
    normalizedSpecialPairs: number
  }
  sources: Array<{
    name: string
    revision: string
    url: string
    sha256?: string
  }>
  recordCounts: {
    pals: number
    recipes: number
    localImages: number
    elementIcons: number
    activeSkills: number
    activeSkillRefs: number
    passiveSkills: number
    drops: number
    itemIcons: number
    workSuitabilityIcons: number
  }
}

export interface PalsPayload {
  schemaVersion: number
  pals: PalRecord[]
}

export interface ElementsPayload {
  schemaVersion: number
  elements: ElementRecord[]
}

export interface SkillsPayload {
  schemaVersion: number
  skills: ActiveSkillRecord[]
}

export interface ItemsPayload {
  schemaVersion: number
  items: ItemRecord[]
}

export interface WorkSuitabilitiesPayload {
  schemaVersion: number
  workSuitabilities: WorkSuitabilityRecord[]
}
