import { describe, expect, it } from 'vitest'
import {
  filterAndSortRecipesForParent,
  filterPals,
  otherParentIdForRecipe,
  pairKey,
  recipesForChild,
  recipesForParent,
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
  workTypes: [],
  sortKey: 'paldexNo' as const,
  sortDirection: 'asc' as const,
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
  it('searches names, ids, partial pinyin, initials and paldex numbers', () => {
    expect(filterPals([pal], { ...baseFilters, query: 'lamb' })).toEqual([pal])
    expect(filterPals([pal], { ...baseFilters, query: 'ianyou' })).toEqual([pal])
    expect(filterPals([pal], { ...baseFilters, query: 'MYY' })).toEqual([pal])
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

  it('restricts pure numeric queries to paldex number prefixes', () => {
    const pal25 = { ...pal, internalId: 'Pal25', paldexNo: '025' }
    const unrelated = {
      ...pal,
      internalId: 'Unrelated',
      paldexNo: '125',
      partnerSkill: {
        name: '数字说明',
        description: '发动后提升 25% 攻击力。',
      },
    }

    expect(
      filterPals([pal25, unrelated], { ...baseFilters, query: '25' }),
    ).toEqual([pal25])
  })

  it('requires every selected work suitability and sorts by a stat', () => {
    const fastPal = {
      ...pal,
      internalId: 'Fast',
      paldexNo: '002',
      workSuitabilities: { 手工作业: 2, 搬运: 1 },
      stats: { ...pal.stats, runSpeed: 500 },
    }
    expect(
      filterPals([pal, fastPal], {
        ...baseFilters,
        query: '',
        workTypes: ['手工作业', '搬运'],
        sortKey: 'runSpeed',
        sortDirection: 'desc',
      }),
    ).toEqual([fastPal])
  })

  it('sorts ascending and always keeps missing values last', () => {
    const fastPal: PalRecord = {
      ...pal,
      internalId: 'Fast',
      paldexNo: '002',
      stats: { ...pal.stats, runSpeed: 500 },
    }
    const unknownPal: PalRecord = {
      ...pal,
      internalId: 'Unknown',
      paldexNo: '003',
      stats: { ...pal.stats, runSpeed: null },
    }
    expect(
      filterPals([unknownPal, fastPal, pal], {
        ...baseFilters,
        query: '',
        sortKey: 'runSpeed',
        sortDirection: 'asc',
      }),
    ).toEqual([pal, fastPal, unknownPal])
  })

  it('sorts paldex numbers in either direction and keeps unnumbered pals last', () => {
    const palTwo: PalRecord = {
      ...pal,
      internalId: 'PalTwo',
      paldexNo: '002',
    }
    const palTen: PalRecord = {
      ...pal,
      internalId: 'PalTen',
      paldexNo: '010',
    }
    const unnumberedPal: PalRecord = {
      ...pal,
      internalId: 'Unnumbered',
      paldexNo: null,
    }

    expect(
      filterPals([unnumberedPal, palTen, palTwo, pal], {
        ...baseFilters,
        query: '',
        sortDirection: 'asc',
      }),
    ).toEqual([pal, palTwo, palTen, unnumberedPal])
    expect(
      filterPals([unnumberedPal, pal, palTwo, palTen], {
        ...baseFilters,
        query: '',
        sortDirection: 'desc',
      }),
    ).toEqual([palTen, palTwo, pal, unnumberedPal])
  })

  it('uses internal ids as a stable paldex-number fallback', () => {
    const earlierId: PalRecord = {
      ...pal,
      internalId: 'Alpha',
    }
    const laterId: PalRecord = {
      ...pal,
      internalId: 'Zulu',
    }
    const unnumberedEarlier: PalRecord = {
      ...pal,
      internalId: 'MissingAlpha',
      paldexNo: null,
    }
    const unnumberedLater: PalRecord = {
      ...pal,
      internalId: 'MissingZulu',
      paldexNo: null,
    }

    expect(
      filterPals(
        [laterId, unnumberedLater, earlierId, unnumberedEarlier],
        {
          ...baseFilters,
          query: '',
          sortDirection: 'desc',
        },
      ),
    ).toEqual([earlierId, laterId, unnumberedEarlier, unnumberedLater])
  })
})

describe('gender-neutral breeding helpers', () => {
  const index: BreedingIndexPayload = {
    schemaVersion: 4,
    palIds: [
      'CatMage',
      'FoxMage',
      'CatMage_Fire',
      'FoxMage_Dark',
      'SheepBall',
    ],
    recipes: [
      [0, 1, 2],
      [0, 1, 3],
      [0, 0, 4],
    ],
    recipesByPair: { '0|1': [0, 1], '0|0': [2] },
    parentsByChild: { '2': [0], '3': [1], '4': [2] },
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

  it('lists every recipe for either parent position without duplicating same-parent recipes', () => {
    expect(
      recipesForParent(index, 'CatMage').map((recipe) => recipe.childId),
    ).toEqual(['CatMage_Fire', 'FoxMage_Dark', 'SheepBall'])
    expect(
      recipesForParent(index, 'FoxMage').map((recipe) => recipe.childId),
    ).toEqual(['CatMage_Fire', 'FoxMage_Dark'])
    expect(recipesForParent(index, 'Unknown')).toEqual([])
  })

  it('resolves the other parent and filters or sorts single-parent results', () => {
    const palsById = new Map<string, PalRecord>([
      [
        'CatMage',
        {
          ...pal,
          internalId: 'CatMage',
          paldbId: 'Katress',
          paldexNo: '075',
          name: { zhHans: '暗巫猫', en: 'Katress' },
        },
      ],
      [
        'FoxMage',
        {
          ...pal,
          internalId: 'FoxMage',
          paldbId: 'Wixen',
          paldexNo: '076',
          name: { zhHans: '焰巫狐', en: 'Wixen' },
        },
      ],
      [
        'CatMage_Fire',
        {
          ...pal,
          internalId: 'CatMage_Fire',
          paldbId: 'Katress-Ignis',
          paldexNo: '075B',
          name: { zhHans: '暗巫猫炎魔', en: 'Katress Ignis' },
        },
      ],
      [
        'FoxMage_Dark',
        {
          ...pal,
          internalId: 'FoxMage_Dark',
          paldbId: 'Wixen-Noct',
          paldexNo: '076B',
          name: { zhHans: '焰巫狐夜魔', en: 'Wixen Noct' },
        },
      ],
      ['SheepBall', pal],
    ])
    const recipes = recipesForParent(index, 'CatMage')

    expect(otherParentIdForRecipe(recipes[0], 'CatMage')).toBe('FoxMage')
    expect(otherParentIdForRecipe(recipes[2], 'CatMage')).toBe('CatMage')
    expect(
      filterAndSortRecipesForParent(
        recipes,
        'CatMage',
        palsById,
        'wuhuye',
      ).map((recipe) => recipe.childId),
    ).toEqual(['FoxMage_Dark'])
    expect(
      filterAndSortRecipesForParent(recipes, 'CatMage', palsById, '').map(
        (recipe) => recipe.childId,
      ),
    ).toEqual(['SheepBall', 'CatMage_Fire', 'FoxMage_Dark'])
  })
})
