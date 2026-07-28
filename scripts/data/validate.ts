import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import type {
  ActiveSkillRecord,
  DatasetManifest,
  ElementRecord,
  ItemRecord,
  PalRecord,
  PalStatKey,
  WorkSuitabilityRecord,
} from '../../src/domain/types'
import { pairKey } from '../../src/domain/pals'
import {
  BREEDING_EXPECTED_COUNT,
  DATASET_SCHEMA_VERSION,
  GENERATED_DATA_ROOT,
  GENERATED_ELEMENT_IMAGE_ROOT,
  GENERATED_IMAGE_ROOT,
  GENERATED_ITEM_IMAGE_ROOT,
  GENERATED_WORK_IMAGE_ROOT,
  GENERATED_PAL_COUNT,
  PAIR_EXPECTED_COUNT,
  PALCALC_RAW_ROOT,
} from './config'

const statKeys = [
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
] as const satisfies readonly PalStatKey[]

const expectedContentCounts = {
  activeSkills: 307,
  activeSkillRefs: 2380,
  passiveSkills: 51,
  drops: 1643,
  itemRecords: 116,
  itemIcons: 115,
} as const

const elementId = z.enum([
  'neutral',
  'fire',
  'water',
  'electric',
  'grass',
  'dark',
  'dragon',
  'ground',
  'ice',
  'unknown',
])

const palSchema = z.object({
  internalId: z.string().min(1),
  paldbId: z.string().min(1),
  paldexNo: z.string().nullable(),
  name: z.object({ zhHans: z.string().min(1), en: z.string().min(1) }),
  elements: z.array(elementId).min(1),
  rarity: z.number().nullable(),
  workSuitabilities: z.record(z.string(), z.number()),
  partnerSkill: z
    .object({
      name: z.string().min(1).nullable(),
      description: z.string().min(1),
    })
    .nullable(),
  stats: z.object(
    Object.fromEntries(
      statKeys.map((key) => [key, z.number().nonnegative().nullable()]),
    ) as unknown as Record<PalStatKey, z.ZodType<number | null>>,
  ),
  statSources: z.partialRecord(
    z.enum(statKeys),
    z.enum(['paldb', 'palcalc']),
  ),
  activeSkills: z
    .array(
      z.object({
        skillId: z.string().min(1),
        unlockLevel: z.number().int().nonnegative(),
        nameOverride: z.string().min(1).optional(),
        attackRangeOverride: z.string().min(1).optional(),
      }),
    )
    .nullable(),
  passiveSkills: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1),
        rank: z.number().int().min(1).max(4).nullable(),
      }),
    )
    .nullable(),
  drops: z
    .array(
      z.object({
        itemId: z.string().min(1),
        quantityMin: z.number().int().nonnegative(),
        quantityMax: z.number().int().nonnegative(),
        probabilityPercent: z.number().nonnegative().max(100),
        requiredLevel: z.number().int().nonnegative().nullable(),
      }),
    )
    .nullable(),
  image: z.object({
    localPath: z.string().startsWith('/generated/pals/'),
    sourceUrl: z.string().url(),
    sha256: z.string().length(64),
  }),
  sourceUrl: z.string().url(),
})

const elementSchema = z.object({
  id: elementId,
  name: z.object({ zhHans: z.string().min(1) }),
  icon: z
    .object({
      localPath: z.string().startsWith('/generated/elements/'),
      sourceUrl: z.string().url(),
      sha256: z.string().length(64),
    })
    .nullable(),
})

const skillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  element: elementId,
  attackType: z.enum(['melee', 'ranged']),
  power: z.number().nonnegative().nullable(),
  cooldownSeconds: z.number().nonnegative().nullable(),
  attackRange: z.string().min(1).nullable(),
  effects: z.array(z.string().min(1)),
  description: z.string().min(1),
  sourceUrl: z.string().url(),
})

const itemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  icon: z.object({
    localPath: z.string().startsWith('/generated/items/'),
    sourceUrl: z.string().url(),
    sha256: z.string().length(64),
  }),
})

const workSuitabilitySchema = z.object({
  name: z.string().min(1),
  icon: z.object({
    localPath: z.string().startsWith('/generated/work-suitabilities/'),
    sourceUrl: z.string().url(),
    sha256: z.string().length(64),
  }),
})

