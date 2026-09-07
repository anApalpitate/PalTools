// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyWorkspace, snapshotRecipe } from '../../domain/breeding-workspace'
import type { BreedingWorkspace } from '../../domain/breeding-workspace'
import type { BreedingIndexPayload } from '../../domain/types'
import { BREEDING_WORKSPACE_DB_NAME, BreedingWorkspaceRepository } from '../../storage/breeding-workspace'
import { useBreedingWorkspace } from './useBreedingWorkspace'

const index: BreedingIndexPayload = {
  schemaVersion: 4,
  palIds: ['A', 'B', 'C'],
  recipes: [[0, 1, 2]],
  recipesByPair: { '0|1': [0] },
  parentsByChild: { '2': [0] },
}
const recipe = { recipeIndex: 0, parentAId: 'A', parentBId: 'B', childId: 'C' }
const originalCommit = BreedingWorkspaceRepository.prototype.commit
const originalReplace = BreedingWorkspaceRepository.prototype.replace
const originalLoad = BreedingWorkspaceRepository.prototype.load

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  await save(createEmptyWorkspace('v1', '2026-01-01T00:00:00.000Z'))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useBreedingWorkspace ordered writes', () => {
  it('waits for a delayed commit before import and publishes the same state as IndexedDB', async () => {
    const hook = await ready()
    const gate = deferred()
    const commit = vi.spyOn(BreedingWorkspaceRepository.prototype, 'commit').mockImplementationOnce(async function (this: BreedingWorkspaceRepository, previous, next) {
      await gate.promise
      await originalCommit.call(this, previous, next)
    })
    const replace = vi.spyOn(BreedingWorkspaceRepository.prototype, 'replace')
    const imported = createEmptyWorkspace('imported')
    imported.preferences.lastView = 'relations'
    let added!: Promise<boolean>
    let replaced!: Promise<boolean>
    act(() => {
      added = hook.result.current.addToBag(recipe)
      replaced = hook.result.current.replaceWorkspace(imported)
    })
    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    expect(replace).not.toHaveBeenCalled()
    await act(async () => {
      gate.resolve()
      expect(await Promise.all([added, replaced])).toEqual([true, true])
    })
    expect(hook.result.current.workspace).toEqual(imported)
    expect(await persisted()).toEqual(hook.result.current.workspace)
  })

  it('serializes import, ordinary edits and reset in their requested order', async () => {
    const hook = await ready()
    const gate = deferred()
    const replace = vi.spyOn(BreedingWorkspaceRepository.prototype, 'replace').mockImplementationOnce(async function (this: BreedingWorkspaceRepository, next) {
      await gate.promise
      await originalReplace.call(this, next)
    })
    const commit = vi.spyOn(BreedingWorkspaceRepository.prototype, 'commit')
    let pending!: Promise<boolean>[]
    act(() => {
      pending = [hook.result.current.replaceWorkspace(createEmptyWorkspace('imported')), hook.result.current.addToBag(recipe), hook.result.current.resetWorkspace()]
    })
    await waitFor(() => expect(replace).toHaveBeenCalled())
    expect(replace).toHaveBeenCalledOnce()
    expect(commit).not.toHaveBeenCalled()
    await act(async () => {
      gate.resolve()
      expect(await Promise.all(pending)).toEqual([true, true, true])
    })
    expect(hook.result.current.workspace?.relations).toEqual([])
    expect(hook.result.current.workspace?.datasetVersion).toBe('v1')
    expect(await persisted()).toEqual(hook.result.current.workspace)
  })

  it('retry waits for in-flight commit, cancels old queued writes and reloads the persisted result', async () => {
    const hook = await ready()
    const gate = deferred()
    const commit = vi.spyOn(BreedingWorkspaceRepository.prototype, 'commit').mockImplementationOnce(async function (this: BreedingWorkspaceRepository, previous, next) {
      await gate.promise
      await originalCommit.call(this, previous, next)
    })
    const load = vi.spyOn(BreedingWorkspaceRepository.prototype, 'load')
    const replace = vi.spyOn(BreedingWorkspaceRepository.prototype, 'replace')
    const close = vi.spyOn(BreedingWorkspaceRepository.prototype, 'close')
    let pending!: Promise<boolean>[]
    act(() => {
      pending = [hook.result.current.addToBag(recipe), hook.result.current.resetWorkspace()]
    })
    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    act(() => hook.result.current.retryWorkspace())
    expect(hook.result.current.loading).toBe(true)
    expect(close).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
    await act(async () => {
      gate.resolve()
      expect(await Promise.all(pending)).toEqual([false, false])
    })
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    expect(load).toHaveBeenCalledOnce()
    expect(replace).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
    expect(hook.result.current.workspace?.relations).toMatchObject([{ recipeIndex: 0 }])
    expect(await persisted()).toEqual(hook.result.current.workspace)
  })

  it('unmount lets an in-flight transaction finish before close and cancels queued work', async () => {
    const hook = await ready()
    const gate = deferred()
    const commit = vi.spyOn(BreedingWorkspaceRepository.prototype, 'commit').mockImplementationOnce(async function (this: BreedingWorkspaceRepository, previous, next) {
      await gate.promise
      await originalCommit.call(this, previous, next)
    })
    const replace = vi.spyOn(BreedingWorkspaceRepository.prototype, 'replace')
    const close = vi.spyOn(BreedingWorkspaceRepository.prototype, 'close')
    let pending!: Promise<boolean>[]
    act(() => {
      pending = [hook.result.current.addToBag(recipe), hook.result.current.resetWorkspace()]
    })
    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    const lastRendered = hook.result.current
    hook.unmount()
    expect(close).not.toHaveBeenCalled()
    gate.resolve()
    expect(await Promise.all(pending)).toEqual([false, false])
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(replace).not.toHaveBeenCalled()
    expect(hook.result.current).toBe(lastRendered)
    expect((await persisted()).relations).toMatchObject([{ recipeIndex: 0 }])
  })

  it('invalidates queued work synchronously when retry is requested in the same event', async () => {
    const hook = await ready()
    const commit = vi.spyOn(BreedingWorkspaceRepository.prototype, 'commit')
    let queued!: Promise<boolean>
    act(() => {
      queued = hook.result.current.addToBag(recipe)
      hook.result.current.retryWorkspace()
    })
    await act(async () => expect(await queued).toBe(false))
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    expect(commit).not.toHaveBeenCalled()
    expect(hook.result.current.workspace?.relations).toEqual([])
    await act(async () => expect(await hook.result.current.addToBag(recipe)).toBe(true))
    expect(await persisted()).toEqual(hook.result.current.workspace)
  })

  it('opens the retry repository after pending commits and handles an open failure immediately', async () => {
    const hook = await ready()
    const gate = deferred()
    const commit = vi.spyOn(BreedingWorkspaceRepository.prototype, 'commit').mockImplementationOnce(async function (this: BreedingWorkspaceRepository, previous, next) {
      await gate.promise
      await originalCommit.call(this, previous, next)
    })
    const open = vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      const request = { error: new DOMException('Access denied', 'UnknownError') } as IDBOpenDBRequest
      queueMicrotask(() => request.onerror?.call(request, new Event('error')))
      return request
    })
    let pending!: Promise<boolean>
    act(() => { pending = hook.result.current.addToBag(recipe) })
    await waitFor(() => expect(commit).toHaveBeenCalledOnce())
    act(() => hook.result.current.retryWorkspace())
    expect(open).not.toHaveBeenCalled()
    await act(async () => {
      gate.resolve()
      expect(await pending).toBe(false)
    })
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    expect(open).toHaveBeenCalledOnce()
    expect(hook.result.current.error).toContain('无法打开本机配种工作区')
    expect(hook.result.current.workspace).toBeNull()
  })

  it('does not publish a delayed stale load after retry and waits before closing its repository', async () => {
    const gate = deferred()
    const read = deferred()
    const load = vi.spyOn(BreedingWorkspaceRepository.prototype, 'load').mockImplementationOnce(async function (this: BreedingWorkspaceRepository, version) {
      const snapshot = await originalLoad.call(this, version)
      read.resolve()
      await gate.promise
      return snapshot
    })
    const close = vi.spyOn(BreedingWorkspaceRepository.prototype, 'close')
    const hook = renderHook(() => useBreedingWorkspace(index, 'v1'))
    await read.promise
    act(() => hook.result.current.retryWorkspace())
    expect(close).not.toHaveBeenCalled()
    expect(load).toHaveBeenCalledOnce()
    const fresh = createEmptyWorkspace('restored')
    fresh.preferences.lastView = 'relations'
    await save(fresh)
    await act(async () => gate.resolve())
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    expect(load).toHaveBeenCalledTimes(2)
    expect(hook.result.current.workspace).toEqual(fresh)
  })

  it('keeps the queue usable after a failed commit or replacement', async () => {
    const hook = await ready()
    vi.spyOn(BreedingWorkspaceRepository.prototype, 'commit').mockRejectedValueOnce(new Error('write failed'))
    vi.spyOn(BreedingWorkspaceRepository.prototype, 'replace').mockRejectedValueOnce(new Error('replace failed'))
    let pending!: Promise<boolean>[]
    act(() => {
      pending = [hook.result.current.addToBag(recipe), hook.result.current.resetWorkspace(), hook.result.current.createPlan()]
    })
    await act(async () => expect(await Promise.all(pending)).toEqual([false, false, true]))
    expect(hook.result.current.workspace?.plans).toHaveLength(2)
    expect(hook.result.current.workspace?.relations).toHaveLength(0)
    expect(hook.result.current.error).toBe('')
    expect(await persisted()).toEqual(hook.result.current.workspace)
  })

  it.each(['import', 'reset'])('allows %s to recover a corrupt load with no current workspace', async (action) => {
    await corruptMetadata()
    const hook = await ready()
    expect(hook.result.current.workspace).toBeNull()
    expect(hook.result.current.error).toContain('已损坏')
    const restored = createEmptyWorkspace('backup')
    await act(async () => {
      expect(await (action === 'import' ? hook.result.current.replaceWorkspace(restored) : hook.result.current.resetWorkspace())).toBe(true)
    })
    expect(hook.result.current.workspace?.datasetVersion).toBe(action === 'import' ? 'backup' : 'v1')
    expect(hook.result.current.error).toBe('')
    expect(await persisted()).toEqual(hook.result.current.workspace)
  })

  it('evaluates clear-plan contents when its queued action executes', async () => {
    const initial = createEmptyWorkspace('v1')
    initial.relations = [snapshotRecipe(recipe, 'v1')]
    await save(initial)
    const hook = await ready()
    let pending!: Promise<boolean>[]
    act(() => {
      pending = [hook.result.current.addToCurrentPlan([0]), hook.result.current.clearPlan()]
    })
    await act(async () => expect(await Promise.all(pending)).toEqual([true, true]))
    expect(hook.result.current.workspace?.planRelations.default).toEqual([])
    expect(await persisted()).toEqual(hook.result.current.workspace)
  })

  it('loads and writes after StrictMode effect cleanup without reusing a closed repository', async () => {
    const hook = renderHook(() => useBreedingWorkspace(index, 'v1'), { wrapper: StrictMode })
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    expect(hook.result.current.error).toBe('')
    await act(async () => expect(await hook.result.current.addToBag(recipe)).toBe(true))
    expect(await persisted()).toEqual(hook.result.current.workspace)
  })
})

async function ready() {
  const hook = renderHook(() => useBreedingWorkspace(index, 'v1'))
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  return hook
}

async function save(workspace: BreedingWorkspace) {
  const repository = new BreedingWorkspaceRepository()
  try {
    await originalReplace.call(repository, workspace)
  } finally {
    repository.close()
  }
}

async function persisted() {
  const repository = new BreedingWorkspaceRepository()
  try {
    return await originalLoad.call(repository, 'v1')
  } finally {
    repository.close()
  }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

async function corruptMetadata() {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(BREEDING_WORKSPACE_DB_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const transaction = database.transaction('metadata', 'readwrite')
  transaction.objectStore('metadata').put({ id: 'workspace', schemaVersion: 999 })
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}
