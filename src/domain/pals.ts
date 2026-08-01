import type {
  ActiveSkillRecord,
  BreedingIndexPayload,
  BreedingRecipe,
  BreedingRecipeMatch,
  ElementId,
  ItemRecord,
  PalRecord,
  PalStatKey,
} from './types'
import {
  matchesPalIdentityQuery,
  matchesPaldexNumber,
  normalizeSearchTerm,
  palIdentitySearchText,
} from './search'

export type PalSortKey = 'paldexNo' | PalStatKey

export function pairKey(parentAId: string, parentBId: string): string {
  return [parentAId, parentBId].sort((a, b) => a.localeCompare(b)).join('|')
}

export interface PalFilters {
  query: string
  element: ElementId | ''
  workTypes: string[]
  sortKey: PalSortKey
  sortDirection: 'asc' | 'desc'
}

export interface PalSearchCatalogs {
  skills?: ReadonlyMap<string, ActiveSkillRecord>
  items?: ReadonlyMap<string, ItemRecord>
}

export function filterPals(
  pals: PalRecord[],
  filters: PalFilters,
  catalogs: PalSearchCatalogs = {},
): PalRecord[] {
  const query = normalizeSearchTerm(filters.query)

  const filtered = pals.filter((pal) => {
    const activeSkillText = (pal.activeSkills ?? [])
      .map((ref) => {
        const skill = catalogs.skills?.get(ref.skillId)
        return skill
          ? `${ref.nameOverride ?? skill.name} ${skill.description} ${skill.effects.join(' ')}`
          : ref.skillId
      })
      .join(' ')
    const passiveSkillText = (pal.passiveSkills ?? [])
      .map((skill) => `${skill.name} ${skill.description}`)
      .join(' ')
    const dropText = (pal.drops ?? [])
      .map((drop) => catalogs.items?.get(drop.itemId)?.name ?? drop.itemId)
      .join(' ')
    const searchable = [
      palIdentitySearchText(pal),
      pal.partnerSkill?.name ?? '',
      pal.partnerSkill?.description ?? '',
      activeSkillText,
      passiveSkillText,
      dropText,
    ]
      .map(normalizeSearchTerm)
      .join(' ')

    const matchesQuery =
      !query ||
      (/^\d+$/.test(query)
        ? matchesPaldexNumber(pal.paldexNo, query)
        : searchable.includes(query))
    const matchesElement =
      !filters.element || pal.elements.includes(filters.element)
    const matchesWork =
      filters.workTypes.length === 0 ||
      filters.workTypes.every(
        (workType) => pal.workSuitabilities[workType] !== undefined,
      )

    return matchesQuery && matchesElement && matchesWork
  })

  const key = filters.sortKey
  const direction = filters.sortDirection === 'asc' ? 1 : -1
  if (key === 'paldexNo') {
    return [...filtered].sort((left, right) => {
      if (left.paldexNo === null && right.paldexNo === null) {
        return left.internalId.localeCompare(right.internalId)
      }
      if (left.paldexNo === null) return 1
      if (right.paldexNo === null) return -1
      return (
        left.paldexNo.localeCompare(right.paldexNo, undefined, {
          numeric: true,
        }) * direction ||
        left.internalId.localeCompare(right.internalId)
      )
    })
  }

  return [...filtered].sort((left, right) => {
    const leftValue = left.stats[key]
    const rightValue = right.stats[key]
    if (leftValue === null && rightValue === null) {
      return comparePalIdentity(left, right)
    }
    if (leftValue === null) return 1
    if (rightValue === null) return -1
    return (
      (leftValue - rightValue) * direction ||
      comparePalIdentity(left, right)
    )
  })
}

function comparePalIdentity(left: PalRecord, right: PalRecord): number {
  return (
    (left.paldexNo ?? '9999').localeCompare(
      right.paldexNo ?? '9999',
      undefined,
      { numeric: true },
    ) || left.internalId.localeCompare(right.internalId)
  )
}

export function compactPairKey(parentAIndex: number, parentBIndex: number): string {
  return [parentAIndex, parentBIndex].sort((a, b) => a - b).join('|')
}

