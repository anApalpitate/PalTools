import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_PLAN_ID,
  MAX_CUSTOM_PLANS,
  createEmptyWorkspace,
  detectRecipeCycle,
  nextPlanName,
  resolveWorkspaceRelations,
  snapshotRecipe,
  validatePlanName,
} from '../../domain/breeding-workspace'
import type {
  BreedingWorkspace,
  PlanRecord,
  WorkspaceNodeMode,
  WorkspaceView,
} from '../../domain/breeding-workspace'
import type { BreedingIndexPayload, BreedingRecipeMatch } from '../../domain/types'
import { BreedingWorkspaceRepository } from '../../storage/breeding-workspace'

interface WorkspaceLifecycle {
  repository: BreedingWorkspaceRepository | null
  active: boolean
}

export function useBreedingWorkspace(
  breedingIndex: BreedingIndexPayload | null,
  datasetVersion: string,
) {
  const lifecycleRef = useRef<WorkspaceLifecycle | null>(null)
  const workspaceRef = useRef<BreedingWorkspace | null>(null)
  const queueRef = useRef(Promise.resolve())
  const [workspace, setWorkspace] = useState<BreedingWorkspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!breedingIndex || !datasetVersion) return
    setLoading(true)
    setBusy(false)
    setError('')
    workspaceRef.current = null
    setWorkspace(null)
    if (typeof indexedDB === 'undefined') {
      setError('当前环境不支持 IndexedDB，配方背包和方案写入已禁用。')
      setLoading(false)
      return
    }
    const lifecycle: WorkspaceLifecycle = { repository: null, active: true }
    lifecycleRef.current = lifecycle
    queueRef.current = queueRef.current.then(async () => {
      if (!lifecycle.active) return
      try {
        const repository = new BreedingWorkspaceRepository()
        lifecycle.repository = repository
        const loaded = await repository.load(datasetVersion)
        if (!lifecycle.active) return
        workspaceRef.current = loaded
        setWorkspace(loaded)
        setLoading(false)
      } catch (caught: unknown) {
        if (!lifecycle.active) return
        setError(caught instanceof Error ? caught.message : '工作区载入失败。')
        setLoading(false)
      }
    })
    return () => {
      lifecycle.active = false
      if (lifecycleRef.current === lifecycle) lifecycleRef.current = null
      void queueRef.current.then(() => lifecycle.repository?.close())
    }
  }, [breedingIndex, datasetVersion, retryKey])

  const resolvedRelations = useMemo(
    () => workspace && breedingIndex
      ? resolveWorkspaceRelations(workspace, breedingIndex)
      : [],
    [workspace, breedingIndex],
  )

  const enqueueWrite = useCallback((
    producer: (current: BreedingWorkspace | null) => BreedingWorkspace | null,
    replace = false,
  ): Promise<boolean> => {
    const lifecycle = lifecycleRef.current
    if (!lifecycle?.active) return Promise.resolve(false)
    let result = false
    queueRef.current = queueRef.current.then(async () => {
      if (!lifecycle.active || !lifecycle.repository) return
      const current = workspaceRef.current
      let timer: number | undefined
      try {
        const next = producer(current)
        if (!next) return
        if (!replace && next === current) { result = true; return }
        timer = window.setTimeout(() => { if (lifecycle.active) setBusy(true) }, 300)
        if (replace) await lifecycle.repository.replace(next)
        else if (current) await lifecycle.repository.commit(current, next)
        if (!lifecycle.active) return
        workspaceRef.current = next
        setWorkspace(next)
        setError('')
        result = true
      } catch (caught) {
        if (lifecycle.active) setError(caught instanceof Error ? caught.message : '工作区保存失败。')
      } finally {
        window.clearTimeout(timer)
        if (lifecycle.active) setBusy(false)
      }
    })
    return queueRef.current.then(() => result)
  }, [])

  const mutate = useCallback((producer: (current: BreedingWorkspace) => BreedingWorkspace) =>
    enqueueWrite((current) => current ? producer(current) : null), [enqueueWrite])

  const addToBag = useCallback((recipe: BreedingRecipeMatch) => mutate((current) => {
    const existing = current.relations.find((item) => item.recipeIndex === recipe.recipeIndex)
    if (existing?.inBag) return current
    const relation = snapshotRecipe(recipe, datasetVersion)
    return {
      ...current,
      datasetVersion,
      relations: existing
        ? current.relations.map((item) => item.recipeIndex === recipe.recipeIndex ? relation : item)
        : [...current.relations, relation].sort((a, b) => a.recipeIndex - b.recipeIndex),
    }
  }), [datasetVersion, mutate])

  const removeFromBag = useCallback((recipeIndexes: number[]) => mutate((current) => {
    const removing = new Set(recipeIndexes)
    const planReferences = new Set(Object.values(current.planRelations).flat())
    const relations = current.relations
      .map((relation) => removing.has(relation.recipeIndex) ? { ...relation, inBag: false } : relation)
      .filter((relation) => relation.inBag || planReferences.has(relation.recipeIndex))
    return { ...current, datasetVersion, relations }
  }), [datasetVersion, mutate])

  const addToCurrentPlan = useCallback((recipeIndexes: number[]) => mutate((current) => {
    const existing = new Set(current.planRelations[current.currentPlanId] ?? [])
    const candidates = recipeIndexes.filter((index) => !existing.has(index))
    if (!candidates.length) return current
    const relationMap = new Map(current.relations.map((relation) => [relation.recipeIndex, relation]))
    for (const index of candidates) {
      const relation = relationMap.get(index)
      if (!relation?.inBag) throw new Error(`配方 #${index} 不在配方背包中。`)
      if (breedingIndex) {
        const resolved = resolveWorkspaceRelations({ ...current, relations: [relation] }, breedingIndex)[0]
        if (!resolved || resolved.status === 'invalid') throw new Error(`配方 #${index} 已失效，不能加入方案。`)
      }
    }
    const prospective = [...existing, ...candidates].map((index) => {
      const relation = relationMap.get(index)
      if (!relation) throw new Error(`配方 #${index} 不存在。`)
      return relation
    })
    const cycle = detectRecipeCycle(prospective)
    if (cycle) throw new Error(`加入后会形成循环：配方 #${cycle.recipeIndexes.join('、#')}。`)
    const now = new Date().toISOString()
    return {
      ...current,
      datasetVersion,
      planRelations: {
        ...current.planRelations,
        [current.currentPlanId]: [...existing, ...candidates].sort((a, b) => a - b),
      },
      plans: current.plans.map((plan) => plan.id === current.currentPlanId ? { ...plan, updatedAt: now } : plan),
    }
  }), [breedingIndex, datasetVersion, mutate])

  const removeFromPlan = useCallback((recipeIndexes?: number[]) => mutate((current) => {
    const removing = new Set(recipeIndexes ?? current.planRelations[current.currentPlanId] ?? [])
    const nextPlanRelations = (current.planRelations[current.currentPlanId] ?? []).filter((index) => !removing.has(index))
    const allReferences = new Set(Object.entries(current.planRelations).flatMap(([planId, indexes]) =>
      (planId === current.currentPlanId ? nextPlanRelations : indexes),
    ))
    const now = new Date().toISOString()
    return {
      ...current,
      datasetVersion,
      relations: current.relations.filter((relation) => relation.inBag || allReferences.has(relation.recipeIndex)),
      planRelations: { ...current.planRelations, [current.currentPlanId]: nextPlanRelations },
      plans: current.plans.map((plan) => plan.id === current.currentPlanId ? { ...plan, updatedAt: now } : plan),
    }
  }), [datasetVersion, mutate])

  const createPlan = useCallback(() => mutate((current) => {
    if (current.plans.filter((plan) => plan.kind === 'custom').length >= MAX_CUSTOM_PLANS) {
      throw new Error('最多只能创建 20 个自定义方案。')
    }
    const now = new Date().toISOString()
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `plan-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const plan: PlanRecord = { id, kind: 'custom', name: nextPlanName(current.plans), createdAt: now, updatedAt: now }
    return {
      ...current,
      plans: [...current.plans, plan],
      planRelations: { ...current.planRelations, [id]: [] },
      currentPlanId: id,
    }
  }), [mutate])

  const switchPlan = useCallback((planId: string) => mutate((current) =>
    current.plans.some((plan) => plan.id === planId)
      ? { ...current, currentPlanId: planId }
      : current,
  ), [mutate])

  const renamePlan = useCallback((name: string) => mutate((current) => {
    const normalized = validatePlanName(name)
    const plan = current.plans.find((item) => item.id === current.currentPlanId)
    if (!plan || plan.kind === 'default') throw new Error('默认方案不能重命名。')
    if (!normalized) throw new Error('方案名称必须为 1–40 个可见字符。')
    return {
      ...current,
      plans: current.plans.map((item) => item.id === plan.id
        ? { ...item, name: normalized, updatedAt: new Date().toISOString() }
        : item),
    }
  }), [mutate])

  const clearPlan = useCallback(() => removeFromPlan(), [removeFromPlan])

  const deletePlan = useCallback(() => mutate((current) => {
    const plan = current.plans.find((item) => item.id === current.currentPlanId)
    if (!plan || plan.kind === 'default') throw new Error('默认方案不能删除。')
    const planRelations = { ...current.planRelations }
    delete planRelations[plan.id]
    const remainingReferences = new Set(Object.values(planRelations).flat())
    return {
      ...current,
      currentPlanId: DEFAULT_PLAN_ID,
      plans: current.plans.filter((item) => item.id !== plan.id),
      planRelations,
      relations: current.relations.filter((relation) => relation.inBag || remainingReferences.has(relation.recipeIndex)),
    }
  }), [mutate])

  const setPreferences = useCallback((preferences: Partial<{ lastView: WorkspaceView; nodeMode: WorkspaceNodeMode }>) => mutate((current) => ({
    ...current,
    preferences: { ...current.preferences, ...preferences },
  })), [mutate])

  const replaceWorkspace = useCallback((next: BreedingWorkspace) => enqueueWrite(() => next, true), [enqueueWrite])

  const resetWorkspace = useCallback(() => replaceWorkspace(createEmptyWorkspace(datasetVersion)), [datasetVersion, replaceWorkspace])

  const retryWorkspace = useCallback(() => {
    if (lifecycleRef.current) lifecycleRef.current.active = false
    setLoading(true)
    setBusy(false)
    setRetryKey((value) => value + 1)
  }, [])

  return {
    workspace,
    resolvedRelations,
    loading,
    busy,
    error,
    clearError: () => setError(''),
    addToBag,
    removeFromBag,
    addToCurrentPlan,
    removeFromPlan,
    createPlan,
    switchPlan,
    renamePlan,
    clearPlan,
    deletePlan,
    setPreferences,
    replaceWorkspace,
    resetWorkspace,
    retryWorkspace,
  }
}
