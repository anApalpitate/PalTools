import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addChildRelation,
  addPalNode,
  appendRecipeToPlan,
  deletePlanNodes,
  deletePlanRelation,
  layoutBreedingPlan,
  mergePalNodes,
  updateNodePositions,
} from '../domain/breeding-graph-editor'
import type {
  BreedingPlanV1,
  GraphPositionV1,
  GraphViewportV1,
} from '../domain/breeding-graph'
import { validateBreedingPlan } from '../domain/breeding-graph'
import { recipeMatchesForParents } from '../domain/pals'
import type {
  BreedingIndexPayload,
  BreedingRecipeMatch,
  PalRecord,
} from '../domain/types'

export interface BreedingPlanEditorState {
  plan: BreedingPlanV1 | null
  selectedNodeIds: string[]
  recipeChoices: BreedingRecipeMatch[]
  dirty: boolean
  saveState: 'saved' | 'dirty' | 'saving' | 'error'
  error: string
  statusMessage: string
  canUndo: boolean
  canRedo: boolean
}

export interface BreedingPlanEditorActions {
  addManualNode(palId: string, position?: GraphPositionV1): void
  setSelectedNodeIds(nodeIds: string[]): void
  updatePositions(positions: ReadonlyMap<string, GraphPositionV1>): void
  setViewport(viewport: GraphViewportV1): void
  createChild(): void
  chooseChild(match: BreedingRecipeMatch): void
  appendRecipe(match: BreedingRecipeMatch): boolean
  cancelChildChoice(): void
  mergeSelected(): void
  deleteSelected(): void
  deleteRelation(relationId: string): void
  undo(): void
  redo(): void
  autoLayout(): void
  flush(): Promise<boolean>
  clearError(): void
}

