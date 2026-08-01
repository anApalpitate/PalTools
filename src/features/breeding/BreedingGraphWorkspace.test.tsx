// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { serializeBreedingPlanV2 } from '../../domain/breeding-plan-portability'
import type { BreedingPlanV2 } from '../../domain/breeding-graph'
import type { BreedingIndexPayload, PalRecord } from '../../domain/types'
import type { BreedingGraphWorkspaceActions, BreedingGraphWorkspaceState } from '../../hooks/useBreedingGraphWorkspace'
import type { useBreedingPlanEditor } from '../../hooks/useBreedingPlanEditor'
import { BreedingGraphWorkspace } from './BreedingGraphWorkspace'

afterEach(cleanup)

vi.mock('./BreedingGraphCanvas', () => ({
  PAL_DRAG_MIME: 'application/x-paltools-pal-id',
  BreedingGraphCanvas: () => <section aria-label="配种图画布"><h2>空画布</h2></section>,
}))

const pal: PalRecord = {
  internalId: 'A', paldbId: 'A', paldexNo: '001', name: { zhHans: 'A', en: 'A' }, elements: ['neutral'], rarity: 1,
  workSuitabilities: {}, partnerSkill: null,
  stats: { hp: 1, attack: 1, defense: 1, workSpeed: 1, walkSpeed: 1, runSpeed: 1, swimSpeed: 1, rideSprintSpeed: 1, transportSpeed: 1, stamina: 1, foodAmount: 1 },
  statSources: {}, activeSkills: [], passiveSkills: [], drops: [], image: { localPath: '', sourceUrl: '', sha256: 'a'.repeat(64) }, sourceUrl: '',
}
const plan: BreedingPlanV2 = {
  id: 'plan-1', schemaVersion: 2, name: '方案 1', layers: [], nodes: [], relations: [], viewport: { x: 0, y: 0, zoom: 1 },
  createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
}
const index: BreedingIndexPayload = { schemaVersion: 4, palIds: ['A'], recipes: [], recipesByPair: {}, parentsByChild: {} }

function state(overrides: Partial<BreedingGraphWorkspaceState> = {}): BreedingGraphWorkspaceState {
  return { status: 'ready', error: '', plans: [plan], currentPlanId: plan.id, planSaveState: 'saved', planSaveError: '', ...overrides }
}
function actions(): BreedingGraphWorkspaceActions {
  return { selectPlan: vi.fn(), createPlan: vi.fn(), renamePlan: vi.fn(), deletePlan: vi.fn(), importPlan: vi.fn(async () => true), savePlan: vi.fn(async () => true) }
}
function editor(): ReturnType<typeof useBreedingPlanEditor> {
  return {
    state: { plan, selectedNodeIds: [], focusedNodeId: null, recipeChoices: [], placementPalId: null, clipboardPalId: null, dirty: false, viewportPending: false, saveState: 'saved', error: '', statusMessage: '', canUndo: false, canRedo: false, revealNodeId: null },
    actions: { addManualNode: vi.fn(), beginPlacement: vi.fn(), placeManualNode: vi.fn(), cancelPlacement: vi.fn(), setSelectedNodeIds: vi.fn(), setFocusedNodeId: vi.fn(), setViewport: vi.fn(), createChild: vi.fn(), createChildFromNodes: vi.fn(), chooseChild: vi.fn(), cancelChildChoice: vi.fn(), deleteSelected: vi.fn(), copySelected: vi.fn(), paste: vi.fn(), undo: vi.fn(), redo: vi.fn(), flush: vi.fn(async () => true), clearError: vi.fn(), acknowledgeRevealNode: vi.fn() },
  }
}
function renderWorkspace(wsState = state(), wsActions = actions(), wsEditor = editor()) {
  render(<BreedingGraphWorkspace pals={[pal]} state={wsState} actions={wsActions} editor={wsEditor} breedingIndex={index} datasetVersion="dataset-2" markedRecipes={[]} onToggleRecipeMark={vi.fn()} />)
  return { wsActions, wsEditor }
}

describe('BreedingGraphWorkspace', () => {
  it('renders the plan bar and safe add-pal side rail', () => {
    renderWorkspace()
    expect(screen.getByLabelText('配种图方案管理')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: '加入帕鲁' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '空画布' })).toBeInTheDocument()
  })

  it('waits for flush and reports download started instead of export success', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:plan')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const { wsEditor } = renderWorkspace()
    fireEvent.click(screen.getAllByRole('button', { name: '导出' })[0])
    await waitFor(() => expect(wsEditor.actions.flush).toHaveBeenCalled())
    expect(createObjectURL).toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('已开始下载方案')
    expect(screen.getByRole('status')).not.toHaveTextContent('导出成功')
  })

  it('imports only v2 plans', async () => {
    const wsActions = actions()
    const text = serializeBreedingPlanV2(plan, 'dataset-2', new Date(plan.updatedAt))
    renderWorkspace(state(), wsActions)
    fireEvent.change(screen.getAllByLabelText('导入配种图方案文件')[0], { target: { files: [{ size: text.length, text: () => Promise.resolve(text) }] } })
    await waitFor(() => expect(wsActions.importPlan).toHaveBeenCalledWith(expect.objectContaining({ schemaVersion: 2 })))
  })
})
