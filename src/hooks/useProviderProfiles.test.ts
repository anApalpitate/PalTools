// @vitest-environment jsdom

import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderService, type ProviderSnapshot } from '../lib/provider-service'
import { useProviderProfiles } from './useProviderProfiles'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const snapshot = (id: string): ProviderSnapshot => ({ profiles: [], defaultProfileId: id, encryptionAvailable: false, managedProfileIds: [], platform: 'web' })

afterEach(() => vi.restoreAllMocks())

describe('useProviderProfiles', () => {
  it('keeps the latest refresh when older success or failure arrives later', async () => {
    const first = deferred<ProviderSnapshot>()
    const second = deferred<ProviderSnapshot>()
    vi.spyOn(ProviderService.prototype, 'load').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useProviderProfiles())
    let refreshed!: Promise<void>
    act(() => { refreshed = result.current.refresh() })
    await act(async () => { second.resolve(snapshot('newest')); await refreshed })
    expect(result.current.snapshot.defaultProfileId).toBe('newest')
    await act(async () => { first.reject(new Error('old failure')); await first.promise.catch(() => undefined) })
    expect(result.current.snapshot.defaultProfileId).toBe('newest')
    expect(result.current.error).toBe('')
  })

  it('does not allow older success to replace the current failure', async () => {
    const first = deferred<ProviderSnapshot>()
    const second = deferred<ProviderSnapshot>()
    vi.spyOn(ProviderService.prototype, 'load').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useProviderProfiles())
    let refreshed!: Promise<void>
    act(() => { refreshed = result.current.refresh() })
    await act(async () => { second.reject(new Error('current failure')); await refreshed })
    await act(async () => { first.resolve(snapshot('stale')); await first.promise })
    expect(result.current.snapshot.defaultProfileId).toBe('')
    expect(result.current.error).toBe('current failure')
    expect(result.current.loading).toBe(false)
  })

  it('shows loading during retry and only the latest request can finish it', async () => {
    const retry = deferred<ProviderSnapshot>()
    vi.spyOn(ProviderService.prototype, 'load').mockRejectedValueOnce(new Error('first failure')).mockReturnValueOnce(retry.promise)
    const { result } = renderHook(() => useProviderProfiles())
    await waitFor(() => expect(result.current.error).toBe('first failure'))
    let refreshed!: Promise<void>
    act(() => { refreshed = result.current.refresh() })
    expect(result.current.loading).toBe(true)
    expect(result.current.error).toBe('')
    await act(async () => { retry.reject(new Error('retry failure')); await refreshed })
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe('retry failure')
  })

  it('does not end a current load when an earlier request completes', async () => {
    const first = deferred<ProviderSnapshot>()
    const second = deferred<ProviderSnapshot>()
    vi.spyOn(ProviderService.prototype, 'load').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useProviderProfiles())
    let refreshed!: Promise<void>
    act(() => { refreshed = result.current.refresh() })
    await act(async () => { first.resolve(snapshot('old')); await first.promise })
    expect(result.current.loading).toBe(true)
    await act(async () => { second.resolve(snapshot('new')); await refreshed })
    expect(result.current.loading).toBe(false)
    expect(result.current.snapshot.defaultProfileId).toBe('new')
  })

  it('invalidates StrictMode attempts and does not refresh after unmount', async () => {
    const first = deferred<ProviderSnapshot>()
    const second = deferred<ProviderSnapshot>()
    const load = vi.spyOn(ProviderService.prototype, 'load').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result, unmount } = renderHook(() => useProviderProfiles(), { wrapper: StrictMode })
    expect(load).toHaveBeenCalledTimes(2)
    await act(async () => { second.resolve(snapshot('mounted')); await second.promise })
    await act(async () => { first.resolve(snapshot('unmounted-attempt')); await first.promise })
    expect(result.current.snapshot.defaultProfileId).toBe('mounted')
    const refresh = result.current.refresh
    unmount()
    await refresh()
    expect(load).toHaveBeenCalledTimes(2)
  })
})