export function decodeRecipe(
  index: BreedingIndexPayload,
  recipeIndex: number,
): BreedingRecipe | null {
  const recipe = index.recipes[recipeIndex]
  if (!recipe) return null
  const [parentA, parentB, child] = recipe
  const parentAId = index.palIds[parentA]
  const parentBId = index.palIds[parentB]
  const childId = index.palIds[child]
  return parentAId && parentBId && childId
    ? { parentAId, parentBId, childId }
    : null
}

export function decodeRecipeMatch(
  index: BreedingIndexPayload,
  recipeIndex: number,
): BreedingRecipeMatch | null {
  const recipe = decodeRecipe(index, recipeIndex)
  return recipe ? { recipeIndex, ...recipe } : null
}

export function recipeMatchesForParents(
  index: BreedingIndexPayload,
  parentAId: string,
  parentBId: string,
): BreedingRecipeMatch[] {
  const parentA = index.palIds.indexOf(parentAId)
  const parentB = index.palIds.indexOf(parentBId)
  if (parentA < 0 || parentB < 0) return []
  return (index.recipesByPair[compactPairKey(parentA, parentB)] ?? [])
    .map((recipeIndex) => decodeRecipeMatch(index, recipeIndex))
    .filter((recipe): recipe is BreedingRecipeMatch => recipe !== null)
}

export function recipesForParents(
  index: BreedingIndexPayload,
  parentAId: string,
  parentBId: string,
): BreedingRecipe[] {
  return recipeMatchesForParents(index, parentAId, parentBId).map(
    ({ recipeIndex: _recipeIndex, ...recipe }) => recipe,
  )
}

export function recipesForParent(
  index: BreedingIndexPayload,
  parentId: string,
): BreedingRecipe[] {
  const parent = index.palIds.indexOf(parentId)
  if (parent < 0) return []

  return index.recipes
    .map((recipe, recipeIndex) =>
      recipe[0] === parent || recipe[1] === parent
        ? decodeRecipe(index, recipeIndex)
        : null,
    )
    .filter((recipe): recipe is BreedingRecipe => recipe !== null)
}

export function otherParentIdForRecipe(
  recipe: BreedingRecipe,
  selectedParentId: string,
): string | null {
  if (recipe.parentAId === selectedParentId) {
    return recipe.parentBId
  }
  if (recipe.parentBId === selectedParentId) {
    return recipe.parentAId
  }
  return null
}

export function filterAndSortRecipesForParent(
  recipes: BreedingRecipe[],
  selectedParentId: string,
  palsById: ReadonlyMap<string, PalRecord>,
  query: string,
): BreedingRecipe[] {
  const normalizedQuery = normalizeSearchTerm(query)
  const paldexNumber = (pal: PalRecord | undefined) => pal?.paldexNo ?? '9999'

  return recipes
    .filter((recipe) => {
      const otherParentId = otherParentIdForRecipe(recipe, selectedParentId)
      if (!otherParentId) return false
      if (!normalizedQuery) return true

      const otherParent = palsById.get(otherParentId)
      const child = palsById.get(recipe.childId)
      return (
        (otherParent &&
          matchesPalIdentityQuery(otherParent, normalizedQuery)) ||
        (child && matchesPalIdentityQuery(child, normalizedQuery))
      )
    })
    .sort((left, right) => {
      const leftOtherId =
        otherParentIdForRecipe(left, selectedParentId) ?? left.parentBId
      const rightOtherId =
        otherParentIdForRecipe(right, selectedParentId) ?? right.parentBId
      return (
        paldexNumber(palsById.get(leftOtherId)).localeCompare(
          paldexNumber(palsById.get(rightOtherId)),
          undefined,
          { numeric: true },
        ) ||
        paldexNumber(palsById.get(left.childId)).localeCompare(
          paldexNumber(palsById.get(right.childId)),
          undefined,
          { numeric: true },
        ) ||
        leftOtherId.localeCompare(rightOtherId) ||
        left.childId.localeCompare(right.childId) ||
        left.parentAId.localeCompare(right.parentAId) ||
        left.parentBId.localeCompare(right.parentBId)
      )
    })
}

export function recipesForChild(
  index: BreedingIndexPayload,
  childId: string,
): BreedingRecipe[] {
  const child = index.palIds.indexOf(childId)
  if (child < 0) return []
  return (index.parentsByChild[String(child)] ?? [])
    .map((recipeIndex) => decodeRecipe(index, recipeIndex))
    .filter((recipe): recipe is BreedingRecipe => recipe !== null)
}
