// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { serializeBreedingPlan } from '../../domain/breeding-plan-portability'
import type { BreedingIndexPayload, PalRecord } from '../../domain/types'
import type {
  BreedingGraphWorkspaceActions,
  BreedingGraphWorkspaceState,
} from '../../hooks/useBreedingGraphWorkspace'
import type { useBreedingPlanEditor } from '../../hooks/useBreedingPlanEditor'
import { BreedingGraphWorkspace } from './BreedingGraphWorkspace'

vi.mock('./BreedingGraphCanvas', () => ({
  PAL_DRAG_MIME: 'application/x-paltools-pal-id',
  BreedingGraphCanvas: () => <section aria-label="配种图画布"><h2>空画布</h2></section>,
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

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

const timestamp = '2026-08-01T00:00:00.000Z'
const breedingIndex: BreedingIndexPayload = {
  schemaVersion: 4,
  palIds: ['Alpha', 'Beta'],
  recipes: [],
  recipesByPair: {},
  parentsByChild: {},
}

function makeState(overrides: Partial<BreedingGraphWorkspaceState> = {}): BreedingGraphWorkspaceState {
  return {
    status: 'ready',
    error: '',
    presets: [
      { id: 'preset-1', schemaVersion: 1, name: '背包甲', palIds: ['Alpha'], createdAt: timestamp, updatedAt: timestamp },
      { id: 'preset-2', schemaVersion: 1, name: '背包乙', palIds: [], createdAt: timestamp, updatedAt: timestamp },
    ],
    plans: [
      { id: 'plan-1', schemaVersion: 1, name: '方案 1', nodes: [], relations: [], viewport: { x: 0, y: 0, zoom: 1 }, createdAt: timestamp, updatedAt: timestamp },
    ],
    links: [],
    currentPresetId: 'preset-1',
    currentPlanId: 'plan-1',
    presetDraftPalIds: ['Alpha'],
    presetDirty: true,
    presetSaveState: 'saved',
    presetSaveError: '',
    planSaveState: 'saved',
    planSaveError: '',
    ...overrides,
  }
}

function makeActions(): BreedingGraphWorkspaceActions {
  return {
    selectPreset: vi.fn(),
    createPreset: vi.fn(),
    renamePreset: vi.fn(),
    deletePreset: vi.fn(),
    setPresetDraftPalIds: vi.fn(),
    togglePresetPal: vi.fn(),
    addPresetPalIds: vi.fn(),
    clearPresetDraft: vi.fn(),
    discardPresetChanges: vi.fn(),
    savePreset: vi.fn(() => Promise.resolve(true)),
    selectPlan: vi.fn(),
    createPlan: vi.fn(),
    renamePlan: vi.fn(),
    deletePlan: vi.fn(),
    importPlan: vi.fn(() => Promise.resolve(true)),
    savePlan: vi.fn(() => Promise.resolve(true)),
    linkPresetToPlan: vi.fn(() => Promise.resolve(true)),
    unlinkPresetFromPlan: vi.fn(() => Promise.resolve(true)),
  }
}

function makeEditor(): ReturnType<typeof useBreedingPlanEditor> {
  return {
    state: {
      plan: makeState().plans[0],
      selectedNodeIds: [],
      recipeChoices: [],
      dirty: false,
      saveState: 'saved',
      error: '',
      statusMessage: '',
      canUndo: false,
      canRedo: false,
    },
    actions: {
      addPresetNode: vi.fn(),
      setSelectedNodeIds: vi.fn(),
      updatePositions: vi.fn(),
      setViewport: vi.fn(),
      createChild: vi.fn(),
      chooseChild: vi.fn(),
      appendRecipe: vi.fn(() => true),
      cancelChildChoice: vi.fn(),
      mergeSelected: vi.fn(),
      deleteSelected: vi.fn(),
      deleteRelation: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      autoLayout: vi.fn(),
      flush: vi.fn(() => Promise.resolve(true)),
      clearError: vi.fn(),
    },
  }
}

describe('BreedingGraphWorkspace', () => {
  it('renders the resource managers, preset options and empty canvas', () => {
    render(
      <BreedingGraphWorkspace pals={pals} state={makeState()} actions={makeActions()} editor={makeEditor()} breedingIndex={breedingIndex} datasetVersion="dataset-2" />,
    )

    expect(screen.getByRole('heading', { name: '已有帕鲁预设' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '当前预设队列' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '空画布' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /起点甲/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('checkbox', { name: /亲本乙/ })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(screen.getByText('有未保存更改')).toBeInTheDocument()
  })

  it('bulk-selects the filtered result and saves the draft', () => {
    const actions = makeActions()
    render(
      <BreedingGraphWorkspace pals={pals} state={makeState()} actions={actions} editor={makeEditor()} breedingIndex={breedingIndex} datasetVersion="dataset-2" />,
    )

    fireEvent.click(screen.getByRole('button', { name: '全选结果' }))
    expect(actions.addPresetPalIds).toHaveBeenCalledWith(['Alpha', 'Beta'])
    fireEvent.click(screen.getByRole('button', { name: '保存预设' }))
    expect(actions.savePreset).toHaveBeenCalled()
  })

  it('opens the rename dialog and submits a preset name', () => {
    const actions = makeActions()
    render(
      <BreedingGraphWorkspace pals={pals} state={makeState()} actions={actions} editor={makeEditor()} breedingIndex={breedingIndex} datasetVersion="dataset-2" />,
    )

    const renameButtons = screen.getAllByRole('button', { name: '重命名' })
    fireEvent.click(renameButtons[0])
    const dialog = screen.getByRole('dialog', { name: '重命名预设' })
    const input = screen.getByLabelText('名称')
    fireEvent.change(input, { target: { value: '主背包' } })
    fireEvent.click(screen.getByRole('button', { name: '确定' }))
    expect(actions.renamePreset).toHaveBeenCalledWith('主背包')
    expect(dialog).not.toBeInTheDocument()
  })

  it('shows the unsaved-preset guard before switching presets', () => {
    const actions = makeActions()
    render(
      <BreedingGraphWorkspace pals={pals} state={makeState()} actions={actions} editor={makeEditor()} breedingIndex={breedingIndex} datasetVersion="dataset-2" />,
    )

    fireEvent.change(screen.getByLabelText('当前预设'), {
      target: { value: 'preset-2' },
    })
    expect(
      screen.getByRole('dialog', { name: '预设有未保存更改' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '放弃更改' }))
    expect(actions.discardPresetChanges).toHaveBeenCalled()
    expect(actions.selectPreset).toHaveBeenCalledWith('preset-2')
  })

  it('guards plan switching and exposes preset-plan link controls', async () => {
    const actions = makeActions()
    render(
      <BreedingGraphWorkspace
        pals={pals}
        state={makeState({
          plans: [
            ...makeState().plans,
            { ...makeState().plans[0], id: 'plan-2', name: '方案 2' },
          ],
          links: [
            {
              planId: 'plan-1',
              presetId: 'preset-2',
              lastUsedAt: timestamp,
            },
          ],
        })}
        actions={actions}
        editor={makeEditor()}
        breedingIndex={breedingIndex}
        datasetVersion="dataset-2"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '解除关联 背包乙' }))
    await waitFor(() =>
      expect(actions.unlinkPresetFromPlan).toHaveBeenCalledWith(
        'preset-2',
        'plan-1',
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: '关联当前预设' }))
    await waitFor(() =>
      expect(actions.linkPresetToPlan).toHaveBeenCalledWith(
        'preset-1',
        'plan-1',
      ),
    )

    fireEvent.change(screen.getByLabelText('当前方案'), {
      target: { value: 'plan-2' },
    })
    expect(
      screen.getByRole('dialog', { name: '预设有未保存更改' }),
    ).toBeInTheDocument()
    expect(actions.selectPlan).not.toHaveBeenCalled()
  })

  it('keeps the current plan selected when saving the preset fails', async () => {
    const actions = makeActions()
    actions.savePreset = vi.fn().mockResolvedValue(false)
    render(
      <BreedingGraphWorkspace
        pals={pals}
        state={makeState({
          plans: [
            ...makeState().plans,
            { ...makeState().plans[0], id: 'plan-2', name: '方案 2' },
          ],
        })}
        actions={actions}
        editor={makeEditor()}
        breedingIndex={breedingIndex}
        datasetVersion="dataset-2"
      />,
    )

    fireEvent.change(screen.getByLabelText('当前方案'), {
      target: { value: 'plan-2' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存并继续' }))

    await waitFor(() => expect(actions.savePreset).toHaveBeenCalled())
    expect(actions.selectPlan).not.toHaveBeenCalled()
    expect(
      screen.getByRole('dialog', { name: '预设有未保存更改' }),
    ).toBeInTheDocument()
  })

  it('warns before importing a different dataset and keeps the plan independent', async () => {
    const actions = makeActions()
    const sourcePlan = makeState({ presetDirty: false }).plans[0]
    const text = serializeBreedingPlan(sourcePlan, 'dataset-1', new Date(timestamp))
    render(
      <BreedingGraphWorkspace
        pals={pals}
        state={makeState({ presetDirty: false })}
        actions={actions}
        editor={makeEditor()}
        breedingIndex={breedingIndex}
        datasetVersion="dataset-2"
      />,
    )

    fireEvent.change(screen.getByLabelText('导入配种图方案文件'), {
      target: {
        files: [{ size: text.length, text: () => Promise.resolve(text) }],
      },
    })
    expect(await screen.findByRole('dialog', { name: '数据集版本不同' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '继续导入' }))
    await waitFor(() => expect(actions.importPlan).toHaveBeenCalledTimes(1))
    const imported = vi.mocked(actions.importPlan).mock.calls[0][0]
    expect(imported.id).not.toBe(sourcePlan.id)
    expect(imported.name).toBe('方案 1（2）')
  })

  it('exports the current plan as a local JSON download', async () => {
    const createObjectUrl = vi.fn(() => 'blob:plan')
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    render(
      <BreedingGraphWorkspace
        pals={pals}
        state={makeState({ presetDirty: false })}
        actions={makeActions()}
        editor={makeEditor()}
        breedingIndex={breedingIndex}
        datasetVersion="dataset-2"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '导出' }))
    await waitFor(() => expect(createObjectUrl).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('status')).toHaveTextContent('已导出方案')
  })
})
