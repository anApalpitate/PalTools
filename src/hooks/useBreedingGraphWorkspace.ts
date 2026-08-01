import { useEffect, useMemo, useRef, useState } from 'react'
import {
  nextAvailableName,
  type BreedingPlanV1,
  type PalPresetV1,
  type PlanPresetLinkV1,
} from '../domain/breeding-graph'
import type { BreedingIndexPayload, PalRecord } from '../domain/types'
import type { BreedingGraphRepository } from '../storage/breeding-graph-repository'
import type { BreedingGraphStorageState } from './useBreedingGraphStorage'

export interface BreedingGraphWorkspaceState {
  status: 'idle' | 'initializing' | 'ready' | 'error'
  error: string
  presets: PalPresetV1[]
  plans: BreedingPlanV1[]
  links: PlanPresetLinkV1[]
  currentPresetId: string
  currentPlanId: string
  presetDraftPalIds: string[]
  presetDirty: boolean
  presetSaveState: 'saved' | 'saving' | 'error'
  presetSaveError: string
  planSaveState: 'saved' | 'saving' | 'dirty' | 'error'
  planSaveError: string
}

export interface BreedingGraphWorkspaceActions {
  selectPreset(id: string): void
  createPreset(): void
  renamePreset(name: string): void
  deletePreset(id: string): void
  setPresetDraftPalIds(palIds: string[]): void
  togglePresetPal(palId: string): void
  addPresetPalIds(palIds: string[]): void
  clearPresetDraft(): void
  discardPresetChanges(): void
  savePreset(): Promise<boolean>
  selectPlan(id: string): void
  createPlan(): void
  renamePlan(name: string): void
  deletePlan(id: string): void
  savePlan(plan: BreedingPlanV1, links: PlanPresetLinkV1[]): Promise<boolean>
  linkPresetToPlan(presetId: string, planId: string): Promise<boolean>
  unlinkPresetFromPlan(presetId: string, planId: string): Promise<boolean>
}

const INITIAL_STATE: BreedingGraphWorkspaceState = {
  status: 'idle',
  error: '',
  presets: [],
  plans: [],
  links: [],
  currentPresetId: '',
  currentPlanId: '',
  presetDraftPalIds: [],
  presetDirty: false,
  presetSaveState: 'saved',
  presetSaveError: '',
  planSaveState: 'saved',
  planSaveError: '',
}

