// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it } from 'vitest'
import { IndexedDbBreedingGraphRepository } from '../storage/breeding-graph-repository'
import { useBreedingGraphWorkspace } from './useBreedingGraphWorkspace'

describe('useBreedingGraphWorkspace', () => {
  let repository: IndexedDbBreedingGraphRepository | undefined

  afterEach(async () => {
    await repository?.close()
    repository = undefined
  })

  it('initializes and manages plans without creating or consuming presets', async () => {
    repository = new IndexedDbBreedingGraphRepository(new IDBFactory())
    const { result } = renderHook(() =>
      useBreedingGraphWorkspace({
        storage: { status: 'ready', error: '', repository: repository! },
      }),
    )

    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(result.current.state.plans).toHaveLength(1)
    expect(result.current.state.plans[0].name).toBe('方案 1')
    expect(await repository.listPresets()).toEqual([])
    expect(await repository.listLinks()).toEqual([])

    act(() => result.current.actions.createPlan())
    await waitFor(() => expect(result.current.state.plans).toHaveLength(2))

    const currentPlan = result.current.state.plans.find(
      (plan) => plan.id === result.current.state.currentPlanId,
    )!
    const editedPlan = {
      ...currentPlan,
      layers: [{ nodeIds: ['node-alpha'] }],
      nodes: [
        {
          id: 'node-alpha',
          palId: 'Alpha',
          source: 'manual' as const,
        },
      ],
      updatedAt: new Date().toISOString(),
    }
    expect(await result.current.actions.savePlan(editedPlan)).toBe(true)
    expect((await repository.getPlan(currentPlan.id))?.nodes).toEqual(
      editedPlan.nodes,
    )

    const importedPlan = {
      ...editedPlan,
      id: 'imported-plan',
      name: '导入方案',
      nodes: editedPlan.nodes.map((node) => ({
        ...node,
        source: 'import' as const,
      })),
    }
    expect(await result.current.actions.importPlan(importedPlan)).toBe(true)
    await waitFor(() =>
      expect(result.current.state.currentPlanId).toBe('imported-plan'),
    )
    expect(await repository.getPlan('imported-plan')).toEqual(importedPlan)
    expect(await repository.listLinks()).toEqual([])
  })
})
