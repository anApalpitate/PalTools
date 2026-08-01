import { useCallback, useMemo, useState } from 'react'

export interface MarkedBreedingRecipesState {
  recipeIndices: number[]
  recipeIndexSet: ReadonlySet<number>
}

export interface MarkedBreedingRecipesActions {
  toggle(recipeIndex: number): void
}

export function useMarkedBreedingRecipes(): {
  state: MarkedBreedingRecipesState
  actions: MarkedBreedingRecipesActions
} {
  const [recipeIndices, setRecipeIndices] = useState<number[]>([])
  const recipeIndexSet = useMemo(() => new Set(recipeIndices), [recipeIndices])
  const toggle = useCallback((recipeIndex: number) => {
    if (!Number.isInteger(recipeIndex) || recipeIndex < 0) return
    setRecipeIndices((current) =>
      current.includes(recipeIndex)
        ? current.filter((candidate) => candidate !== recipeIndex)
        : [...current, recipeIndex],
    )
  }, [])

  return {
    state: { recipeIndices, recipeIndexSet },
    actions: { toggle },
  }
}
