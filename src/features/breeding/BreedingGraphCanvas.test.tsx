// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BreedingPlanEditorActions, BreedingPlanEditorState } from '../../hooks/useBreedingPlanEditor'
import type { BreedingPlanV2 } from '../../domain/breeding-graph'
import type { PalRecord } from '../../domain/types'
import { BreedingGraphCanvas } from './BreedingGraphCanvas'

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() { /* jsdom has no layout engine */ }
    disconnect() { /* noop */ }
  } as unknown as typeof ResizeObserver
}

const pal: PalRecord = {
  internalId: 'A', paldbId: 'A', paldexNo: '001', name: { zhHans: 'A', en: 'A' },
  elements: ['neutral'], rarity: 1, workSuitabilities: {}, partnerSkill: null,
  stats: { hp: 1, attack: 1, defense: 1, workSpeed: 1, walkSpeed: 1, runSpeed: 1, swimSpeed: 1, rideSprintSpeed: 1, transportSpeed: 1, stamina: 1, foodAmount: 1 },
  statSources: {}, activeSkills: [], passiveSkills: [], drops: [],
  image: { localPath: '', sourceUrl: '', sha256: 'a'.repeat(64) }, sourceUrl: '',
}

const plan: BreedingPlanV2 = {
  id: 'plan-1', schemaVersion: 2, name: '方案 1',
  layers: [{ nodeIds: ['node-1'] }],
  nodes: [{ id: 'node-1', palId: 'A', source: 'manual' }],
  relations: [], viewport: { x: 0, y: 0, zoom: 1 },
  createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
}

function makeEditor() {
  const state: BreedingPlanEditorState = {
    plan, selectedNodeIds: [], focusedNodeId: null, recipeChoices: [], placementPalId: null,
    clipboardPalId: null, dirty: false, viewportPending: false, saveState: 'saved', error: '',
    statusMessage: '', canUndo: false, canRedo: false, revealNodeId: null,
  }
  const actions: BreedingPlanEditorActions = {
    addManualNode: vi.fn(), beginPlacement: vi.fn(), placeManualNode: vi.fn(), cancelPlacement: vi.fn(),
    setSelectedNodeIds: vi.fn(), setFocusedNodeId: vi.fn(), setViewport: vi.fn(), createChild: vi.fn(),
    createChildFromNodes: vi.fn(), chooseChild: vi.fn(), cancelChildChoice: vi.fn(), deleteSelected: vi.fn(),
    copySelected: vi.fn(), paste: vi.fn(), undo: vi.fn(), redo: vi.fn(), flush: vi.fn(() => Promise.resolve(true)),
    clearError: vi.fn(), acknowledgeRevealNode: vi.fn(),
  }
  return { state, actions }
}

describe('BreedingGraphCanvas', () => {
  it('supports cursor, pan and query modes', () => {
    const editor = makeEditor()
    const onQueryPal = vi.fn()
    render(<BreedingGraphCanvas palsById={new Map([[pal.internalId, pal]])} editor={editor} markedRecipes={[]} onToggleRecipeMark={vi.fn()} onQueryPal={onQueryPal} />)
    const node = screen.getByRole('button', { name: /A/ })
    fireEvent.click(node)
    expect(editor.actions.setSelectedNodeIds).toHaveBeenCalledWith(['node-1'])
    fireEvent.click(screen.getByRole('button', { name: '仅平移' }))
    expect(screen.getByRole('button', { name: '仅平移' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '查询获取方式' }))
    fireEvent.click(node)
    expect(onQueryPal).toHaveBeenCalledWith('A')
  })

  it('handles copy, paste and zoom shortcuts at the canvas surface', () => {
    const editor = makeEditor()
    const { container } = render(<BreedingGraphCanvas palsById={new Map([[pal.internalId, pal]])} editor={editor} markedRecipes={[]} onToggleRecipeMark={vi.fn()} onQueryPal={vi.fn()} />)
    const surface = container.querySelector('.graph-forest-surface')!
    fireEvent.keyDown(surface, { key: 'c', ctrlKey: true })
    fireEvent.keyDown(surface, { key: 'v', ctrlKey: true })
    fireEvent.keyDown(surface, { key: '+', ctrlKey: true })
    fireEvent.keyDown(surface, { key: '-', ctrlKey: true })
    expect(editor.actions.copySelected).toHaveBeenCalled()
    expect(editor.actions.paste).toHaveBeenCalled()
    expect(editor.actions.setViewport).toHaveBeenCalled()
  })

  it('maps shift-wheel to horizontal panning and keeps insert slots outside nodes', async () => {
    const editor = makeEditor()
    editor.state.placementPalId = 'B'
    const { container } = render(<BreedingGraphCanvas palsById={new Map([[pal.internalId, pal]])} editor={editor} markedRecipes={[]} onToggleRecipeMark={vi.fn()} onQueryPal={vi.fn()} />)
    const surface = container.querySelector('.graph-forest-surface')!
    fireEvent.wheel(surface, { deltaY: 40, deltaX: 0, shiftKey: true })
    const node = container.querySelector('.graph-forest-node') as HTMLElement
    const nodeLeft = Number.parseFloat(node.style.left)
    const slots = [...container.querySelectorAll<HTMLElement>('.graph-slot')]
    expect(slots).toHaveLength(2)
    fireEvent.click(slots[0])
    expect(editor.actions.placeManualNode).toHaveBeenCalledWith('B', expect.objectContaining({ id: 'insert-0-0' }))
    await waitFor(() => expect(editor.actions.setViewport).toHaveBeenCalledWith(expect.objectContaining({ x: -40, y: 0 })))
    expect(Number.parseFloat(slots[0].style.left) + 48).toBeLessThanOrEqual(nodeLeft)
    expect(Number.parseFloat(slots[1].style.left)).toBeGreaterThanOrEqual(nodeLeft + 160)
  })

  it('does not render a first slot for an empty graph', () => {
    const editor = makeEditor()
    editor.state.plan = { ...plan, layers: [], nodes: [] }
    const { container } = render(<BreedingGraphCanvas palsById={new Map([[pal.internalId, pal]])} editor={editor} markedRecipes={[]} onToggleRecipeMark={vi.fn()} onQueryPal={vi.fn()} />)
    expect(container.querySelectorAll('.graph-slot')).toHaveLength(0)
  })

  it('reveals a newly added node while preserving zoom', async () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 800 })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 })
    const editor = makeEditor()
    editor.state.revealNodeId = 'node-1'
    render(<BreedingGraphCanvas palsById={new Map([[pal.internalId, pal]])} editor={editor} markedRecipes={[]} onToggleRecipeMark={vi.fn()} onQueryPal={vi.fn()} />)
    await waitFor(() => expect(editor.actions.acknowledgeRevealNode).toHaveBeenCalledWith('node-1'))
  })
})
