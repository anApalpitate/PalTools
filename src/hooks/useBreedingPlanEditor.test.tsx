// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BreedingPlanV1 } from '../domain/breeding-graph'
import type { BreedingIndexPayload, PalRecord } from '../domain/types'
import { useBreedingPlanEditor } from './useBreedingPlanEditor'

const timestamp = '2026-08-01T00:00:00.000Z'

function pal(id: string, number: string): PalRecord {
  return {
    internalId: id,
    paldbId: id,
    paldexNo: number,
    name: { zhHans: id, en: id },
    elements: ['neutral'],
    rarity: 1,
    workSuitabilities: {},
    partnerSkill: null,
    stats: {
      hp: 1,
      attack: 1,
      defense: 1,
      workSpeed: 1,
      walkSpeed: 1,
      runSpeed: 1,
      swimSpeed: 1,
      rideSprintSpeed: 1,
      transportSpeed: 1,
      stamina: 1,
      foodAmount: 1,
    },
    statSources: {},
    activeSkills: [],
    passiveSkills: [],
    drops: [],
    image: { localPath: '', sourceUrl: '', sha256: 'a'.repeat(64) },
    sourceUrl: '',
  }
}

const pals = [pal('A', '001'), pal('B', '002'), pal('C', '003'), pal('D', '004')]
const index: BreedingIndexPayload = {
  schemaVersion: 4,
  palIds: pals.map((entry) => entry.internalId),
  recipes: [
    [0, 1, 2],
    [0, 1, 3],
  ],
  recipesByPair: { '0|1': [0] },
  parentsByChild: { '2': [0], '3': [1] },
}