const sourceRecipeSchema = z.object({
  Parent1InternalName: z.string(),
  Parent1Gender: z.enum(['WILDCARD', 'MALE', 'FEMALE']),
  Parent2InternalName: z.string(),
  Parent2Gender: z.enum(['WILDCARD', 'MALE', 'FEMALE']),
  ChildInternalName: z.string(),
})

async function assertHash(path: string, expected: string, label: string) {
  await stat(path)
  const actual = createHash('sha256')
    .update(await readFile(path))
    .digest('hex')
  if (actual !== expected) throw new Error(`${label}哈希不匹配`)
}

async function main(): Promise<void> {
  const [
    palsRaw,
    elementsRaw,
    skillsRaw,
    itemsRaw,
    workSuitabilitiesRaw,
    indexRaw,
    manifestRaw,
    sourceRecipesRaw,
  ] = await Promise.all([
    readFile(resolve(GENERATED_DATA_ROOT, 'pals.json'), 'utf8'),
    readFile(resolve(GENERATED_DATA_ROOT, 'elements.json'), 'utf8'),
    readFile(resolve(GENERATED_DATA_ROOT, 'skills.json'), 'utf8'),
    readFile(resolve(GENERATED_DATA_ROOT, 'items.json'), 'utf8'),
    readFile(resolve(GENERATED_DATA_ROOT, 'work-suitabilities.json'), 'utf8'),
    readFile(resolve(GENERATED_DATA_ROOT, 'breeding-index.json'), 'utf8'),
    readFile(resolve(GENERATED_DATA_ROOT, 'manifest.json'), 'utf8'),
    readFile(resolve(PALCALC_RAW_ROOT, 'breeding.json'), 'utf8'),
  ])
  const pals = z
    .object({
      schemaVersion: z.literal(DATASET_SCHEMA_VERSION),
      pals: z.array(palSchema),
    })
    .parse(JSON.parse(palsRaw)).pals as PalRecord[]
  const elements = z
    .object({
      schemaVersion: z.literal(DATASET_SCHEMA_VERSION),
      elements: z.array(elementSchema),
    })
    .parse(JSON.parse(elementsRaw)).elements as ElementRecord[]
  const skills = z
    .object({
      schemaVersion: z.literal(DATASET_SCHEMA_VERSION),
      skills: z.array(skillSchema),
    })
    .parse(JSON.parse(skillsRaw)).skills as ActiveSkillRecord[]
  const items = z
    .object({
      schemaVersion: z.literal(DATASET_SCHEMA_VERSION),
      items: z.array(itemSchema),
    })
    .parse(JSON.parse(itemsRaw)).items as ItemRecord[]
  const workSuitabilities = z
    .object({
      schemaVersion: z.literal(DATASET_SCHEMA_VERSION),
      workSuitabilities: z.array(workSuitabilitySchema),
    })
    .parse(JSON.parse(workSuitabilitiesRaw))
    .workSuitabilities as WorkSuitabilityRecord[]
  const index = z
    .object({
      schemaVersion: z.literal(DATASET_SCHEMA_VERSION),
      palIds: z.array(z.string().min(1)),
      recipes: z.array(
        z.tuple([
          z.number().int().nonnegative(),
          z.number().int().nonnegative(),
          z.number().int().nonnegative(),
        ]),
      ),
      recipesByPair: z.record(
        z.string(),
        z.array(z.number().int().nonnegative()),
      ),
      parentsByChild: z.record(
        z.string(),
        z.array(z.number().int().nonnegative()),
      ),
    })
    .parse(JSON.parse(indexRaw))
  const manifest = JSON.parse(manifestRaw) as DatasetManifest
  const sourceRecipes = z
    .object({ Breeding: z.array(sourceRecipeSchema) })
    .parse(JSON.parse(sourceRecipesRaw)).Breeding

  if (pals.length !== GENERATED_PAL_COUNT) {
    throw new Error(`来源并集帕鲁数量不是 ${GENERATED_PAL_COUNT}`)
  }
  if (
    index.recipes.length !== BREEDING_EXPECTED_COUNT ||
    sourceRecipes.length !== BREEDING_EXPECTED_COUNT
  ) {
    throw new Error(`配方数量不是 ${BREEDING_EXPECTED_COUNT}`)
  }

  const internalIds = new Set(pals.map((pal) => pal.internalId))
  const paldbIds = new Set(pals.map((pal) => pal.paldbId))
  if (
    internalIds.size !== GENERATED_PAL_COUNT ||
    paldbIds.size !== GENERATED_PAL_COUNT ||
    new Set(index.palIds).size !== index.palIds.length
  ) {
    throw new Error('帕鲁内部 ID、paldb ID 或紧凑索引 ID 存在重复')
  }
  if (pals.filter((pal) => pal.paldexNo === null).length !== 11) {
    throw new Error('无普通图鉴编号条目不是 11 条')
  }

  const elementIds = new Set(elements.map((element) => element.id))
  if (
    elements.length !== 10 ||
    elementIds.size !== 10 ||
    elements.filter((element) => element.icon !== null).length !== 9 ||
    elements.find((element) => element.id === 'unknown')?.icon !== null
  ) {
    throw new Error('属性目录必须包含 10 条记录、9 个来源图标和 1 个未知占位')
  }
  const skillIds = new Set(skills.map((skill) => skill.id))
  const itemIds = new Set(items.map((item) => item.id))
  if (skillIds.size !== skills.length || itemIds.size !== items.length) {
    throw new Error('技能或掉落物目录存在重复 ID')
  }

  for (const pal of pals) {
    for (const element of pal.elements) {
      if (!elementIds.has(element)) {
        throw new Error(`帕鲁引用了不存在的属性：${pal.internalId}/${element}`)
      }
    }
    for (const key of statKeys) {
      const value = pal.stats[key]
      const source = pal.statSources[key]
      if (value !== null && !source) {
        throw new Error(`非空数值缺少来源：${pal.internalId}/${key}`)
      }
      if (value === null && source) {
        throw new Error(`空数值不应声明来源：${pal.internalId}/${key}`)
      }
    }
    for (const skill of pal.activeSkills ?? []) {
      if (!skillIds.has(skill.skillId)) {
        throw new Error(`帕鲁引用了不存在的主动技能：${pal.internalId}/${skill.skillId}`)
      }
    }
    for (const drop of pal.drops ?? []) {
      if (!itemIds.has(drop.itemId) || drop.quantityMax < drop.quantityMin) {
        throw new Error(`帕鲁掉落物引用无效：${pal.internalId}/${drop.itemId}`)
      }
    }
  }

  const sourceRestricted = sourceRecipes.filter(
    (recipe) =>
      recipe.Parent1Gender !== 'WILDCARD' ||
      recipe.Parent2Gender !== 'WILDCARD',
  )
  if (
    sourceRestricted.length !== 2 ||
    sourceRestricted.some(
      (recipe) =>
        pairKey(recipe.Parent1InternalName, recipe.Parent2InternalName) !==
        pairKey('CatMage', 'FoxMage'),
    )
  ) {
    throw new Error('PalCalc 原始性别特例不符合预期')
  }

  const pairKeys = new Set<string>()
  const forwardReferences = new Uint16Array(index.recipes.length)
  const reverseReferences = new Uint16Array(index.recipes.length)
  for (const [key, recipeIndexes] of Object.entries(index.recipesByPair)) {
    pairKeys.add(key)
    for (const recipeIndex of recipeIndexes) {
      if (!index.recipes[recipeIndex]) throw new Error('正向索引越界')
      forwardReferences[recipeIndex] += 1
    }
  }
  for (const [childKey, recipeIndexes] of Object.entries(index.parentsByChild)) {
    for (const recipeIndex of recipeIndexes) {
      const recipe = index.recipes[recipeIndex]
      if (!recipe || String(recipe[2]) !== childKey) {
        throw new Error('反向索引越界或子代键不匹配')
      }
      reverseReferences[recipeIndex] += 1
    }
  }
  if (
    pairKeys.size !== PAIR_EXPECTED_COUNT ||
    Object.keys(index.recipesByPair).length !== PAIR_EXPECTED_COUNT ||
    forwardReferences.some((count) => count !== 1) ||
    reverseReferences.some((count) => count !== 1)
  ) {
    throw new Error('正反向索引覆盖不完整')
  }
  const catMage = index.palIds.indexOf('CatMage')
  const foxMage = index.palIds.indexOf('FoxMage')
  const specialKey = [catMage, foxMage].sort((a, b) => a - b).join('|')
  const specialChildren = (index.recipesByPair[specialKey] ?? [])
    .map((recipeIndex) => index.palIds[index.recipes[recipeIndex][2]])
    .sort()
  if (
    JSON.stringify(specialChildren) !==
    JSON.stringify(['CatMage_Fire', 'FoxMage_Dark'])
  ) {
    throw new Error('Katress + Wixen 无性别双结果不符合预期')
  }
  if (
    Object.entries(index.recipesByPair).some(
      ([key, values]) => key !== specialKey && values.length !== 1,
    )
  ) {
    throw new Error('出现了非预期的多结果亲本组合')
  }

  for (const pal of pals) {
    const imageName = pal.image.localPath.split('/').at(-1)
    if (!imageName) throw new Error(`图片路径无效：${pal.internalId}`)
    await assertHash(
      resolve(GENERATED_IMAGE_ROOT, imageName),
      pal.image.sha256,
      `帕鲁图片 ${pal.paldbId}`,
    )
  }
  for (const element of elements) {
    if (!element.icon) continue
    await assertHash(
      resolve(
        GENERATED_ELEMENT_IMAGE_ROOT,
        element.icon.localPath.split('/').at(-1) ?? '',
      ),
      element.icon.sha256,
      `属性图片 ${element.id}`,
    )
  }
  for (const item of items) {
    await assertHash(
      resolve(
        GENERATED_ITEM_IMAGE_ROOT,
        item.icon.localPath.split('/').at(-1) ?? '',
      ),
      item.icon.sha256,
      `掉落物图片 ${item.id}`,
    )
  }
  for (const item of workSuitabilities) {
    await assertHash(
      resolve(
        GENERATED_WORK_IMAGE_ROOT,
        item.icon.localPath.split('/').at(-1) ?? '',
      ),
      item.icon.sha256,
      `工作适应性图片 ${item.name}`,
    )
  }
  const workNames = new Set(
    pals.flatMap((pal) => Object.keys(pal.workSuitabilities)),
  )
  if (
    workSuitabilities.length !== workNames.size ||
    workSuitabilities.some((item) => !workNames.has(item.name))
  ) {
    throw new Error('工作适应性名称与图标目录不一致')
  }

  const counts = {
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
    workSuitabilityIcons: new Set(
      workSuitabilities.map((item) => item.icon.localPath),
    ).size,
  }
  if (
    counts.activeSkills !== expectedContentCounts.activeSkills ||
    counts.activeSkillRefs !== expectedContentCounts.activeSkillRefs ||
    counts.passiveSkills !== expectedContentCounts.passiveSkills ||
    counts.drops !== expectedContentCounts.drops ||
    items.length !== expectedContentCounts.itemRecords ||
    counts.itemIcons !== expectedContentCounts.itemIcons
  ) {
    throw new Error(
      `图鉴内容覆盖率发生变化：${JSON.stringify({ ...counts, itemRecords: items.length })}`,
    )
  }
  if (
    manifest.schemaVersion !== DATASET_SCHEMA_VERSION ||
    manifest.breedingPolicy.genderMode !== 'ignored' ||
    manifest.breedingPolicy.normalizedSpecialPairs !== 1 ||
    manifest.recordCounts.pals !== pals.length ||
    manifest.recordCounts.recipes !== index.recipes.length ||
    manifest.recordCounts.localImages !==
      new Set(pals.map((pal) => pal.image.localPath)).size ||
    manifest.recordCounts.elementIcons !== 9 ||
    Object.entries(counts).some(
      ([key, value]) =>
        manifest.recordCounts[key as keyof typeof counts] !== value,
    )
  ) {
    throw new Error('manifest 与 Schema v4 生成数据不一致')
  }
  const manifestText = JSON.stringify(manifest).toLowerCase()
  if (manifestText.includes('unknown') || manifestText.includes('pending')) {
    throw new Error('manifest 包含 unknown 或 pending')
  }

  console.log(
    `数据校验通过：${pals.length} 个帕鲁，${index.recipes.length} 条无性别配方，${pairKeys.size} 个组合，${skills.length} 个主动技能，${items.length} 个掉落物条目，${counts.itemIcons} 个掉落物图标`,
  )
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) await main()