export function useBreedingGraphWorkspace({
  pals,
  breedingIndex,
  storage,
}: {
  pals: PalRecord[]
  breedingIndex: BreedingIndexPayload | null
  storage: BreedingGraphStorageState
}): { state: BreedingGraphWorkspaceState; actions: BreedingGraphWorkspaceActions } {
  const [state, setState] = useState(INITIAL_STATE)
  const initializedRef = useRef(false)
  const repository = storage.repository

  const validPalIds = useMemo(
    () => new Set(pals.map((pal) => pal.internalId)),
    [pals],
  )

  useEffect(() => {
    if (!repository || storage.status !== 'ready' || pals.length === 0) {
      return
    }
    if (initializedRef.current) return
    initializedRef.current = true
    let active = true
    setState((current) => ({ ...current, status: 'initializing', error: '' }))

    void (async () => {
      try {
        const existingPresets = await repository.listPresets()
        const existingPlans = await repository.listPlans()
        const links = await repository.listLinks()
        const selection = await repository.readWorkspaceSelection()

        const presets = [...existingPresets]
        if (presets.length === 0) {
          const preset: PalPresetV1 = {
            id: createId(),
            schemaVersion: 1,
            name: '默认预设',
            palIds: [],
            createdAt: nowIso(),
            updatedAt: nowIso(),
          }
          await repository.putPreset(preset)
          presets.push(preset)
        }

        const plans = [...existingPlans]
        if (plans.length === 0) {
          const plan = createEmptyPlan(
            nextAvailableName('方案 1', new Set()),
          )
          await repository.putPlan(plan)
          plans.push(plan)
        }

        const currentPreset =
          presets.find((preset) => preset.id === selection.currentPresetId) ??
          presets[0]
        const currentPlan =
          plans.find((plan) => plan.id === selection.currentPlanId) ?? plans[0]
        if (!currentPreset || !currentPlan) throw new Error('配种图工作区初始化失败。')
        await repository.saveWorkspaceSelection({
          currentPresetId: currentPreset.id,
          currentPlanId: currentPlan.id,
        })

        if (!active) return
        setState({
          status: 'ready',
          error: '',
          presets,
          plans,
          links,
          currentPresetId: currentPreset.id,
          currentPlanId: currentPlan.id,
          presetDraftPalIds: currentPreset.palIds.filter((palId: string) =>
            validPalIds.has(palId),
          ),
          presetDirty: false,
          presetSaveState: 'saved',
          presetSaveError: '',
          planSaveState: 'saved',
          planSaveError: '',
        })
      } catch (error: unknown) {
        if (!active) return
        setState((current) => ({
          ...current,
          status: 'error',
          error: error instanceof Error ? error.message : '配种图工作区初始化失败。',
        }))
      }
    })()

    return () => {
      active = false
    }
  }, [pals, storage.repository, storage.status, validPalIds])

  const currentPreset = state.presets.find(
    (preset) => preset.id === state.currentPresetId,
  )
  const currentPlan = state.plans.find((plan) => plan.id === state.currentPlanId)

  function commitPresetSwitch(presetId: string) {
    const preset = state.presets.find((candidate) => candidate.id === presetId)
    if (!preset) return
    setState((current) => ({
      ...current,
      currentPresetId: preset.id,
      presetDraftPalIds: preset.palIds.filter((palId) => validPalIds.has(palId)),
      presetDirty: false,
      presetSaveState: 'saved',
      presetSaveError: '',
    }))
    void repository
      ?.saveWorkspaceSelection({
        currentPresetId: preset.id,
        currentPlanId: state.currentPlanId,
      })
      .catch((error: unknown) => {
        setState((current) => ({
          ...current,
          presetSaveState: 'error',
          presetSaveError: operationError(error, '预设选择保存失败。'),
        }))
      })
  }

  function commitPlanSwitch(planId: string) {
    const plan = state.plans.find((candidate) => candidate.id === planId)
    if (!plan) return
    setState((current) => ({ ...current, currentPlanId: plan.id }))
    void repository
      ?.saveWorkspaceSelection({
        currentPresetId: state.currentPresetId,
        currentPlanId: plan.id,
      })
      .catch((error: unknown) => {
        setState((current) => ({
          ...current,
          planSaveState: 'error',
          planSaveError: operationError(error, '方案选择保存失败。'),
        }))
      })
  }

  async function updateRepositoryLinks(
    nextLinks: PlanPresetLinkV1[],
  ): Promise<boolean> {
    if (!repository) return false
    setState((current) => ({
      ...current,
      planSaveState: 'saving',
      planSaveError: '',
    }))
    try {
      await repository.saveLinks(nextLinks)
      setState((current) => ({
        ...current,
        links: nextLinks,
        planSaveState: 'saved',
        planSaveError: '',
      }))
      return true
    } catch (error: unknown) {
      setState((current) => ({
        ...current,
        planSaveState: 'error',
        planSaveError: operationError(error, '方案关联保存失败。'),
      }))
      return false
    }
  }

  const actions: BreedingGraphWorkspaceActions = {
    selectPreset: commitPresetSwitch,
    createPreset: () => {
      if (!repository) return
      const preset: PalPresetV1 = {
        id: createId(),
        schemaVersion: 1,
        name: nextAvailableName(
          '默认预设',
          new Set(state.presets.map((candidate) => candidate.name)),
        ),
        palIds: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      setState((current) => ({
        ...current,
        presetSaveState: 'saving',
        presetSaveError: '',
      }))
      void (async () => {
        try {
          await repository.putPreset(preset)
          await repository.saveWorkspaceSelection({
            currentPresetId: preset.id,
            currentPlanId: state.currentPlanId,
          })
          setState((current) => ({
            ...current,
            presets: [...current.presets, preset],
            currentPresetId: preset.id,
            presetDraftPalIds: [],
            presetDirty: false,
            presetSaveState: 'saved',
            presetSaveError: '',
          }))
        } catch (error: unknown) {
          setState((current) => ({
            ...current,
            presetSaveState: 'error',
            presetSaveError: operationError(error, '预设创建失败。'),
          }))
        }
      })()
    },
    renamePreset: (rawName) => {
      if (!repository || !currentPreset) return
      const name = rawName.trim()
      if (name.length < 1 || name.length > 30) return
      if (
        state.presets.some(
          (preset) => preset.id !== currentPreset.id && preset.name === name,
        )
      ) {
        return
      }
      const updated = {
        ...currentPreset,
        name,
        updatedAt: nowIso(),
      }
      setState((current) => ({
        ...current,
        presetSaveState: 'saving',
        presetSaveError: '',
      }))
      void repository
        .putPreset(updated)
        .then(() => {
          setState((current) => ({
            ...current,
            presets: current.presets.map((preset) =>
              preset.id === updated.id ? updated : preset,
            ),
            presetSaveState: 'saved',
          }))
        })
        .catch((error: unknown) => {
          setState((current) => ({
            ...current,
            presetSaveState: 'error',
            presetSaveError: operationError(error, '预设重命名失败。'),
          }))
        })
    },
    deletePreset: (id) => {
      if (!repository) return
      setState((current) => ({
        ...current,
        presetSaveState: 'saving',
        presetSaveError: '',
      }))
      void repository.deletePreset(id).then(() => {
        setState((current) => {
          const presets = current.presets.filter((preset) => preset.id !== id)
          const links = current.links.filter((link) => link.presetId !== id)
          let nextPresets = presets
          if (nextPresets.length === 0) {
            const preset: PalPresetV1 = {
              id: createId(),
              schemaVersion: 1,
              name: '默认预设',
              palIds: [],
              createdAt: nowIso(),
              updatedAt: nowIso(),
            }
            nextPresets = [preset]
            void repository.putPreset(preset)
          }
          const nextPresetId =
            current.currentPresetId === id
              ? nextPresets[0].id
              : current.currentPresetId
          const nextPreset = nextPresets.find(
            (preset) => preset.id === nextPresetId,
          )
          void repository.saveWorkspaceSelection({
            currentPresetId: nextPreset?.id ?? nextPresets[0].id,
            currentPlanId: current.currentPlanId,
          })
          return {
            ...current,
            presets: nextPresets,
            links,
            currentPresetId: nextPreset?.id ?? nextPresets[0].id,
            presetDraftPalIds: nextPreset?.palIds ?? [],
            presetDirty: false,
            presetSaveState: 'saved',
          }
        })
      }).catch((error: unknown) => {
        setState((current) => ({
          ...current,
          presetSaveState: 'error',
          presetSaveError: operationError(error, '预设删除失败。'),
        }))
      })
    },
    setPresetDraftPalIds: (palIds) => {
      const unique = [...new Set(palIds)].filter((palId) => validPalIds.has(palId))
      setState((current) => ({
        ...current,
        presetDraftPalIds: unique,
        presetDirty: true,
        presetSaveState: 'saved',
      }))
    },
    togglePresetPal: (palId) => {
      setState((current) => {
        const hasPal = current.presetDraftPalIds.includes(palId)
        return {
          ...current,
          presetDraftPalIds: hasPal
            ? current.presetDraftPalIds.filter((id) => id !== palId)
            : [...current.presetDraftPalIds, palId],
          presetDirty: true,
          presetSaveState: 'saved',
        }
      })
    },
    addPresetPalIds: (palIds) => {
      setState((current) => ({
        ...current,
        presetDraftPalIds: [
          ...new Set([
            ...current.presetDraftPalIds,
            ...palIds.filter((palId) => validPalIds.has(palId)),
          ]),
        ],
        presetDirty: true,
        presetSaveState: 'saved',
      }))
    },
    clearPresetDraft: () => {
      setState((current) => ({
        ...current,
        presetDraftPalIds: [],
        presetDirty: true,
        presetSaveState: 'saved',
      }))
    },
    discardPresetChanges: () => {
      if (!currentPreset) return
      setState((current) => ({
        ...current,
        presetDraftPalIds: currentPreset.palIds.filter((palId) =>
          validPalIds.has(palId),
        ),
        presetDirty: false,
        presetSaveState: 'saved',
        presetSaveError: '',
      }))
    },
    savePreset: () => {
      if (!repository || !currentPreset) return Promise.resolve(false)
      const updated: PalPresetV1 = {
        ...currentPreset,
        palIds: state.presetDraftPalIds,
        updatedAt: nowIso(),
      }
      setState((current) => ({
        ...current,
        presetSaveState: 'saving',
        presetSaveError: '',
      }))
      return repository
        .putPreset(updated)
        .then(() => {
          setState((current) => ({
            ...current,
            presets: current.presets.map((preset) =>
              preset.id === updated.id ? updated : preset,
            ),
            presetDirty: false,
            presetSaveState: 'saved',
            presetSaveError: '',
          }))
          return true
        })
        .catch((error: unknown) => {
          setState((current) => ({
            ...current,
            presetSaveState: 'error',
            presetSaveError: operationError(error, '预设保存失败。'),
          }))
          return false
        })
    },
    selectPlan: commitPlanSwitch,
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
            currentPresetId: state.currentPresetId,
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
    renamePlan: (rawName) => {
      if (!repository || !currentPlan) return
      const name = rawName.trim()
      if (name.length < 1 || name.length > 40) return
      if (
        state.plans.some(
          (plan) => plan.id !== currentPlan.id && plan.name === name,
        )
      ) {
        return
      }
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
      void repository.deletePlan(id).then(() => {
        setState((current) => {
          const plans = current.plans.filter((plan) => plan.id !== id)
          const links = current.links.filter((link) => link.planId !== id)
          let nextPlans = plans
          if (nextPlans.length === 0) {
            const plan = createEmptyPlan('方案 1')
            nextPlans = [plan]
            void repository.putPlan(plan)
          }
          const nextPlanId =
            current.currentPlanId === id
              ? nextPlans[0].id
              : current.currentPlanId
          const nextPlan = nextPlans.find((plan) => plan.id === nextPlanId)
          void repository.saveWorkspaceSelection({
            currentPresetId: current.currentPresetId,
            currentPlanId: nextPlan?.id ?? nextPlans[0].id,
          })
          return {
            ...current,
            plans: nextPlans,
            links,
            currentPlanId: nextPlan?.id ?? nextPlans[0].id,
            planSaveState: 'saved',
          }
        })
      }).catch((error: unknown) => {
        setState((current) => ({
          ...current,
          planSaveState: 'error',
          planSaveError: operationError(error, '方案删除失败。'),
        }))
      })
    },
    savePlan: async (plan, planLinks) => {
      if (!repository) return false
      setState((current) => ({
        ...current,
        planSaveState: 'saving',
        planSaveError: '',
      }))
      try {
        await repository.savePlanBundle(plan, planLinks)
        setState((current) => ({
          ...current,
          plans: current.plans.map((candidate) =>
            candidate.id === plan.id ? plan : candidate,
          ),
          links: [
            ...current.links.filter((link) => link.planId !== plan.id),
            ...planLinks,
          ],
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
    linkPresetToPlan: (presetId, planId) => {
      if (
        state.links.some(
          (link) => link.planId === planId && link.presetId === presetId,
        )
      ) {
        return Promise.resolve(true)
      }
      const link: PlanPresetLinkV1 = {
        planId,
        presetId,
        lastUsedAt: nowIso(),
      }
      return updateRepositoryLinks([...state.links, link])
    },
    unlinkPresetFromPlan: (presetId, planId) => {
      return updateRepositoryLinks(
        state.links.filter(
          (link) => !(link.planId === planId && link.presetId === presetId),
        ),
      )
    },
  }

  return { state, actions }
}

function createId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function operationError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function nowIso(): string {
  return new Date().toISOString()
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
