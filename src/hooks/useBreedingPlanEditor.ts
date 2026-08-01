import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addChildRelation,
  addPalNode,
  deletePlanNodes,
  deletePlanRelation,
  layoutBreedingPlan,
  mergePalNodes,
} from '../domain/breeding-graph-editor'
import type {
  BreedingPlanV1,
  GraphViewportV1,
} from '../domain/breeding-graph'
import { validateBreedingPlan } from '../domain/breeding-graph'
import { createForestLayoutEngine } from '../domain/breeding-forest-layout'
import { clampGraphViewport } from '../domain/graph-viewport'
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
  viewportPending: boolean
  saveState: 'saved' | 'dirty' | 'saving' | 'error'
  error: string
  statusMessage: string
  canUndo: boolean
  canRedo: boolean
  revealNodeId: string | null
}

export interface BreedingPlanEditorActions {
  addManualNode(palId: string): void
  setSelectedNodeIds(nodeIds: string[]): void
  setViewport(viewport: GraphViewportV1): void
  createChild(): void
  chooseChild(match: BreedingRecipeMatch): void
  cancelChildChoice(): void
  mergeSelected(): void
  deleteSelected(): void
  deleteRelation(relationId: string): void
  undo(): void
  redo(): void
  autoLayout(): void
  flush(): Promise<boolean>
  clearError(): void
  acknowledgeRevealNode(nodeId: string): void
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
    viewportPending: false,
    saveState: 'saved',
    error: '',
    statusMessage: '',
    canUndo: false,
    canRedo: false,
    revealNodeId: null,
  })
  const planRef = useRef(plan)
  const savePlanRef = useRef(savePlan)
  const savingRef = useRef<Promise<boolean> | null>(null)
  const contentRevisionRef = useRef(0)
  const viewportRevisionRef = useRef(0)
  const savedContentRevisionRef = useRef(0)
  const savedViewportRevisionRef = useRef(0)
  const historyRef = useRef<{
    past: BreedingPlanV1[]
    future: BreedingPlanV1[]
  }>({ past: [], future: [] })
  const layoutEngineRef = useRef(createForestLayoutEngine())

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
    contentRevisionRef.current = 0
    viewportRevisionRef.current = 0
    savedContentRevisionRef.current = 0
    savedViewportRevisionRef.current = 0
    setState({
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
      contentRevisionRef.current += 1
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
    if (savingRef.current) {
      const saved = await savingRef.current
      if (!saved) return false
    }

    const hasPendingChanges = () =>
      contentRevisionRef.current !== savedContentRevisionRef.current ||
      viewportRevisionRef.current !== savedViewportRevisionRef.current
    if (!hasPendingChanges() || !planRef.current) return true

    const pending = (async () => {
      while (hasPendingChanges()) {
        const currentPlan = planRef.current
        if (!currentPlan) return true
        const contentRevision = contentRevisionRef.current
        const viewportRevision = viewportRevisionRef.current
        const savingContent =
          contentRevision !== savedContentRevisionRef.current
        if (savingContent) {
          setState((current) => ({
            ...current,
            saveState: 'saving',
            error: '',
          }))
        }
        let saved = false
        try {
          saved = await savePlanRef.current(currentPlan)
        } catch {
          saved = false
        }
        if (!saved) {
          setState((current) => ({
            ...current,
            dirty:
              contentRevisionRef.current !== savedContentRevisionRef.current,
            viewportPending:
              viewportRevisionRef.current !== savedViewportRevisionRef.current,
            saveState: 'error',
            error: '方案保存失败，当前更改仍保留在页面中。',
          }))
          return false
        }
        savedContentRevisionRef.current = contentRevision
        savedViewportRevisionRef.current = viewportRevision
        const contentPending =
          contentRevisionRef.current !== savedContentRevisionRef.current
        const viewportPending =
          viewportRevisionRef.current !== savedViewportRevisionRef.current
        setState((current) => ({
          ...current,
          dirty: contentPending,
          viewportPending,
          saveState: contentPending ? 'dirty' : 'saved',
          error: '',
        }))
      }
      return true
    })().finally(() => {
      savingRef.current = null
    })
    savingRef.current = pending
    return pending
  }, [])

  const commitStructure = useCallback(
    (candidate: BreedingPlanV1, statusMessage = '') =>
      commit(
        layoutBreedingPlan(candidate, palsById, layoutEngineRef.current),
        statusMessage,
      ),
    [commit, palsById],
  )

  const flushRef = useRef(flush)
  useEffect(() => {
    flushRef.current = flush
  }, [flush])

  useEffect(() => {
    if (
      !state.dirty ||
      state.saveState === 'saving' ||
      state.saveState === 'error'
    ) return
    const timeoutId = window.setTimeout(() => {
      void flushRef.current()
    }, 500)
    return () => window.clearTimeout(timeoutId)
  }, [state.dirty, state.saveState])

  useEffect(() => {
    if (
      !state.viewportPending ||
      state.saveState === 'saving' ||
      state.saveState === 'error'
    ) return
    const timeoutId = window.setTimeout(() => {
      void flushRef.current()
    }, 1_000)
    return () => window.clearTimeout(timeoutId)
  }, [state.plan?.viewport, state.saveState, state.viewportPending])

  function addManualNode(palId: string) {
    const currentPlan = planRef.current
    if (!currentPlan || !validPalIds.has(palId)) return
    const nodeId = createId('node')
    const candidate = addPalNode(
      currentPlan,
      palId,
      'manual',
      nodeId,
    )
    if (commitStructure(candidate, '已向画布添加帕鲁节点。')) {
      setState((current) => ({ ...current, revealNodeId: nodeId }))
    }
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
      if (commitStructure(result.plan, '已创建子代节点和配种关系。')) {
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
    contentRevisionRef.current += 1
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
    setViewport: (viewport) => {
      const currentPlan = planRef.current
      if (!currentPlan) return
      const clamped = clampGraphViewport(viewport)
      if (
        currentPlan.viewport.x === clamped.x &&
        currentPlan.viewport.y === clamped.y &&
        currentPlan.viewport.zoom === clamped.zoom
      ) {
        return
      }
      planRef.current = {
        ...currentPlan,
        viewport: clamped,
      }
      viewportRevisionRef.current += 1
      setState((current) => ({
        ...current,
        plan: planRef.current,
        viewportPending: true,
        error: '',
      }))
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
        if (commitStructure(candidate, '节点已合并。')) {
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
        commitStructure(
          result.plan,
          `已删除 ${state.selectedNodeIds.length} 个节点及 ${result.affectedRelations} 条关系。`,
        )
      ) {
        setState((current) => ({ ...current, selectedNodeIds: [] }))
      }
    },
    deleteRelation: (relationId) => {
      const currentPlan = planRef.current
      if (currentPlan) {
        commitStructure(deletePlanRelation(currentPlan, relationId), '关系已删除。')
      }
    },
    undo: () => restoreHistory('undo'),
    redo: () => restoreHistory('redo'),
    autoLayout: () => {
      const currentPlan = planRef.current
      if (currentPlan) {
        commit(
          layoutBreedingPlan(currentPlan, palsById, layoutEngineRef.current),
          '画布已自动整理。',
        )
      }
    },
    flush,
    clearError: () => setState((current) => ({ ...current, error: '' })),
    acknowledgeRevealNode: (nodeId) =>
      setState((current) => ({
        ...current,
        revealNodeId:
          current.revealNodeId === nodeId ? null : current.revealNodeId,
      })),
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
