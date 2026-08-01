// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useMarkedBreedingRecipes } from './useMarkedBreedingRecipes'

describe('useMarkedBreedingRecipes', () => {
  it('toggles unique recipe indices and appends a re-marked recipe last', () => {
    const { result } = renderHook(() => useMarkedBreedingRecipes())

    act(() => {
      result.current.actions.toggle(3)
      result.current.actions.toggle(7)
      result.current.actions.toggle(3)
    })
    expect(result.current.state.recipeIndices).toEqual([7])
    expect(result.current.state.recipeIndexSet.has(3)).toBe(false)

    act(() => result.current.actions.toggle(3))
    expect(result.current.state.recipeIndices).toEqual([7, 3])
    expect(result.current.state.recipeIndexSet.has(3)).toBe(true)
  })

  it('ignores invalid indices and keeps distinct recipe results separate', () => {
    const { result } = renderHook(() => useMarkedBreedingRecipes())

    act(() => {
      result.current.actions.toggle(-1)
      result.current.actions.toggle(0.5)
      result.current.actions.toggle(0)
      result.current.actions.toggle(1)
    })
    expect(result.current.state.recipeIndices).toEqual([0, 1])
  })
})
