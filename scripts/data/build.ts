import { createHash } from 'node:crypto'
import {
  mkdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import type {
  ActiveSkillRecord,
  BreedingIndexPayload,
  BreedingRecipe,
  DatasetManifest,
  ElementId,
  ElementRecord,
  ElementsPayload,
  ItemRecord,
  ItemsPayload,
  PalRecord,
  PalStatKey,
  PalStatSource,
  PalsPayload,
  SkillsPayload,
} from '../../src/domain/types'
import { pairKey } from '../../src/domain/pals'
import {
  BREEDING_EXPECTED_COUNT,
  DATASET_SCHEMA_VERSION,
  GAME_BUILD_ID,
  GAME_RELEASE_LINE,
  GENERATED_DATA_ROOT,
  GENERATED_ELEMENT_IMAGE_ROOT,
  GENERATED_IMAGE_ROOT,
  GENERATED_ITEM_IMAGE_ROOT,
  GENERATED_PAL_COUNT,
  PALCALC_BREEDING_SHA256,
  PALCALC_BREEDING_URL,
  PALCALC_DB_URL,
  PALCALC_RAW_ROOT,
  PALCALC_RELEASE,
  PALCALC_REVISION,
  PALDB_BASE_URL,
  PALDB_EXPECTED_COUNT,
  PALDB_RAW_ROOT,
  PROJECT_ROOT,
} from './config'
import {
  ELEMENT_LABEL_TO_ID,
  rawElementAssetSchema,
  rawItemAssetSchema,
  rawRecordSchema as paldbRecordSchema,
} from './paldb/schema'

const palCalcPalSchema = z.object({
  Id: z.object({
    PalDexNo: z.number().int(),
    IsVariant: z.boolean(),
  }),
  Name: z.string().min(1),
  LocalizedNames: z.record(z.string(), z.string()),
  InternalName: z.string().min(1),
  Rarity: z.number().int(),
  WorkSuitability: z.record(z.string(), z.number()),
  Hp: z.number(),
  Attack: z.number(),
  Defense: z.number(),
  WalkSpeed: z.number(),
  RunSpeed: z.number(),
  RideSprintSpeed: z.number(),
  TransportSpeed: z.number(),
  Stamina: z.number(),
  FoodAmount: z.number(),
})

const palCalcDbSchema = z.object({
  Version: z.string(),
  Pals: z.array(palCalcPalSchema),
})

const rawRecipeSchema = z.object({
  Parent1InternalName: z.string(),
  Parent1Gender: z.enum(['WILDCARD', 'MALE', 'FEMALE']),
  Parent2InternalName: z.string(),
  Parent2Gender: z.enum(['WILDCARD', 'MALE', 'FEMALE']),
  ChildInternalName: z.string(),
})

const breedingDbSchema = z.object({
  Breeding: z.array(rawRecipeSchema),
})

const workLabels: Record<string, string> = {
  Kindling: '生火',
  Watering: '浇水',
  Planting: '播种',
  GenerateElectricity: '发电',
  Handiwork: '手工作业',
  Gathering: '采集',
  Lumbering: '伐木',
  Mining: '采矿',
  MedicineProduction: '制药',
  Cooling: '冷却',
  Transporting: '搬运',
  Farming: '牧场',
}

function normalizeName(value: string): string {
  return value.normalize('NFKD').replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

function dateStampInShanghai(value: Date, separator: '.' | '-'): string {
  const shanghai = new Date(value.getTime() + 8 * 60 * 60 * 1_000)
  const year = shanghai.getUTCFullYear()
  const month = String(shanghai.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shanghai.getUTCDate()).padStart(2, '0')
  return [year, month, day].join(separator)
}

function datasetVersion(now: Date): string {
  return `${dateStampInShanghai(now, '.')}.1`
}

function formatPaldexNo(paldexNo: number, isVariant: boolean): string {
  return `${String(paldexNo).padStart(3, '0')}${isVariant ? 'B' : ''}`
}

const statKeys: PalStatKey[] = [
  'hp',
  'attack',
  'defense',
  'workSpeed',
  'walkSpeed',
  'runSpeed',
  'swimSpeed',
  'rideSprintSpeed',
  'transportSpeed',
  'stamina',
  'foodAmount',
]

type PalCalcPal = z.infer<typeof palCalcPalSchema>
type PaldbRecord = z.infer<typeof paldbRecordSchema>

function normalizedStat(value: number | undefined): number | null {
  return value === undefined || value < 0 ? null : value
}

function buildStats(
  raw: PaldbRecord | null,
  match: PalCalcPal | null,
): Pick<PalRecord, 'stats' | 'statSources'> {
  const stats = Object.fromEntries(
    statKeys.map((key) => [key, null]),
  ) as Record<PalStatKey, number | null>
  const statSources: Partial<Record<PalStatKey, PalStatSource>> = {}

  if (raw) {
    for (const key of [
      'hp',
      'attack',
      'defense',
      'workSpeed',
      'walkSpeed',
      'runSpeed',
      'swimSpeed',
      'stamina',
      'foodAmount',
    ] as const) {
      stats[key] = raw.stats[key]
      if (stats[key] !== null) statSources[key] = 'paldb'
    }
  } else if (match) {
    const palCalcFields: Partial<Record<PalStatKey, number>> = {
      hp: match.Hp,
      attack: match.Attack,
      defense: match.Defense,
      walkSpeed: match.WalkSpeed,
      runSpeed: match.RunSpeed,
      stamina: match.Stamina,
      foodAmount: match.FoodAmount,
    }
    for (const [key, value] of Object.entries(palCalcFields) as Array<
      [PalStatKey, number]
    >) {
      stats[key] = normalizedStat(value)
      if (stats[key] !== null) statSources[key] = 'palcalc'
    }
  }

  if (match) {
    stats.rideSprintSpeed = normalizedStat(match.RideSprintSpeed)
    stats.transportSpeed = normalizedStat(match.TransportSpeed)
    if (stats.rideSprintSpeed !== null) statSources.rideSprintSpeed = 'palcalc'
    if (stats.transportSpeed !== null) statSources.transportSpeed = 'palcalc'
  }

  return { stats, statSources }
}

function mapElements(labels: string[]): ElementId[] {
  return labels.map((label) => {
    const id = ELEMENT_LABEL_TO_ID[label as keyof typeof ELEMENT_LABEL_TO_ID]
    if (!id) throw new Error(`未映射的属性名称：${label}`)
    return id
  })
}

async function main(): Promise<void> {
  const [
    paldbRaw,
    rawElementsText,
    rawItemsText,
    palCalcDbRaw,
    breedingRaw,
    sourceRaw,
    aliasesRaw,
  ] =
    await Promise.all([
      readFile(resolve(PALDB_RAW_ROOT, 'pals.json'), 'utf8'),
      readFile(resolve(PALDB_RAW_ROOT, 'elements.json'), 'utf8'),
      readFile(resolve(PALDB_RAW_ROOT, 'items.json'), 'utf8'),
      readFile(resolve(PALCALC_RAW_ROOT, 'db.json'), 'utf8'),
      readFile(resolve(PALCALC_RAW_ROOT, 'breeding.json'), 'utf8'),
      readFile(resolve(PALCALC_RAW_ROOT, 'source.json'), 'utf8'),
      readFile(resolve(PROJECT_ROOT, 'data/paldb-aliases.json'), 'utf8'),
    ])

  const paldbRecords = z.array(paldbRecordSchema).parse(JSON.parse(paldbRaw))
  const rawElementAssets = z
    .array(rawElementAssetSchema)
    .parse(JSON.parse(rawElementsText))
  const rawItemAssets = z
    .array(rawItemAssetSchema)
    .parse(JSON.parse(rawItemsText))
  const palCalcDb = palCalcDbSchema.parse(JSON.parse(palCalcDbRaw))
  const breedingDb = breedingDbSchema.parse(JSON.parse(breedingRaw))
  const source = z
    .object({
      dbSha256: z.string(),
      breedingSha256: z.string(),
      fetchedAt: z.string(),
    })
    .parse(JSON.parse(sourceRaw))
  const aliases = z
    .object({
      paldbToInternalId: z.record(z.string(), z.string()),
      palCalcOnly: z.record(
        z.string(),
        z.object({
          paldbId: z.string(),
          basePaldbId: z.string(),
          paldexNo: z.string(),
          nameZhHans: z.string(),
          nameEn: z.string(),
        }),
      ),
    })
    .parse(JSON.parse(aliasesRaw))

  if (
    paldbRecords.length !== PALDB_EXPECTED_COUNT ||
    palCalcDb.Pals.length !== PALDB_EXPECTED_COUNT
  ) {
    throw new Error('图鉴来源记录数不是 299，拒绝生成')
  }
  if (breedingDb.Breeding.length !== BREEDING_EXPECTED_COUNT) {
    throw new Error('配方来源记录数不是 44,851，拒绝生成')
  }

  const palsByNormalizedName = new Map<string, typeof palCalcDb.Pals>()
  const palsByInternalId = new Map(
    palCalcDb.Pals.map((pal) => [pal.InternalName, pal]),
  )
  for (const pal of palCalcDb.Pals) {
    const key = normalizeName(pal.Name)
    const values = palsByNormalizedName.get(key) ?? []
    values.push(pal)
    palsByNormalizedName.set(key, values)
  }

  const matchedInternalIds = new Set<string>()
  const pals: PalRecord[] = []
  const skillsById = new Map<string, ActiveSkillRecord>()
  for (const raw of paldbRecords) {
    for (const skill of raw.activeSkills) {
      const record: ActiveSkillRecord = {
        id: skill.id,
        name: skill.name,
        element: mapElements([skill.elementLabel])[0],
        attackType: skill.attackType,
        power: skill.power,
        cooldownSeconds: skill.cooldownSeconds,
        attackRange: skill.attackRange,
        effects: skill.effects,
        description: skill.description,
        sourceUrl: skill.sourceUrl,
      }
      const existing = skillsById.get(skill.id)
      if (existing) {
        const invariant = ({ name: _name, attackRange: _range, ...value }: ActiveSkillRecord) =>
          value
        if (
          JSON.stringify(invariant(existing)) !==
          JSON.stringify(invariant(record))
        ) {
          throw new Error(`主动技能固定字段不一致：${skill.id}`)
        }
      } else {
        skillsById.set(skill.id, record)
      }
    }
  }
  const itemIds = new Set(rawItemAssets.map((item) => item.id))

  for (const raw of paldbRecords) {
    const forcedInternalId = aliases.paldbToInternalId[raw.paldbId]
    const forcedMatch = forcedInternalId
      ? palsByInternalId.get(forcedInternalId)
      : undefined
    const matches = forcedMatch
      ? [forcedMatch]
      : palsByNormalizedName.get(normalizeName(raw.paldbId)) ?? []

    // paldb 已增加 No.204 枯星龙，但固定 PalCalc v1.17.6 尚未收录。
    if (!forcedMatch && forcedInternalId === 'WorldTreeDragon') {
      pals.push({
        internalId: forcedInternalId,
        paldbId: raw.paldbId,
        paldexNo: raw.paldexNo,
        name: { zhHans: raw.nameZhHans, en: raw.paldbId },
        elements: mapElements(raw.elementLabels),
        rarity: raw.rarity,
        workSuitabilities: raw.workSuitabilities,
        partnerSkill: {
          name: raw.partnerSkillName,
          description: raw.partnerSkillDescription,
        },
        ...buildStats(raw, null),
        activeSkills: raw.activeSkills.map((skill) => {
          const canonical = skillsById.get(skill.id)
          return {
            skillId: skill.id,
            unlockLevel: skill.unlockLevel,
            ...(canonical?.name !== skill.name
              ? { nameOverride: skill.name }
              : {}),
            ...(canonical?.attackRange !== skill.attackRange &&
            skill.attackRange !== null
              ? { attackRangeOverride: skill.attackRange }
              : {}),
          }
        }),
        passiveSkills: raw.passiveSkills,
        drops: raw.drops.map((drop) => ({
          itemId: drop.itemId,
          quantityMin: drop.quantityMin,
          quantityMax: drop.quantityMax,
          probabilityPercent: drop.probabilityPercent,
          requiredLevel: drop.requiredLevel,
        })),
        image: {
          localPath: `/generated/pals/${raw.paldbId}.webp`,
          sourceUrl: raw.imageSourceUrl,
          sha256: raw.imageSha256,
        },
        sourceUrl: raw.sourceUrl,
      })
      continue
    }

    if (matches.length !== 1) {
      throw new Error(
        `paldbId 无法一对一关联 PalCalc：${raw.paldbId}（匹配 ${matches.length} 条）`,
      )
    }

    const match = matches[0]
    if (matchedInternalIds.has(match.InternalName)) {
      throw new Error(`PalCalc 内部 ID 被重复关联：${match.InternalName}`)
    }
    matchedInternalIds.add(match.InternalName)

    const fallbackWorks = Object.fromEntries(
      Object.entries(match.WorkSuitability)
        .filter(([, level]) => level > 0)
        .map(([work, level]) => [workLabels[work] ?? work, level]),
    )

    pals.push({
      internalId: match.InternalName,
      paldbId: raw.paldbId,
      paldexNo:
        match.Id.PalDexNo >= 10_000
          ? null
          : raw.paldexNo ??
            formatPaldexNo(match.Id.PalDexNo, match.Id.IsVariant),
      name: {
        zhHans: raw.nameZhHans || match.LocalizedNames['zh-Hans'],
        en: match.LocalizedNames.en || match.Name,
      },
      elements: mapElements(raw.elementLabels),
      rarity: raw.rarity ?? match.Rarity,
      workSuitabilities:
        Object.keys(raw.workSuitabilities).length > 0
          ? raw.workSuitabilities
          : fallbackWorks,
      partnerSkill: {
        name: raw.partnerSkillName,
        description: raw.partnerSkillDescription,
      },
      ...buildStats(raw, match),
      activeSkills: raw.activeSkills.map((skill) => {
        const canonical = skillsById.get(skill.id)
        return {
          skillId: skill.id,
          unlockLevel: skill.unlockLevel,
          ...(canonical?.name !== skill.name
            ? { nameOverride: skill.name }
            : {}),
          ...(canonical?.attackRange !== skill.attackRange &&
          skill.attackRange !== null
            ? { attackRangeOverride: skill.attackRange }
            : {}),
        }
      }),
      passiveSkills: raw.passiveSkills,
      drops: raw.drops.map((drop) => {
        if (!itemIds.has(drop.itemId)) {
          throw new Error(`掉落物缺少素材目录：${drop.itemId}`)
        }
        return {
          itemId: drop.itemId,
          quantityMin: drop.quantityMin,
          quantityMax: drop.quantityMax,
          probabilityPercent: drop.probabilityPercent,
          requiredLevel: drop.requiredLevel,
        }
      }),
      image: {
        localPath: `/generated/pals/${raw.paldbId}.webp`,
        sourceUrl: raw.imageSourceUrl,
        sha256: raw.imageSha256,
      },
      sourceUrl: raw.sourceUrl,
    })
  }

  for (const [internalId, synthetic] of Object.entries(
    aliases.palCalcOnly,
  )) {
    const match = palsByInternalId.get(internalId)
    const base = pals.find((pal) => pal.paldbId === synthetic.basePaldbId)
    if (!match || !base) {
      throw new Error(`无法生成 PalCalc 专用变体：${internalId}`)
    }
    matchedInternalIds.add(match.InternalName)
    const syntheticWorks = Object.fromEntries(
      Object.entries(match.WorkSuitability)
        .filter(([, level]) => level > 0)
        .map(([work, level]) => [workLabels[work] ?? work, level]),
    )
    pals.push({
      internalId: match.InternalName,
      paldbId: synthetic.paldbId,
      paldexNo: synthetic.paldexNo,
      name: {
        zhHans: synthetic.nameZhHans,
        en: synthetic.nameEn,
      },
      elements: base.elements,
      rarity: match.Rarity,
      workSuitabilities: syntheticWorks,
      partnerSkill: null,
      ...buildStats(null, match),
      activeSkills: null,
      passiveSkills: null,
      drops: null,
      image: base.image,
      sourceUrl: base.sourceUrl,
    })
  }

  if (matchedInternalIds.size !== PALDB_EXPECTED_COUNT) {
    const missing = palCalcDb.Pals.filter(
      (pal) => !matchedInternalIds.has(pal.InternalName),
    ).map((pal) => pal.Name)
    throw new Error(`有 PalCalc 帕鲁未关联：${missing.join(', ')}`)
  }
  if (pals.length !== GENERATED_PAL_COUNT) {
    throw new Error(`来源并集帕鲁数量不是 ${GENERATED_PAL_COUNT}`)
  }

  pals.sort((a, b) => {
    if (a.paldexNo === null) return b.paldexNo === null ? 0 : 1
    if (b.paldexNo === null) return -1
    return a.paldexNo.localeCompare(b.paldexNo, undefined, { numeric: true })
  })

  const restrictedSource = breedingDb.Breeding.filter(
    (recipe) =>
      recipe.Parent1Gender !== 'WILDCARD' ||
      recipe.Parent2Gender !== 'WILDCARD',
  )
  const expectedRestricted = new Set([
    'FEMALE|MALE|CatMage_Fire',
    'MALE|FEMALE|FoxMage_Dark',
  ])
  if (
    restrictedSource.length !== 2 ||
    restrictedSource.some(
      (recipe) =>
        pairKey(recipe.Parent1InternalName, recipe.Parent2InternalName) !==
          pairKey('CatMage', 'FoxMage') ||
        !expectedRestricted.has(
          `${recipe.Parent1Gender}|${recipe.Parent2Gender}|${recipe.ChildInternalName}`,
        ),
    )
  ) {
    throw new Error('PalCalc 性别特例与预期不一致，拒绝执行无性别规范化')
  }

  const recipes: BreedingRecipe[] = breedingDb.Breeding.map((recipe) => ({
    parentAId: recipe.Parent1InternalName,
    parentBId: recipe.Parent2InternalName,
    childId: recipe.ChildInternalName,
  }))
  const palIds = pals.map((pal) => pal.internalId)
  const palIndexById = new Map(palIds.map((id, index) => [id, index]))
  const compactRecipes = recipes.map(
    (recipe): [number, number, number] => {
      const parentA = palIndexById.get(recipe.parentAId)
      const parentB = palIndexById.get(recipe.parentBId)
      const child = palIndexById.get(recipe.childId)
      if (parentA === undefined || parentB === undefined || child === undefined) {
        throw new Error(`配方引用无法索引：${JSON.stringify(recipe)}`)
      }
      return [parentA, parentB, child]
    },
  )
  const recipesByPair: Record<string, number[]> = {}
  const parentsByChild: Record<string, number[]> = {}
  for (const [recipeIndex, [parentA, parentB, child]] of compactRecipes.entries()) {
    const key = [parentA, parentB].sort((a, b) => a - b).join('|')
    recipesByPair[key] ??= []
    recipesByPair[key].push(recipeIndex)
    const childKey = String(child)
    parentsByChild[childKey] ??= []
    parentsByChild[childKey].push(recipeIndex)
  }

  for (const pal of pals) {
    const imageName = pal.image.localPath.split('/').at(-1)
    if (!imageName) throw new Error(`图片路径无效：${pal.internalId}`)
    await stat(resolve(GENERATED_IMAGE_ROOT, imageName))
  }

  const elements: ElementRecord[] = [
    ...rawElementAssets.map((asset) => ({
      id: asset.id,
      name: { zhHans: asset.labelZhHans },
      icon: {
        localPath: asset.localPath,
        sourceUrl: asset.sourceUrl,
        sha256: asset.sha256,
      },
    })),
    {
      id: 'unknown' as const,
      name: { zhHans: '未知属性' },
      icon: null,
    },
  ]
  for (const element of elements) {
    if (!element.icon) continue
    await stat(
      resolve(
        GENERATED_ELEMENT_IMAGE_ROOT,
        element.icon.localPath.split('/').at(-1) ?? '',
      ),
    )
  }
  const skills = [...skillsById.values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  )
  const items: ItemRecord[] = rawItemAssets
    .map((item) => ({
      id: item.id,
      name: item.name,
      icon: {
        localPath: item.localPath,
        sourceUrl: item.sourceUrl,
        sha256: item.sha256,
      },
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
  for (const item of items) {
    await stat(
      resolve(
        GENERATED_ITEM_IMAGE_ROOT,
        item.icon.localPath.split('/').at(-1) ?? '',
      ),
    )
  }

  const now = new Date()
  const manifest: DatasetManifest = {
    schemaVersion: DATASET_SCHEMA_VERSION,
    datasetVersion: datasetVersion(now),
    gameReleaseLine: GAME_RELEASE_LINE,
    gameBuildId: GAME_BUILD_ID,
    generatedAt: now.toISOString(),
    breedingPolicy: {
      genderMode: 'ignored',
      normalizedSpecialPairs: 1,
    },
    sources: [
      {
        name: 'paldb.cn public pal pages',
        revision: `fetched-${dateStampInShanghai(
          new Date(paldbRecords[0].fetchedAt),
          '-',
        )}`,
        url: `${PALDB_BASE_URL}/pals`,
        sha256: sha256(Buffer.from(paldbRaw)),
      },
      {
        name: 'PalCalc db.json',
        revision: `${PALCALC_RELEASE}@${PALCALC_REVISION}`,
        url: PALCALC_DB_URL,
        sha256: source.dbSha256,
      },
      {
        name: 'PalCalc breeding.json',
        revision: `${PALCALC_RELEASE}@${PALCALC_REVISION}`,
        url: PALCALC_BREEDING_URL,
        sha256: source.breedingSha256,
      },
    ],
    recordCounts: {
      pals: pals.length,
      recipes: recipes.length,
      localImages: new Set(pals.map((pal) => pal.image.localPath)).size,
      elementIcons: elements.filter((element) => element.icon !== null).length,
      activeSkills: skills.length,
      activeSkillRefs: pals.reduce(
        (total, pal) => total + (pal.activeSkills?.length ?? 0),
        0,
      ),
      passiveSkills: pals.reduce(
        (total, pal) => total + (pal.passiveSkills?.length ?? 0),
        0,
      ),
      drops: pals.reduce(
        (total, pal) => total + (pal.drops?.length ?? 0),
        0,
      ),
      itemIcons: new Set(items.map((item) => item.icon.localPath)).size,
    },
  }

  if (source.breedingSha256 !== PALCALC_BREEDING_SHA256) {
    throw new Error('来源清单中的 breeding.json 哈希不匹配')
  }

  const palsPayload: PalsPayload = {
    schemaVersion: DATASET_SCHEMA_VERSION,
    pals,
  }
  const elementsPayload: ElementsPayload = {
    schemaVersion: DATASET_SCHEMA_VERSION,
    elements,
  }
  const skillsPayload: SkillsPayload = {
    schemaVersion: DATASET_SCHEMA_VERSION,
    skills,
  }
  const itemsPayload: ItemsPayload = {
    schemaVersion: DATASET_SCHEMA_VERSION,
    items,
  }
  const indexPayload: BreedingIndexPayload = {
    schemaVersion: DATASET_SCHEMA_VERSION,
    palIds,
    recipes: compactRecipes,
    recipesByPair,
    parentsByChild,
  }

  await mkdir(GENERATED_DATA_ROOT, { recursive: true })
  await Promise.all([
    writeFile(
      resolve(GENERATED_DATA_ROOT, 'pals.json'),
      `${JSON.stringify(palsPayload)}\n`,
      'utf8',
    ),
    writeFile(
      resolve(GENERATED_DATA_ROOT, 'elements.json'),
      `${JSON.stringify(elementsPayload)}\n`,
      'utf8',
    ),
    writeFile(
      resolve(GENERATED_DATA_ROOT, 'skills.json'),
      `${JSON.stringify(skillsPayload)}\n`,
      'utf8',
    ),
    writeFile(
      resolve(GENERATED_DATA_ROOT, 'items.json'),
      `${JSON.stringify(itemsPayload)}\n`,
      'utf8',
    ),
    writeFile(
      resolve(GENERATED_DATA_ROOT, 'breeding-index.json'),
      `${JSON.stringify(indexPayload)}\n`,
      'utf8',
    ),
    writeFile(
      resolve(GENERATED_DATA_ROOT, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    ),
  ])

  console.log(
    `数据生成完成：${pals.length} 个帕鲁，${recipes.length} 条配方，${Object.keys(recipesByPair).length} 个亲本组合`,
  )
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) {
  await main()
}
