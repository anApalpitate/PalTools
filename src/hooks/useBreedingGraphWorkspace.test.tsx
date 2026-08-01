// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it } from 'vitest'
import type { PalRecord } from '../domain/types'
import { IndexedDbBreedingGraphRepository } from '../storage/breeding-graph-repository'
import { useBreedingGraphWorkspace } from './useBreedingGraphWorkspace'

function makePal(internalId: string, paldexNo: string, zhHans: string): PalRecord {
  return {
    internalId,
    paldbId: internalId,
    paldexNo,
    name: { zhHans, en: internalId },
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
    image: {
      localPath: `/generated/pals/${internalId}.webp`,
      sourceUrl: `https://example.invalid/${internalId}.webp`,
      sha256: 'a'.repeat(64),
    },
    sourceUrl: `https://example.invalid/${internalId}`,
  }
}

const pals = [
  makePal('Alpha', '001', '起点甲'),
  makePal('Beta', '002', '亲本乙'),
]

describe('useBreedingGraphWorkspace', () => {
  let repository: IndexedDbBreedingGraphRepository | undefined

  afterEach(async () => {
    await repository?.close()
    repository = undefined
  })

  it('initializes defaults, saves preset drafts and manages plans and links', async () => {
    repository = new IndexedDbBreedingGraphRepository(new IDBFactory())
    const { result } = renderHook(() =>
      useBreedingGraphWorkspace({
        pals,
        breedingIndex: null,
        storage: { status: 'ready', error: '', repository: repository! },
      }),
    )

    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(result.current.state.presets).toHaveLength(1)
    expect(result.current.state.presets[0].name).toBe('默认预设')
    expect(result.current.state.plans).toHaveLength(1)
    expect(result.current.state.plans[0].name).toBe('方案 1')

    result.current.actions.togglePresetPal('Alpha')
    await waitFor(() => expect(result.current.state.presetDirty).toBe(true))
    await result.current.actions.savePreset()
    await waitFor(() => expect(result.current.state.presetDirty).toBe(false))
    expect((await repository.getPreset(result.current.state.currentPresetId))?.palIds).toEqual([
      'Alpha',
    ])

    result.current.actions.createPlan()
    await waitFor(() => expect(result.current.state.plans).toHaveLength(2))
    const nextPlan = result.current.state.plans.find(
      (plan) => plan.id !== result.current.state.currentPlanId,
    )
    const initialPlanId = result.current.state.currentPlanId
    result.current.actions.linkPresetToPlan(
      result.current.state.currentPresetId,
      nextPlan!.id,
    )
    await waitFor(() => expect(result.current.state.links).toHaveLength(1))
    result.current.actions.unlinkPresetFromPlan(
      result.current.state.currentPresetId,
      nextPlan!.id,
    )
    await waitFor(() => expect(result.current.state.links).toHaveLength(0))
    expect(await repository.listLinks()).toEqual([])
    expect(initialPlanId).not.toBe(nextPlan!.id)

    const currentPlan = result.current.state.plans.find(
      (plan) => plan.id === result.current.state.currentPlanId,
    )!
    const editedPlan = {
      ...currentPlan,
      nodes: [
        {
          id: 'node-alpha',
          palId: 'Alpha',
          position: { x: 24, y: 48 },
          source: 'preset' as const,
        },
      ],
      updatedAt: new Date().toISOString(),
    }
    expect(await result.current.actions.savePlan(editedPlan, [])).toBe(true)
    expect((await repository.getPlan(currentPlan.id))?.nodes).toEqual(
      editedPlan.nodes,
    )
  })
})
