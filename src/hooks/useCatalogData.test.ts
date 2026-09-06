// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PalRecord } from '../domain/types'
import { useBreedingIndex, useCatalogData } from './useCatalogData'

const pal = {
  internalId: 'SheepBall',
  name: { zhHans: '棉悠悠', en: 'Lamball' },
} as PalRecord

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function payloadFor(url: string, pals: PalRecord[] = [pal]) {
  if (url.includes('pals.json')) return { schemaVersion: 4, pals }
  if (url.includes('elements.json')) return { schemaVersion: 4, elements: [] }
  if (url.includes('skills.json')) return { schemaVersion: 4, skills: [] }
  if (url.includes('items.json')) return { schemaVersion: 4, items: [] }
  if (url.includes('work-suitabilities.json')) {
    return { schemaVersion: 4, workSuitabilities: [] }
  }
  if (url.includes('manifest.json')) {
    return {
      schemaVersion: 4,
      datasetVersion: 'test-v1',
      gameReleaseLine: '1.0',
      gameBuildId: '24181527',
      generatedAt: '2026-01-01T00:00:00.000Z',
      breedingPolicy: { genderMode: 'ignored', normalizedSpecialPairs: 0 },
      sources: [],
      recordCounts: {},
    }
  }
  return {
    schemaVersion: 4,
    palIds: ['SheepBall'],
    recipes: [],
    recipesByPair: {},
    parentsByChild: {},
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return { promise, resolve }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useCatalogData', () => {
  it('reports loading and success through validated runtime envelopes', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) =>
      Promise.resolve(jsonResponse(payloadFor(String(input))))))

    const { result } = renderHook(() => useCatalogData())

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.pals).toEqual([pal])
    expect(result.current.manifest?.datasetVersion).toBe('test-v1')
    expect(result.current.error).toBe('')
  })

  it('retries a failed catalog load and clears the previous error', async () => {
    let attempt = 0
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      if (attempt === 0) return Promise.resolve(jsonResponse({}, 503))
      return Promise.resolve(jsonResponse(payloadFor(String(input))))
    }))
    const { result } = renderHook(() => useCatalogData())
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toContain('HTTP 503')

    attempt = 1
    act(() => result.current.retry())

    expect(result.current.status).toBe('loading')
    expect(result.current.error).toBe('')
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.error).toBe('')
  })

  it('aborts an earlier attempt and ignores its late result', async () => {
    const firstPals = deferred<Response>()
    const firstSignals: AbortSignal[] = []
    let palsRequestCount = 0
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('pals.json') && palsRequestCount++ === 0) {
        firstSignals.push(init?.signal as AbortSignal)
        return firstPals.promise
      }
      return Promise.resolve(jsonResponse(payloadFor(url)))
    }))
    const { result } = renderHook(() => useCatalogData())

    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(firstSignals[0].aborted).toBe(true)

    firstPals.resolve(jsonResponse({
      schemaVersion: 4,
      pals: [{ ...pal, internalId: 'LateResult' }],
    }))
    await act(async () => { await Promise.resolve() })

    expect(result.current.pals[0]?.internalId).toBe('SheepBall')
    expect(result.current.status).toBe('success')
  })
})

describe('useBreedingIndex', () => {
  it('stays idle while inactive, retries errors, and clears them on success', async () => {
    let fail = true
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      if (fail) return Promise.resolve(jsonResponse({}, 503))
      return Promise.resolve(jsonResponse(payloadFor(String(input))))
    }))
    const { result, rerender } = renderHook(
      ({ active }) => useBreedingIndex(active),
      { initialProps: { active: false } },
    )
    expect(result.current.status).toBe('idle')
    expect(fetch).not.toHaveBeenCalled()

    rerender({ active: true })
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toContain('HTTP 503')

    fail = false
    act(() => result.current.retry())
    expect(result.current.status).toBe('loading')
    expect(result.current.error).toBe('')
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data?.palIds).toEqual(['SheepBall'])

    rerender({ active: false })
    expect(result.current.status).toBe('idle')
    expect(result.current.error).toBe('')
    expect(result.current.data?.palIds).toEqual(['SheepBall'])
  })

  it('aborts an in-flight request and stays idle after becoming inactive', async () => {
    const pending = deferred<Response>()
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal as AbortSignal
      return pending.promise
    }))
    const { result, rerender } = renderHook(
      ({ active }) => useBreedingIndex(active),
      { initialProps: { active: true } },
    )
    expect(result.current.status).toBe('loading')

    rerender({ active: false })
    expect(signal?.aborted).toBe(true)
    expect(result.current.status).toBe('idle')

    pending.resolve(jsonResponse({}, 503))
    await act(async () => { await Promise.resolve() })
    expect(result.current.status).toBe('idle')
    expect(result.current.error).toBe('')
  })
})
