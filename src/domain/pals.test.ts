import { describe, expect, it } from 'vitest'
import {
  filterPals,
  pairKey,
  recipesForChild,
  recipesForParents,
} from './pals'
import type {
  ActiveSkillRecord,
  BreedingIndexPayload,
  ItemRecord,
  PalRecord,
} from './types'

const pal: PalRecord = {
  internalId: 'SheepBall',
  paldbId: 'Lamball',
  paldexNo: '001',
  name: { zhHans: '棉悠悠', en: 'Lamball' },
  elements: ['neutral'],
  rarity: 1,
  workSuitabilities: { 手工作业: 1 },
  partnerSkill: {
    name: '茸茸盾牌',
    description: '发动后化身为盾牌，并可在牧场掉落羊毛。',
  },
  stats: {
    hp: 70,
    attack: 70,
    defense: 70,
    workSpeed: 100,
    walkSpeed: 40,
    runSpeed: 400,
    swimSpeed: 120,
    rideSprintSpeed: 550,
    transportSpeed: 160,
    stamina: 100,
    foodAmount: 3,
  },
  statSources: {
    hp: 'paldb',
    attack: 'paldb',
    defense: 'paldb',
    workSpeed: 'paldb',
    walkSpeed: 'paldb',
    runSpeed: 'paldb',
    swimSpeed: 'paldb',
    rideSprintSpeed: 'palcalc',
    transportSpeed: 'palcalc',
    stamina: 'paldb',
    foodAmount: 'paldb',
  },
  activeSkills: [{ skillId: 'Roly_Poly', unlockLevel: 1 }],
  passiveSkills: [{ name: '勇敢', description: '攻击提升', rank: 1 }],
  drops: [
    {
      itemId: 'Wool',
      quantityMin: 1,
      quantityMax: 3,
      probabilityPercent: 100,
      requiredLevel: null,
    },
  ],
  image: {
    localPath: '/generated/pals/SheepBall.webp',
    sourceUrl: 'https://paldb.cn/lamball.webp',
    sha256: 'x',
  },
  sourceUrl: 'https://paldb.cn/pals/Lamball',
}

const baseFilters = {
  element: '' as const,
  workType: '',
  minWorkLevel: 1,
  statKey: '' as const,
  statMin: null,
  statMax: null,
}

const skill: ActiveSkillRecord = {
  id: 'Roly_Poly',
  name: '滚滚毛球',
  element: 'neutral',
  attackType: 'melee',
  power: 40,
  cooldownSeconds: 2,
  attackRange: '0–1000',
  effects: [],
  description: '滚动追击敌人。',
  sourceUrl: 'https://paldb.cn/skills/Roly_Poly',
}

const item: ItemRecord = {
  id: 'Wool',
  name: '羊毛',
  icon: {
    localPath: '/generated/items/Wool.webp',
    sourceUrl: 'https://paldb.cn/Wool.webp',
    sha256: 'x',
  },
}

describe('filterPals', () => {
  it('searches names, ids and paldex numbers', () => {
    expect(filterPals([pal], { ...baseFilters, query: 'lamb' })).toEqual([pal])
    expect(filterPals([pal], { ...baseFilters, query: '1' })).toEqual([pal])
  })

  it('searches active, passive and drop details', () => {
    const catalogs = {
      skills: new Map([[skill.id, skill]]),
      items: new Map([[item.id, item]]),
    }
    expect(
      filterPals([pal], { ...baseFilters, query: '滚滚毛球' }, catalogs),
    ).toEqual([pal])
    expect(
      filterPals([pal], { ...baseFilters, query: '攻击提升' }, catalogs),
    ).toEqual([pal])
    expect(
      filterPals([pal], { ...baseFilters, query: '羊毛' }, catalogs),
    ).toEqual([pal])
  })

  it('combines inclusive stat and work filters', () => {
    expect(
      filterPals([pal], {
        ...baseFilters,
        query: '',
        workType: '手工作业',
        minWorkLevel: 1,
        statKey: 'runSpeed',
        statMin: 400,
        statMax: 400,
      }),
    ).toEqual([pal])
  })
})

describe('gender-neutral breeding helpers', () => {
  const index: BreedingIndexPayload = {
    schemaVersion: 3,
    palIds: ['CatMage', 'FoxMage', 'CatMage_Fire', 'FoxMage_Dark'],
    recipes: [
      [0, 1, 2],
      [0, 1, 3],
    ],
    recipesByPair: { '0|1': [0, 1] },
    parentsByChild: { '2': [0], '3': [1] },
  }

  it('uses an order-independent source pair key', () => {
    expect(pairKey('B', 'A')).toBe(pairKey('A', 'B'))
  })

  it('returns both special children without gender inputs', () => {
    expect(
      recipesForParents(index, 'FoxMage', 'CatMage').map(
        (recipe) => recipe.childId,
      ),
    ).toEqual(['CatMage_Fire', 'FoxMage_Dark'])
    expect(recipesForChild(index, 'FoxMage_Dark')).toEqual([
      {
        parentAId: 'CatMage',
        parentBId: 'FoxMage',
        childId: 'FoxMage_Dark',
      },
    ])
  })
})