function plan(nodes: BreedingPlanV1['nodes'] = []): BreedingPlanV1 {
  return {
    id: 'plan-1',
    schemaVersion: 1,
    name: '方案 1',
    nodes,
    relations: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

describe('useBreedingPlanEditor', () => {
  it('adds duplicate manual nodes and auto-saves after 500ms', async () => {
    const savePlan = vi.fn().mockResolvedValue(true)
    const { result } = renderHook(() =>
      useBreedingPlanEditor({
        plan: plan(),
        pals,
        breedingIndex: index,
        savePlan,
      }),
    )

    act(() => {
      result.current.actions.addManualNode('A')
      result.current.actions.addManualNode('A')
    })
    expect(result.current.state.plan?.nodes).toHaveLength(2)
    expect(result.current.state.plan?.nodes.every((node) => node.palId === 'A')).toBe(true)
    const revealNodeId = result.current.state.revealNodeId
    expect(revealNodeId).toBe(result.current.state.plan?.nodes.at(-1)?.id)
    act(() => result.current.actions.acknowledgeRevealNode(revealNodeId!))
    expect(result.current.state.revealNodeId).toBeNull()

    await waitFor(() => expect(savePlan).toHaveBeenCalled(), { timeout: 1500 })
    expect(savePlan).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'plan-1' }),
    )
    expect(result.current.state.plan?.nodes.every((node) => node.source === 'manual')).toBe(true)
    await waitFor(() => expect(result.current.state.saveState).toBe('saved'))
  })

  it('creates a unique child and exposes multiple or missing recipe states', () => {
    const basePlan = plan([
      { id: 'a', palId: 'A', source: 'preset', position: { x: 0, y: 0 } },
      { id: 'b', palId: 'B', source: 'preset', position: { x: 200, y: 0 } },
    ])
    const savePlan = vi.fn().mockResolvedValue(true)
    const { result, rerender } = renderHook(
      ({ breedingIndex }) =>
        useBreedingPlanEditor({
          plan: basePlan,
          pals,
          breedingIndex,
          savePlan,
        }),
      { initialProps: { breedingIndex: index } },
    )

    act(() => result.current.actions.setSelectedNodeIds(['a', 'b']))
    act(() => result.current.actions.createChild())
    expect(result.current.state.plan?.relations).toHaveLength(1)
    expect(result.current.state.plan?.nodes.at(-1)?.palId).toBe('C')

    const multiIndex = { ...index, recipesByPair: { '0|1': [0, 1] } }
    rerender({ breedingIndex: multiIndex })
    act(() => result.current.actions.setSelectedNodeIds(['a', 'b']))
    act(() => result.current.actions.createChild())
    expect(result.current.state.recipeChoices).toHaveLength(2)

    const noMatchIndex = { ...index, recipesByPair: {} }
    rerender({ breedingIndex: noMatchIndex })
    act(() => result.current.actions.setSelectedNodeIds(['a', 'b']))
    act(() => result.current.actions.createChild())
    expect(result.current.state.error).toBe('当前组合没有正式配方。')
  })

  it('keeps a dirty draft and exposes an error when persistence fails', async () => {
    const savePlan = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const { result } = renderHook(() =>
      useBreedingPlanEditor({
        plan: plan(),
        pals,
        breedingIndex: index,
        savePlan,
      }),
    )

    act(() => result.current.actions.addManualNode('A'))
    await act(async () => {
      expect(await result.current.actions.flush()).toBe(false)
    })
    expect(result.current.state.dirty).toBe(true)
    expect(result.current.state.saveState).toBe('error')
    expect(result.current.state.plan?.nodes).toHaveLength(1)

    await act(async () => {
      expect(await result.current.actions.flush()).toBe(true)
    })
    expect(savePlan).toHaveBeenCalledTimes(2)
    expect(result.current.state.dirty).toBe(false)
    expect(result.current.state.saveState).toBe('saved')
  })

  it('supports merge, delete, undo and redo history', () => {
    const savePlan = vi.fn().mockResolvedValue(true)
    const basePlan = plan([
      { id: 'a-keep', palId: 'A', source: 'preset', position: { x: 0, y: 0 } },
      { id: 'a-remove', palId: 'A', source: 'preset', position: { x: 100, y: 0 } },
    ])
    const { result } = renderHook(() =>
      useBreedingPlanEditor({
        plan: basePlan,
        pals,
        breedingIndex: index,
        savePlan,
      }),
    )

    act(() => result.current.actions.setSelectedNodeIds(['a-keep', 'a-remove']))
    act(() => result.current.actions.mergeSelected())
    expect(result.current.state.plan?.nodes).toHaveLength(1)
    expect(result.current.state.canUndo).toBe(true)

    act(() => result.current.actions.undo())
    expect(result.current.state.plan?.nodes).toHaveLength(2)
    expect(result.current.state.canRedo).toBe(true)
    act(() => result.current.actions.redo())
    expect(result.current.state.plan?.nodes).toHaveLength(1)

    act(() => result.current.actions.setSelectedNodeIds(['a-keep']))
    act(() => result.current.actions.deleteSelected())
    expect(result.current.state.plan?.nodes.some((node) => node.id === 'a-keep')).toBe(false)
  })

  it('coalesces viewport-only changes without marking content dirty', async () => {
    vi.useFakeTimers()
    try {
      const savePlan = vi.fn().mockResolvedValue(true)
      const { result } = renderHook(() =>
        useBreedingPlanEditor({
          plan: plan(),
          pals,
          breedingIndex: index,
          savePlan,
        }),
      )

      act(() => {
        result.current.actions.setViewport({ x: 10, y: 20, zoom: 1 })
        result.current.actions.setViewport({ x: 20, y: 30, zoom: 1.1 })
        result.current.actions.setViewport({ x: 30, y: 40, zoom: 1.2 })
      })
      expect(result.current.state.dirty).toBe(false)
      expect(result.current.state.viewportPending).toBe(true)
      expect(result.current.state.saveState).toBe('saved')
      expect(savePlan).not.toHaveBeenCalled()

      await act(async () => vi.advanceTimersByTimeAsync(1_000))
      expect(savePlan).toHaveBeenCalledTimes(1)
      expect(savePlan).toHaveBeenCalledWith(
        expect.objectContaining({ viewport: { x: 30, y: 40, zoom: 1.2 } }),
      )
      expect(result.current.state.viewportPending).toBe(false)
      expect(result.current.state.dirty).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('flushes a newer viewport revision created during a content save', async () => {
    const resolvers: Array<(saved: boolean) => void> = []
    const savePlan = vi.fn(
      (_candidate: BreedingPlanV1) =>
        new Promise<boolean>((resolve) => resolvers.push(resolve)),
    )
    const { result } = renderHook(() =>
      useBreedingPlanEditor({
        plan: plan(),
        pals,
        breedingIndex: index,
        savePlan,
      }),
    )

    act(() => result.current.actions.addManualNode('A'))
    let flushPromise: Promise<boolean>
    act(() => {
      flushPromise = result.current.actions.flush()
    })
    await waitFor(() => expect(savePlan).toHaveBeenCalledTimes(1))
    act(() => result.current.actions.setViewport({ x: 50, y: 60, zoom: 1.1 }))
    await act(async () => resolvers[0]!(true))
    await waitFor(() => expect(savePlan).toHaveBeenCalledTimes(2))
    expect(savePlan.mock.calls[1][0].viewport).toEqual({
      x: 50,
      y: 60,
      zoom: 1.1,
    })
    await act(async () => resolvers[1]!(true))
    await expect(flushPromise!).resolves.toBe(true)
    expect(result.current.state.dirty).toBe(false)
    expect(result.current.state.viewportPending).toBe(false)
  })
})
