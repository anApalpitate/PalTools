import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createChildRelation,
  createEmptyLayeredPlan,
  deleteLayeredNodes,
  deriveLayeredSlots,
  insertManualNode,
  type LayeredSlotTarget,
} from '../domain/breeding-layered-graph'
import type { BreedingPlanV2, GraphViewportV1 } from '../domain/breeding-graph'
import { validateBreedingPlanV2 } from '../domain/breeding-graph'
import { clampGraphViewport } from '../domain/graph-viewport'
import { recipeMatchesForParents } from '../domain/pals'
import type { BreedingIndexPayload, BreedingRecipeMatch, PalRecord } from '../domain/types'

export interface BreedingPlanEditorState {
  plan: BreedingPlanV2 | null
  selectedNodeIds: string[]
  focusedNodeId: string | null
  recipeChoices: BreedingRecipeMatch[]
  placementPalId: string | null
  clipboardPalId: string | null
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
  beginPlacement(palId: string): void
  placeManualNode(palId: string, slot: LayeredSlotTarget): void
  cancelPlacement(): void
  setSelectedNodeIds(nodeIds: string[]): void
  setFocusedNodeId(nodeId: string | null): void
  setViewport(viewport: GraphViewportV1): void
  createChild(): void
  createChildFromNodes(parentAId: string, parentBId: string): void
  chooseChild(match: BreedingRecipeMatch): void
  cancelChildChoice(): void
  deleteSelected(): void
  copySelected(): void
  paste(slot?: LayeredSlotTarget): void
  undo(): void
  redo(): void
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
  plan: BreedingPlanV2 | null
  pals: PalRecord[]
  breedingIndex: BreedingIndexPayload | null
  savePlan: (plan: BreedingPlanV2) => Promise<boolean>
}): { state: BreedingPlanEditorState; actions: BreedingPlanEditorActions } {
  const [state, setState] = useState<BreedingPlanEditorState>({
    plan,
    selectedNodeIds: [],
    focusedNodeId: null,
    recipeChoices: [],
    placementPalId: null,
    clipboardPalId: null,
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
  const clipboardRef = useRef<string | null>(null)
  const historyRef = useRef<{ past: BreedingPlanV2[]; future: BreedingPlanV2[] }>({ past: [], future: [] })

  const validPalIds = useMemo(() => new Set(pals.map((pal) => pal.internalId)), [pals])

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
      focusedNodeId: null,
      recipeChoices: [],
      placementPalId: null,
      clipboardPalId: clipboardRef.current,
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

  const commit = useCallback((candidate: BreedingPlanV2, statusMessage = '', recordHistory = true) => {
    if (candidate === planRef.current) return true
    if (breedingIndex) {
      const validation = validateBreedingPlanV2(candidate, { validPalIds, breedingIndex })
      if (!validation.valid) {
        setState((current) => ({ ...current, error: validation.issues[0]?.message ?? '方案变更不合法。' }))
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
  }, [breedingIndex, validPalIds])

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
        setState((current) => ({ ...current, saveState: 'saving', error: '' }))
        let saved = false
        try {
          saved = await savePlanRef.current(currentPlan)
        } catch {
          saved = false
        }
        if (!saved) {
          setState((current) => ({
            ...current,
            dirty: contentRevisionRef.current !== savedContentRevisionRef.current,
            viewportPending: viewportRevisionRef.current !== savedViewportRevisionRef.current,
            saveState: 'error',
            error: '方案保存失败，当前更改仍保留在页面中。',
          }))
          return false
        }
        savedContentRevisionRef.current = contentRevision
        savedViewportRevisionRef.current = viewportRevision
        const contentPending = contentRevisionRef.current !== savedContentRevisionRef.current
        const viewportPending = viewportRevisionRef.current !== savedViewportRevisionRef.current
        setState((current) => ({
          ...current,
          dirty: contentPending,
          viewportPending,
          saveState: contentPending || viewportPending ? 'dirty' : 'saved',
          error: '',
        }))
      }
      return true
    })().finally(() => { savingRef.current = null })
    savingRef.current = pending
    return pending
  }, [])

  const flushRef = useRef(flush)
  useEffect(() => { flushRef.current = flush }, [flush])

  useEffect(() => {
    if (!state.dirty || state.saveState === 'saving' || state.saveState === 'error') return
    const timeoutId = window.setTimeout(() => { void flushRef.current() }, 500)
    return () => window.clearTimeout(timeoutId)
  }, [state.dirty, state.saveState])

  useEffect(() => {
    if (!state.viewportPending || state.saveState === 'saving' || state.saveState === 'error') return
    const timeoutId = window.setTimeout(() => { void flushRef.current() }, 1_000)
    return () => window.clearTimeout(timeoutId)
  }, [state.plan?.viewport, state.saveState, state.viewportPending])

  function commitNode(palId: string, slot: LayeredSlotTarget, sourceMessage: string, source: 'manual' | 'paste' = 'manual') {
    const currentPlan = planRef.current
    if (!currentPlan || !validPalIds.has(palId)) return
    const nodeId = createId('node')
    const candidate = insertManualNode(currentPlan, palId, slot, nodeId, source)
    if (commit(candidate, sourceMessage)) {
      setState((current) => ({ ...current, placementPalId: null, revealNodeId: nodeId, selectedNodeIds: [nodeId], focusedNodeId: nodeId }))
    }
  }

  function addManualNode(palId: string) {
    const currentPlan = planRef.current
    if (!currentPlan) return
    const slots = deriveLayeredSlots(currentPlan)
    if (slots.length === 1 && slots[0].kind === 'empty') {
      commitNode(palId, slots[0], '已添加帕鲁节点。')
    } else {
      setState((current) => ({ ...current, placementPalId: palId, error: '', statusMessage: '请选择要放置帕鲁的槽位。' }))
    }
  }

  function createChildFromNodes(parentAId: string, parentBId: string) {
    const currentPlan = planRef.current
    if (!currentPlan || !breedingIndex) {
      setState((current) => ({ ...current, error: '请先选择两个不同的亲本节点。' }))
      return
    }
    const nodeA = currentPlan.nodes.find((node) => node.id === parentAId)
    const nodeB = currentPlan.nodes.find((node) => node.id === parentBId)
    if (!nodeA || !nodeB || nodeA.id === nodeB.id) {
      setState((current) => ({ ...current, error: '请先选择两个不同的亲本节点。' }))
      return
    }
    const matches = recipeMatchesForParents(breedingIndex, nodeA.palId, nodeB.palId)
    if (matches.length === 0) {
      setState((current) => ({ ...current, recipeChoices: [], error: '当前组合没有正式配方。' }))
    } else if (matches.length === 1) {
      chooseChild(matches[0], parentAId, parentBId)
    } else {
      setState((current) => ({ ...current, recipeChoices: matches, error: '' }))
    }
  }

  function createChild() {
    if (state.selectedNodeIds.length !== 2) {
      setState((current) => ({ ...current, error: '请先选择两个不同的亲本节点。' }))
      return
    }
    createChildFromNodes(state.selectedNodeIds[0], state.selectedNodeIds[1])
  }

  function chooseChild(match: BreedingRecipeMatch, parentAId = state.selectedNodeIds[0], parentBId = state.selectedNodeIds[1]) {
    const currentPlan = planRef.current
    if (!currentPlan || !breedingIndex || !parentAId || !parentBId) return
    try {
      const result = createChildRelation(
        currentPlan,
        parentAId,
        parentBId,
        match,
        { node: () => createId('node'), relation: () => createId('relation') },
        { validPalIds, breedingIndex },
      )
      if (commit(result.plan, '已创建子代节点和配种关系。')) {
        setState((current) => ({ ...current, selectedNodeIds: [result.childNodeId], focusedNodeId: result.childNodeId, recipeChoices: [], revealNodeId: result.childNodeId }))
      }
    } catch (error: unknown) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : '创建子代失败。' }))
    }
  }

  function restoreHistory(direction: 'undo' | 'redo') {
    const currentPlan = planRef.current
    if (!currentPlan) return
    const source = direction === 'undo' ? historyRef.current.past : historyRef.current.future
    const target = source.at(-1)
    if (!target) return
    const nextHistory = source.slice(0, -1)
    historyRef.current = direction === 'undo'
      ? { past: nextHistory, future: [...historyRef.current.future, currentPlan].slice(-100) }
      : { past: [...historyRef.current.past, currentPlan].slice(-100), future: nextHistory }
    const candidate = { ...target, viewport: currentPlan.viewport, updatedAt: new Date().toISOString() }
    planRef.current = candidate
    contentRevisionRef.current += 1
    setState((current) => ({
      ...current,
      plan: candidate,
      selectedNodeIds: [],
      focusedNodeId: null,
      recipeChoices: [],
      placementPalId: null,
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
    beginPlacement: (palId) => setState((current) => ({ ...current, placementPalId: palId, error: '', statusMessage: '请选择要放置帕鲁的槽位。' })),
    placeManualNode: (palId, slot) => commitNode(palId, slot, '已添加帕鲁节点。'),
    cancelPlacement: () => setState((current) => ({ ...current, placementPalId: null, statusMessage: '' })),
    setSelectedNodeIds: (nodeIds) => {
      const existingIds = new Set(planRef.current?.nodes.map((node) => node.id))
      const next = [...new Set(nodeIds)].filter((id) => existingIds.has(id)).slice(-2)
      setState((current) => ({ ...current, selectedNodeIds: next, focusedNodeId: next.at(-1) ?? current.focusedNodeId, error: '' }))
    },
    setFocusedNodeId: (nodeId) => setState((current) => ({ ...current, focusedNodeId: nodeId })),
    setViewport: (viewport) => {
      const currentPlan = planRef.current
      if (!currentPlan) return
      const clamped = clampGraphViewport(viewport)
      if (JSON.stringify(currentPlan.viewport) === JSON.stringify(clamped)) return
      planRef.current = { ...currentPlan, viewport: clamped }
      viewportRevisionRef.current += 1
      setState((current) => ({ ...current, plan: planRef.current, viewportPending: true, error: '' }))
    },
    createChild,
    createChildFromNodes,
    chooseChild,
    cancelChildChoice: () => setState((current) => ({ ...current, recipeChoices: [] })),
    deleteSelected: () => {
      const currentPlan = planRef.current
      if (!currentPlan || state.selectedNodeIds.length === 0) return
      const result = deleteLayeredNodes(currentPlan, new Set(state.selectedNodeIds))
      if (commit(result.plan, `已删除 ${result.deletedNodeIds.length} 个节点及 ${result.deletedRelationIds.length} 条关系。`)) {
        setState((current) => ({ ...current, selectedNodeIds: [], focusedNodeId: null }))
      }
    },
    copySelected: () => {
      const nodeId = state.focusedNodeId ?? state.selectedNodeIds.at(-1)
      const node = planRef.current?.nodes.find((candidate) => candidate.id === nodeId)
      if (!node) {
        setState((current) => ({ ...current, statusMessage: '请先选择一个帕鲁节点。' }))
        return
      }
      clipboardRef.current = node.palId
      setState((current) => ({ ...current, clipboardPalId: node.palId, statusMessage: '已复制帕鲁节点。' }))
    },
    paste: (slot) => {
      const palId = clipboardRef.current
      const currentPlan = planRef.current
      if (!palId || !currentPlan) {
        setState((current) => ({ ...current, statusMessage: '剪贴板中没有帕鲁节点。' }))
        return
      }
      const target = slot ?? defaultPasteSlot(currentPlan, state.focusedNodeId ?? state.selectedNodeIds.at(-1) ?? null)
      if (!target) {
        setState((current) => ({ ...current, error: '当前没有可用的粘贴槽位。' }))
        return
      }
      commitNode(palId, target, '已粘贴帕鲁节点。', 'paste')
    },
    undo: () => restoreHistory('undo'),
    redo: () => restoreHistory('redo'),
    flush,
    clearError: () => setState((current) => ({ ...current, error: '' })),
    acknowledgeRevealNode: (nodeId) => setState((current) => ({ ...current, revealNodeId: current.revealNodeId === nodeId ? null : current.revealNodeId })),
  }
  return { state, actions }
}

function defaultPasteSlot(plan: BreedingPlanV2, focusedNodeId: string | null): LayeredSlotTarget | null {
  if (plan.layers.length === 0) return deriveLayeredSlots(plan)[0]
  const row = focusedNodeId ? plan.layers.findIndex((layer) => layer.nodeIds.includes(focusedNodeId)) : 0
  const targetRow = row >= 0 ? row : 0
  const layer = plan.layers[targetRow]
  if (!layer) return null
  return deriveLayeredSlots(plan).find((slot) => slot.row === targetRow && slot.index === layer.nodeIds.length) ?? null
}

function createId(prefix: string): string {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${id}`
}