export function useBreedingPlanEditor({
  plan,
  pals,
  breedingIndex,
  savePlan,
}: {
  plan: BreedingPlanV1 | null
  pals: PalRecord[]
  breedingIndex: BreedingIndexPayload | null
  savePlan: (plan: BreedingPlanV1) => Promise<boolean>
}): { state: BreedingPlanEditorState; actions: BreedingPlanEditorActions } {
  const [state, setState] = useState<BreedingPlanEditorState>({
    plan,
    selectedNodeIds: [],
    recipeChoices: [],
    dirty: false,
    saveState: 'saved',
    error: '',
    statusMessage: '',
    canUndo: false,
    canRedo: false,
  })
  const planRef = useRef(plan)
  const savePlanRef = useRef(savePlan)
  const savingRef = useRef<Promise<boolean> | null>(null)
  const historyRef = useRef<{
    past: BreedingPlanV1[]
    future: BreedingPlanV1[]
  }>({ past: [], future: [] })

  const validPalIds = useMemo(
    () => new Set(pals.map((pal) => pal.internalId)),
    [pals],
  )
  const palsById = useMemo(
    () => new Map(pals.map((pal) => [pal.internalId, pal])),
    [pals],
  )

  useEffect(() => {
    savePlanRef.current = savePlan
  }, [savePlan])

  useEffect(() => {
    planRef.current = plan
    historyRef.current = { past: [], future: [] }
    setState({
      plan,
      selectedNodeIds: [],
      recipeChoices: [],
      dirty: false,
      saveState: 'saved',
      error: '',
      statusMessage: '',
      canUndo: false,
      canRedo: false,
    })
  }, [plan?.id])

  const commit = useCallback(
    (
      candidate: BreedingPlanV1,
      statusMessage = '',
      recordHistory = true,
    ) => {
      if (candidate === planRef.current) return true
      if (breedingIndex) {
        const validation = validateBreedingPlan(candidate, {
          validPalIds,
          breedingIndex,
        })
        if (!validation.valid) {
          setState((current) => ({
            ...current,
            error: validation.issues[0]?.message ?? '方案变更不合法。',
          }))
          return false
        }
      }
      if (recordHistory && planRef.current) {
        historyRef.current = {
          past: [...historyRef.current.past, planRef.current].slice(-100),
          future: [],
        }
      }
      planRef.current = candidate
      setState((current) => ({
        ...current,
        plan: candidate,
        dirty: true,
        saveState: 'dirty',
        error: '',
        statusMessage,
        canUndo: historyRef.current.past.length > 0,
        canRedo: historyRef.current.future.length > 0,
      }))
      return true
    },
    [breedingIndex, validPalIds],
  )

  const flush = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) return savingRef.current
    const currentPlan = planRef.current
    if (!currentPlan) return true
    if (!state.dirty && state.saveState !== 'error') return true

    setState((current) => ({ ...current, saveState: 'saving', error: '' }))
    const pending = savePlanRef
      .current(currentPlan)
      .then((saved) => {
        if (saved) {
          const unchangedDuringSave = planRef.current === currentPlan
          setState((current) => ({
            ...current,
            dirty: !unchangedDuringSave,
            saveState: unchangedDuringSave ? 'saved' : 'dirty',
            error: '',
          }))
        } else if (!saved) {
          setState((current) => ({
            ...current,
            dirty: true,
            saveState: 'error',
            error: '方案保存失败，当前更改仍保留在页面中。',
          }))
        }
        return saved
      })
      .finally(() => {
        savingRef.current = null
      })
    savingRef.current = pending
    return pending
  }, [state.dirty, state.saveState])

  const flushRef = useRef(flush)
  useEffect(() => {
    flushRef.current = flush
  }, [flush])

  useEffect(() => {
    if (!state.dirty || state.saveState === 'saving') return
    const timeoutId = window.setTimeout(() => {
      void flushRef.current()
    }, 500)
    return () => window.clearTimeout(timeoutId)
  }, [state.dirty, state.plan, state.saveState])

  function addManualNode(palId: string, position?: GraphPositionV1) {
    const currentPlan = planRef.current
    if (!currentPlan || !validPalIds.has(palId)) return
    const candidate = addPalNode(
      currentPlan,
      palId,
      'manual',
      createId('node'),
      position,
    )
    commit(candidate, '已向画布添加帕鲁节点。')
  }

  function chooseChild(match: BreedingRecipeMatch) {
    const currentPlan = planRef.current
    if (!currentPlan || !breedingIndex || state.selectedNodeIds.length !== 2) {
      return
    }
    try {
      const result = addChildRelation(
        currentPlan,
        state.selectedNodeIds[0],
        state.selectedNodeIds[1],
        match,
        { node: () => createId('node'), relation: () => createId('relation') },
        { validPalIds, breedingIndex },
      )
      if (commit(result.plan, '已创建子代节点和配种关系。')) {
        setState((current) => ({
          ...current,
          selectedNodeIds: [result.childNodeId],
          recipeChoices: [],
        }))
      }
    } catch (error: unknown) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : '创建子代失败。',
      }))
    }
  }

  function appendRecipe(match: BreedingRecipeMatch): boolean {
    const currentPlan = planRef.current
    if (!currentPlan || !breedingIndex) return false
    try {
      const candidate = appendRecipeToPlan(
        currentPlan,
        match,
        { node: () => createId('node'), relation: () => createId('relation') },
        { validPalIds, breedingIndex },
      )
      return commit(candidate, '配方已追加到当前方案。')
    } catch (error: unknown) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : '配方追加失败。',
      }))
      return false
    }
  }

  function restoreHistory(direction: 'undo' | 'redo') {
    const currentPlan = planRef.current
    if (!currentPlan) return
    const source = direction === 'undo' ? historyRef.current.past : historyRef.current.future
    const target = source.at(-1)
    if (!target) return
    const nextHistory = source.slice(0, -1)
    historyRef.current =
      direction === 'undo'
        ? {
            past: nextHistory,
            future: [...historyRef.current.future, currentPlan].slice(-100),
          }
        : {
            past: [...historyRef.current.past, currentPlan].slice(-100),
            future: nextHistory,
          }
    const candidate = {
      ...target,
      viewport: currentPlan.viewport,
      updatedAt: new Date().toISOString(),
    }
    planRef.current = candidate
    setState((current) => ({
      ...current,
      plan: candidate,
      selectedNodeIds: [],
      recipeChoices: [],
      dirty: true,
      saveState: 'dirty',
      error: '',
      statusMessage: direction === 'undo' ? '已撤销上一步。' : '已重做上一步。',
      canUndo: historyRef.current.past.length > 0,
      canRedo: historyRef.current.future.length > 0,
    }))
  }

  const actions: BreedingPlanEditorActions = {
    addManualNode,
    setSelectedNodeIds: (nodeIds) => {
      const existingIds = new Set(planRef.current?.nodes.map((node) => node.id))
      setState((current) => ({
        ...current,
        selectedNodeIds: [...new Set(nodeIds)].filter((id) => existingIds.has(id)),
        error: '',
      }))
    },
    updatePositions: (positions) => {
      const currentPlan = planRef.current
      if (currentPlan) commit(updateNodePositions(currentPlan, positions))
    },
    setViewport: (viewport) => {
      const currentPlan = planRef.current
      if (!currentPlan) return
      if (
        currentPlan.viewport.x === viewport.x &&
        currentPlan.viewport.y === viewport.y &&
        currentPlan.viewport.zoom === viewport.zoom
      ) {
        return
      }
      commit({
        ...currentPlan,
        viewport,
        updatedAt: new Date().toISOString(),
      }, '', false)
    },
    createChild: () => {
      const currentPlan = planRef.current
      if (!currentPlan || !breedingIndex) return
      if (state.selectedNodeIds.length !== 2) {
        setState((current) => ({
          ...current,
          error: '请先选择两个不同的亲本节点。',
        }))
        return
      }
      const parentA = currentPlan.nodes.find(
        (node) => node.id === state.selectedNodeIds[0],
      )
      const parentB = currentPlan.nodes.find(
        (node) => node.id === state.selectedNodeIds[1],
      )
      if (!parentA || !parentB || parentA.id === parentB.id) {
        setState((current) => ({
          ...current,
          error: '请先选择两个不同的亲本节点。',
        }))
        return
      }
      const matches = recipeMatchesForParents(
        breedingIndex,
        parentA.palId,
        parentB.palId,
      )
      if (matches.length === 0) {
        setState((current) => ({
          ...current,
          recipeChoices: [],
          error: '当前组合没有正式配方。',
        }))
      } else if (matches.length === 1) {
        chooseChild(matches[0])
      } else {
        setState((current) => ({
          ...current,
          recipeChoices: matches,
          error: '',
        }))
      }
    },
    chooseChild,
    appendRecipe,
    cancelChildChoice: () =>
      setState((current) => ({ ...current, recipeChoices: [] })),
    mergeSelected: () => {
      const currentPlan = planRef.current
      if (!currentPlan || !breedingIndex || state.selectedNodeIds.length !== 2) return
      try {
        const candidate = mergePalNodes(
          currentPlan,
          state.selectedNodeIds[0],
          state.selectedNodeIds[1],
          { validPalIds, breedingIndex },
        )
        if (commit(candidate, '节点已合并。')) {
          setState((current) => ({
            ...current,
            selectedNodeIds: [state.selectedNodeIds[0]],
          }))
        }
      } catch (error: unknown) {
        setState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : '节点合并失败。',
        }))
      }
    },
    deleteSelected: () => {
      const currentPlan = planRef.current
      if (!currentPlan || state.selectedNodeIds.length === 0) return
      const result = deletePlanNodes(currentPlan, new Set(state.selectedNodeIds))
      if (
        commit(
          result.plan,
          `已删除 ${state.selectedNodeIds.length} 个节点及 ${result.affectedRelations} 条关系。`,
        )
      ) {
        setState((current) => ({ ...current, selectedNodeIds: [] }))
      }
    },
    deleteRelation: (relationId) => {
      const currentPlan = planRef.current
      if (currentPlan) commit(deletePlanRelation(currentPlan, relationId), '关系已删除。')
    },
    undo: () => restoreHistory('undo'),
    redo: () => restoreHistory('redo'),
    autoLayout: () => {
      const currentPlan = planRef.current
      if (currentPlan) commit(layoutBreedingPlan(currentPlan, palsById), '画布已自动整理。')
    },
    flush,
    clearError: () => setState((current) => ({ ...current, error: '' })),
  }

  return { state, actions }
}

function createId(prefix: string): string {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${id}`
}
