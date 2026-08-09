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

export function useBreedingWorkspace(
  breedingIndex: BreedingIndexPayload | null,
  datasetVersion: string,
) {
  const repositoryRef = useRef<BreedingWorkspaceRepository | null>(null)
  const workspaceRef = useRef<BreedingWorkspace | null>(null)
  const queueRef = useRef(Promise.resolve())
  const [workspace, setWorkspace] = useState<BreedingWorkspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!breedingIndex || !datasetVersion) return
    let cancelled = false
    setLoading(true)
    setError('')
    if (typeof indexedDB === 'undefined') {
      setError('当前环境不支持 IndexedDB，关系背包和方案写入已禁用。')
      setLoading(false)
      return
    }
    const repository = new BreedingWorkspaceRepository()
    repositoryRef.current = repository
    repository.load(datasetVersion)
      .then((loaded) => {
        if (cancelled) return
        workspaceRef.current = loaded
        setWorkspace(loaded)
        setLoading(false)
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setError(caught instanceof Error ? caught.message : '工作区载入失败。')
        setLoading(false)
      })
    return () => {
      cancelled = true
      repository.close()
      repositoryRef.current = null
    }
  }, [breedingIndex, datasetVersion, retryKey])

  const resolvedRelations = useMemo(
    () => workspace && breedingIndex
      ? resolveWorkspaceRelations(workspace, breedingIndex)
      : [],
    [workspace, breedingIndex],
  )

  const mutate = useCallback((
    producer: (current: BreedingWorkspace) => BreedingWorkspace,
  ): Promise<boolean> => {
    let result = false
    queueRef.current = queueRef.current.then(async () => {
      const current = workspaceRef.current
      const repository = repositoryRef.current
      if (!current || !repository) return
      let next: BreedingWorkspace
      try {
        next = producer(current)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '操作失败。')
        return
      }
      if (next === current) { result = true; return }
      const timer = window.setTimeout(() => setBusy(true), 300)
      try {
        await repository.commit(current, next)
        workspaceRef.current = next
        setWorkspace(next)
        setError('')
        result = true
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '工作区保存失败。')
      } finally {
        window.clearTimeout(timer)
        setBusy(false)
      }
    })
    return queueRef.current.then(() => result)
  }, [])

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
      if (!relation?.inBag) throw new Error(`配方 #${index} 不在关系背包中。`)
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

  const removeFromPlan = useCallback((recipeIndexes: number[]) => mutate((current) => {
    const removing = new Set(recipeIndexes)
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

  const clearPlan = useCallback(() => {
    const indexes = workspaceRef.current?.planRelations[workspaceRef.current.currentPlanId] ?? []
    return removeFromPlan(indexes)
  }, [removeFromPlan])

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

  const replaceWorkspace = useCallback(async (next: BreedingWorkspace) => {
    const repository = repositoryRef.current
    if (!repository) return false
    try {
      await repository.replace(next)
      workspaceRef.current = next
      setWorkspace(next)
      setError('')
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '工作区替换失败。')
      return false
    }
  }, [])

  const resetWorkspace = useCallback(() => replaceWorkspace(createEmptyWorkspace(datasetVersion)), [datasetVersion, replaceWorkspace])

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
    retryWorkspace: () => setRetryKey((value) => value + 1),
  }
}
