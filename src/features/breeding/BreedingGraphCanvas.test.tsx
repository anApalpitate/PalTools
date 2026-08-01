// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PalRecord } from '../../domain/types'
import type { useBreedingPlanEditor } from '../../hooks/useBreedingPlanEditor'
import { BreedingGraphCanvas } from './BreedingGraphCanvas'

afterEach(cleanup)

const timestamp = '2026-08-01T00:00:00.000Z'
const pal: PalRecord = {
  internalId: 'Alpha',
  paldbId: 'Alpha',
  paldexNo: '001',
  name: { zhHans: '测试帕鲁', en: 'Alpha' },
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
    localPath: '/generated/pals/Alpha.webp',
    sourceUrl: 'https://example.invalid/Alpha.webp',
    sha256: 'a'.repeat(64),
  },
  sourceUrl: 'https://example.invalid/Alpha',
}

function makeEditor(): ReturnType<typeof useBreedingPlanEditor> {
  const plan = {
    id: 'plan-1',
    schemaVersion: 1 as const,
    name: '方案 1',
    nodes: [
      {
        id: 'node-1',
        palId: 'Alpha',
        position: { x: 0, y: 0 },
        source: 'manual' as const,
      },
    ],
    relations: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  return {
    state: {
      plan,
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
      addManualNode: vi.fn(),
      setSelectedNodeIds: vi.fn(),
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

describe('BreedingGraphCanvas', () => {
  it('switches tool cursor modes and keeps node selection/query semantics', () => {
    const editor = makeEditor()
    const onQueryPal = vi.fn()
    const { container } = render(
      <BreedingGraphCanvas
        palsById={new Map([[pal.internalId, pal]])}
        editor={editor}
        onQueryPal={onQueryPal}
      />,
    )
    const surface = container.querySelector('.graph-forest-surface')
    const node = screen.getByRole('button', { name: /测试帕鲁/ })

    expect(surface).toHaveClass('is-tool-select')
    fireEvent.click(node)
    expect(editor.actions.setSelectedNodeIds).toHaveBeenCalledWith(['node-1'])

    fireEvent.click(screen.getByRole('button', { name: '平移画布' }))
    expect(surface).toHaveClass('is-tool-pan')

    fireEvent.click(screen.getByRole('button', { name: '查询获取方式' }))
    expect(surface).toHaveClass('is-tool-query')
    fireEvent.click(node)
    expect(onQueryPal).toHaveBeenCalledWith('Alpha')
  })

  it('clamps zoom buttons at the shared maximum', async () => {
    const editor = makeEditor()
    render(
      <BreedingGraphCanvas
        palsById={new Map([[pal.internalId, pal]])}
        editor={editor}
        onQueryPal={() => undefined}
      />,
    )
    const zoomIn = screen.getByRole('button', { name: '放大画布' })
    fireEvent.click(zoomIn)
    await waitFor(() =>
      expect(editor.actions.setViewport).toHaveBeenLastCalledWith(
        expect.objectContaining({ zoom: 1.2 }),
      ),
    )
    fireEvent.click(zoomIn)
    await waitFor(() =>
      expect(editor.actions.setViewport).toHaveBeenLastCalledWith(
        expect.objectContaining({ zoom: 1.4 }),
      ),
    )
    fireEvent.click(zoomIn)

    await waitFor(() => expect(zoomIn).toBeDisabled())
    expect(editor.actions.setViewport).toHaveBeenLastCalledWith(
      expect.objectContaining({ zoom: 1.5 }),
    )
  })
})
