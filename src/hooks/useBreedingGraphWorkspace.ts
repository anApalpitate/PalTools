import { useEffect, useRef, useState } from 'react'
import {
  nextAvailableName,
  type BreedingPlanV1,
} from '../domain/breeding-graph'
import type { BreedingGraphStorageState } from './useBreedingGraphStorage'

export interface BreedingGraphWorkspaceState {
  status: 'idle' | 'initializing' | 'ready' | 'error'
  error: string
  plans: BreedingPlanV1[]
  currentPlanId: string
  planSaveState: 'saved' | 'saving' | 'dirty' | 'error'
  planSaveError: string
}

export interface BreedingGraphWorkspaceActions {
  selectPlan(id: string): void
  createPlan(): void
  renamePlan(name: string): void
  deletePlan(id: string): void
  importPlan(plan: BreedingPlanV1): Promise<boolean>
  savePlan(plan: BreedingPlanV1): Promise<boolean>
}

const INITIAL_STATE: BreedingGraphWorkspaceState = {
  status: 'idle',
  error: '',
  plans: [],
  currentPlanId: '',
  planSaveState: 'saved',
  planSaveError: '',
}

export function useBreedingGraphWorkspace({
  storage,
}: {
  storage: BreedingGraphStorageState
}): { state: BreedingGraphWorkspaceState; actions: BreedingGraphWorkspaceActions } {
  const [state, setState] = useState(INITIAL_STATE)
  const initializedRef = useRef(false)
  const repository = storage.repository

  useEffect(() => {
    if (!repository || storage.status !== 'ready' || initializedRef.current) {
      return
    }
    initializedRef.current = true
    let active = true
    setState((current) => ({ ...current, status: 'initializing', error: '' }))

    void (async () => {
      try {
        const plans = await repository.listPlans()
        const selection = await repository.readWorkspaceSelection()
        if (plans.length === 0) {
          const plan = createEmptyPlan('方案 1')
          await repository.putPlan(plan)
          plans.push(plan)
        }
        const currentPlan =
          plans.find((plan) => plan.id === selection.currentPlanId) ?? plans[0]
        if (!currentPlan) throw new Error('配种图工作区初始化失败。')
        await repository.saveWorkspaceSelection({
          currentPresetId: null,
          currentPlanId: currentPlan.id,
        })
        if (!active) return
        setState({
          status: 'ready',
          error: '',
          plans,
          currentPlanId: currentPlan.id,
          planSaveState: 'saved',
          planSaveError: '',
        })
      } catch (error: unknown) {
        if (!active) return
        setState((current) => ({
          ...current,
          status: 'error',
          error: operationError(error, '配种图工作区初始化失败。'),
        }))
      }
    })()

    return () => {
      active = false
    }
  }, [repository, storage.status])

  function selectPlan(id: string) {
    if (!repository || !state.plans.some((plan) => plan.id === id)) return
    setState((current) => ({
      ...current,
      currentPlanId: id,
      planSaveState: 'saved',
      planSaveError: '',
    }))
    void repository
      .saveWorkspaceSelection({ currentPresetId: null, currentPlanId: id })
      .catch((error: unknown) => {
        setState((current) => ({
          ...current,
          planSaveState: 'error',
          planSaveError: operationError(error, '方案选择保存失败。'),
        }))
      })
  }

  const actions: BreedingGraphWorkspaceActions = {
    selectPlan,
    createPlan: () => {
      if (!repository) return
      const plan = createEmptyPlan(
        nextAvailableName(
          '方案 1',
          new Set(state.plans.map((candidate) => candidate.name)),
        ),
      )
      setState((current) => ({
        ...current,
        planSaveState: 'saving',
        planSaveError: '',
      }))
      void (async () => {
        try {
          await repository.putPlan(plan)
          await repository.saveWorkspaceSelection({
            currentPresetId: null,
            currentPlanId: plan.id,
          })
          setState((current) => ({
            ...current,
            plans: [...current.plans, plan],
            currentPlanId: plan.id,
            planSaveState: 'saved',
            planSaveError: '',
          }))
        } catch (error: unknown) {
          setState((current) => ({
            ...current,
            planSaveState: 'error',
            planSaveError: operationError(error, '方案创建失败。'),
          }))
        }
      })()
    },
    renamePlan: (name) => {
      if (!repository) return
      const currentPlan = state.plans.find(
        (plan) => plan.id === state.currentPlanId,
      )
      if (!currentPlan) return
      const updated = { ...currentPlan, name, updatedAt: nowIso() }
      setState((current) => ({
        ...current,
        planSaveState: 'saving',
        planSaveError: '',
      }))
      void repository
        .putPlan(updated)
        .then(() => {
          setState((current) => ({
            ...current,
            plans: current.plans.map((plan) =>
              plan.id === updated.id ? updated : plan,
            ),
            planSaveState: 'saved',
            planSaveError: '',
          }))
        })
        .catch((error: unknown) => {
          setState((current) => ({
            ...current,
            planSaveState: 'error',
            planSaveError: operationError(error, '方案重命名失败。'),
          }))
        })
    },
    deletePlan: (id) => {
      if (!repository) return
      setState((current) => ({
        ...current,
        planSaveState: 'saving',
        planSaveError: '',
      }))
      void repository
        .deletePlan(id)
        .then(async () => {
          const remaining = state.plans.filter((plan) => plan.id !== id)
          const nextCurrent =
            id === state.currentPlanId
              ? (remaining[0]?.id ?? '')
              : state.currentPlanId
          await repository.saveWorkspaceSelection({
            currentPresetId: null,
            currentPlanId: nextCurrent || null,
          })
          setState((current) => ({
            ...current,
            plans: remaining,
            currentPlanId: nextCurrent,
            planSaveState: 'saved',
            planSaveError: '',
          }))
        })
        .catch((error: unknown) => {
          setState((current) => ({
            ...current,
            planSaveState: 'error',
            planSaveError: operationError(error, '方案删除失败。'),
          }))
        })
    },
    importPlan: async (plan) => {
      if (!repository) return false
      setState((current) => ({
        ...current,
        planSaveState: 'saving',
        planSaveError: '',
      }))
      try {
        await repository.importPlan(plan, {
          currentPresetId: null,
          currentPlanId: plan.id,
        })
        setState((current) => ({
          ...current,
          plans: [...current.plans, plan],
          currentPlanId: plan.id,
          planSaveState: 'saved',
          planSaveError: '',
        }))
        return true
      } catch (error: unknown) {
        setState((current) => ({
          ...current,
          planSaveState: 'error',
          planSaveError: operationError(error, '方案导入失败。'),
        }))
        return false
      }
    },
    savePlan: async (plan) => {
      if (!repository) return false
      setState((current) => ({
        ...current,
        planSaveState: 'saving',
        planSaveError: '',
      }))
      try {
        await repository.putPlan(plan)
        setState((current) => ({
          ...current,
          plans: current.plans.map((candidate) =>
            candidate.id === plan.id ? plan : candidate,
          ),
          planSaveState: 'saved',
          planSaveError: '',
        }))
        return true
      } catch (error: unknown) {
        setState((current) => ({
          ...current,
          planSaveState: 'error',
          planSaveError: operationError(error, '方案保存失败。'),
        }))
        return false
      }
    },
  }

  return { state, actions }
}

function createEmptyPlan(name: string): BreedingPlanV1 {
  const timestamp = nowIso()
  return {
    id: createId(),
    schemaVersion: 1,
    name,
    nodes: [],
    relations: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function createId(): string {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `plan-${id}`
}

function nowIso(): string {
  return new Date().toISOString()
}

function operationError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
