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
  BreedingGraphCanvas: () => (
    <section aria-label="配种图画布">
      <h2>空画布</h2>
    </section>
  ),
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
const plan = {
  id: 'plan-1',
  schemaVersion: 1 as const,
  name: '方案 1',
  nodes: [],
  relations: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  createdAt: timestamp,
  updatedAt: timestamp,
}

function makeState(
  overrides: Partial<BreedingGraphWorkspaceState> = {},
): BreedingGraphWorkspaceState {
  return {
    status: 'ready',
    error: '',
    plans: [plan],
    currentPlanId: 'plan-1',
    planSaveState: 'saved',
    planSaveError: '',
    ...overrides,
  }
}

function makeActions(): BreedingGraphWorkspaceActions {
  return {
    selectPlan: vi.fn(),
    createPlan: vi.fn(),
    renamePlan: vi.fn(),
    deletePlan: vi.fn(),
    importPlan: vi.fn(() => Promise.resolve(true)),
    savePlan: vi.fn(() => Promise.resolve(true)),
  }
}

function makeEditor(): ReturnType<typeof useBreedingPlanEditor> {
  return {
    state: {
      plan,
      selectedNodeIds: [],
      recipeChoices: [],
      dirty: false,
      viewportPending: false,
      saveState: 'saved',
      error: '',
      statusMessage: '',
      canUndo: false,
      canRedo: false,
      revealNodeId: null,
    },
    actions: {
      addManualNode: vi.fn(),
      setSelectedNodeIds: vi.fn(),
      setViewport: vi.fn(),
      createChild: vi.fn(),
      chooseChild: vi.fn(),
      cancelChildChoice: vi.fn(),
      mergeSelected: vi.fn(),
      deleteSelected: vi.fn(),
      deleteRelation: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      autoLayout: vi.fn(),
      flush: vi.fn(() => Promise.resolve(true)),
      clearError: vi.fn(),
      acknowledgeRevealNode: vi.fn(),
    },
  }
}

function renderWorkspace(
  state = makeState(),
  actions = makeActions(),
  editor = makeEditor(),
) {
  render(
    <BreedingGraphWorkspace
      pals={pals}
      state={state}
      actions={actions}
      editor={editor}
      breedingIndex={breedingIndex}
      datasetVersion="dataset-2"
      markedRecipes={[]}
      onToggleRecipeMark={() => undefined}
    />,
  )
  return { actions, editor }
}

describe('BreedingGraphWorkspace', () => {
  it('renders plans, the add-pal panel and the canvas without presets', () => {
    renderWorkspace()

    expect(screen.getByLabelText('当前方案')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: '加入帕鲁' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '空画布' })).toBeInTheDocument()
    expect(screen.queryByText('当前预设')).not.toBeInTheDocument()
    expect(screen.queryByText('保存预设')).not.toBeInTheDocument()
  })

  it('filters and adds duplicate pals directly to the canvas', () => {
    const { editor } = renderWorkspace()
    fireEvent.change(screen.getByLabelText('搜索可加入的帕鲁'), {
      target: { value: 'Beta' },
    })
    expect(screen.queryByText('起点甲')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '加入画布 亲本乙' }))
    fireEvent.click(screen.getByRole('button', { name: '加入画布 亲本乙' }))
    expect(editor.actions.addManualNode).toHaveBeenCalledTimes(2)
    expect(editor.actions.addManualNode).toHaveBeenCalledWith('Beta')
    expect(screen.getByAltText('亲本乙')).toHaveAttribute('draggable', 'false')

    const dataTransfer = {
      clearData: vi.fn(),
      setData: vi.fn(),
      effectAllowed: '',
    }
    fireEvent.dragStart(screen.getByText('亲本乙').closest('.add-pal-item')!, {
      dataTransfer,
    })
    expect(dataTransfer.clearData).toHaveBeenCalledTimes(1)
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      'application/x-paltools-pal-id',
      'Beta',
    )
  })

  it('fully hides and restores the add-pal panel without losing its search', () => {
    renderWorkspace()
    const search = screen.getByLabelText('搜索可加入的帕鲁')
    fireEvent.change(search, { target: { value: 'Beta' } })

    fireEvent.click(screen.getByRole('button', { name: '收起帕鲁' }))
    expect(
      screen.queryByRole('complementary', { name: '加入帕鲁' }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '打开加入帕鲁侧栏' }))
    expect(screen.getByLabelText('搜索可加入的帕鲁')).toHaveValue('Beta')
  })

  it('flushes the current plan before switching plans', async () => {
    const actions = makeActions()
    const editor = makeEditor()
    renderWorkspace(
      makeState({ plans: [plan, { ...plan, id: 'plan-2', name: '方案 2' }] }),
      actions,
      editor,
    )
    fireEvent.change(screen.getByLabelText('当前方案'), {
      target: { value: 'plan-2' },
    })
    await waitFor(() => expect(editor.actions.flush).toHaveBeenCalled())
    expect(actions.selectPlan).toHaveBeenCalledWith('plan-2')
  })

  it('warns before importing a different dataset and imports independently', async () => {
    const actions = makeActions()
    const text = serializeBreedingPlan(plan, 'dataset-1', new Date(timestamp))
    renderWorkspace(makeState(), actions)

    fireEvent.change(screen.getByLabelText('导入配种图方案文件'), {
      target: {
        files: [{ size: text.length, text: () => Promise.resolve(text) }],
      },
    })
    expect(
      await screen.findByRole('dialog', { name: '数据集版本不同' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '继续导入' }))
    await waitFor(() => expect(actions.importPlan).toHaveBeenCalledTimes(1))
    const imported = vi.mocked(actions.importPlan).mock.calls[0][0]
    expect(imported.id).not.toBe(plan.id)
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
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined,
    )
    renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: '导出' }))
    await waitFor(() => expect(createObjectUrl).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('status')).toHaveTextContent('已开始下载方案')
  })

  it('waits for a successful flush before starting a download', async () => {
    let resolveFlush: (saved: boolean) => void = () => undefined
    const editor = makeEditor()
    editor.actions.flush = vi.fn(
      () => new Promise<boolean>((resolve) => { resolveFlush = resolve }),
    )
    const createObjectUrl = vi.fn(() => 'blob:plan')
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined,
    )
    renderWorkspace(makeState(), makeActions(), editor)

    fireEvent.click(screen.getByRole('button', { name: '导出' }))
    expect(screen.getByRole('button', { name: '导出中…' })).toBeDisabled()
    expect(createObjectUrl).not.toHaveBeenCalled()
    resolveFlush(false)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '当前方案保存失败，未开始下载',
    )
    expect(createObjectUrl).not.toHaveBeenCalled()
  })
})
