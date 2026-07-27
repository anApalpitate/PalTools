import { z } from 'zod'
import type { ElementId } from '../../../src/domain/types'

export const paldbStatsSchema = z.object({
  hp: z.number().nonnegative().nullable(),
  attack: z.number().nonnegative().nullable(),
  defense: z.number().nonnegative().nullable(),
  workSpeed: z.number().nonnegative().nullable(),
  walkSpeed: z.number().nonnegative().nullable(),
  runSpeed: z.number().nonnegative().nullable(),
  swimSpeed: z.number().nonnegative().nullable(),
  stamina: z.number().nonnegative().nullable(),
  foodAmount: z.number().int().min(1).max(10),
})

export const rawActiveSkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  elementLabel: z.string().min(1),
  attackType: z.enum(['melee', 'ranged']),
  unlockLevel: z.number().int().nonnegative(),
  power: z.number().nonnegative().nullable(),
  cooldownSeconds: z.number().nonnegative().nullable(),
  attackRange: z.string().min(1).nullable(),
  effects: z.array(z.string().min(1)),
  description: z.string().min(1),
  sourceUrl: z.string().url(),
})

export const rawPassiveSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  rank: z.number().int().min(1).max(4).nullable(),
})

export const rawDropSchema = z.object({
  itemId: z.string().min(1),
  itemName: z.string().min(1),
  itemSourceUrl: z.string().url(),
  quantityMin: z.number().int().nonnegative(),
  quantityMax: z.number().int().nonnegative(),
  probabilityPercent: z.number().nonnegative().max(100),
  requiredLevel: z.number().int().nonnegative().nullable(),
})

export const rawRecordSchema = z.object({
  paldbId: z.string().min(1),
  paldexNo: z.string().nullable(),
  nameZhHans: z.string().min(1),
  elementLabels: z.array(z.string()).min(1),
  rarity: z.number().int().nonnegative().nullable(),
  workSuitabilities: z.record(z.string(), z.number().int().positive()),
  partnerSkillName: z.string().nullable(),
  partnerSkillDescription: z.string().min(1),
  stats: paldbStatsSchema,
  activeSkills: z.array(rawActiveSkillSchema),
  passiveSkills: z.array(rawPassiveSkillSchema),
  drops: z.array(rawDropSchema),
  imageSourceUrl: z.string().url(),
  imageSha256: z.string().length(64),
  sourceUrl: z.string().url(),
  fetchedAt: z.string().datetime(),
})

export const rawElementAssetSchema = z.object({
  id: z.enum([
    'neutral',
    'fire',
    'water',
    'electric',
    'grass',
    'dark',
    'dragon',
    'ground',
    'ice',
  ]),
  labelZhHans: z.string().min(1),
  sourceUrl: z.string().url(),
  localPath: z.string().startsWith('/generated/elements/'),
  sha256: z.string().length(64),
})

export const rawItemAssetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sourceUrl: z.string().url(),
  localPath: z.string().startsWith('/generated/items/'),
  sha256: z.string().length(64),
})

export type RawPaldbRecord = z.infer<typeof rawRecordSchema>
export type RawElementAsset = z.infer<typeof rawElementAssetSchema>
export type RawItemAsset = z.infer<typeof rawItemAssetSchema>

export const ELEMENT_LABEL_TO_ID = {
  无属性: 'neutral',
  火属性: 'fire',
  水属性: 'water',
  雷属性: 'electric',
  草属性: 'grass',
  暗属性: 'dark',
  龙属性: 'dragon',
  地属性: 'ground',
  冰属性: 'ice',
  未知属性: 'unknown',
} as const satisfies Record<string, ElementId>

export const SOURCE_ELEMENT_LABELS = Object.keys(ELEMENT_LABEL_TO_ID).filter(
  (label) => ELEMENT_LABEL_TO_ID[label as keyof typeof ELEMENT_LABEL_TO_ID] !== 'unknown',
)
