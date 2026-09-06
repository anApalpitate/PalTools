import { useCallback, useEffect, useRef, useState } from 'react'
import {
  RUNTIME_DATA_LABELS,
  parseRuntimeData,
  type RuntimeDataKind,
} from '../domain/runtime-data'
import type {
  ActiveSkillRecord,
  BreedingIndexPayload,
  DatasetManifest,
  ElementRecord,
  ItemRecord,
  PalRecord,
  WorkSuitabilityRecord,
} from '../domain/types'
import { localAssetUrl } from '../lib/assets'

export type DataLoadStatus = 'idle' | 'loading' | 'success' | 'error'

interface CatalogData {
  pals: PalRecord[]
  elementRecords: ElementRecord[]
  skills: ActiveSkillRecord[]
  items: ItemRecord[]
  workSuitabilityRecords: WorkSuitabilityRecord[]
  manifest: DatasetManifest | null
}

export interface CatalogDataState extends CatalogData {
  status: DataLoadStatus
  error: string
  retry: () => void
}

export interface BreedingIndexState {
  status: DataLoadStatus
  data: BreedingIndexPayload | null
  error: string
  retry: () => void
}

const EMPTY_CATALOG: CatalogData = {
  pals: [],
  elementRecords: [],
  skills: [],
  items: [],
  workSuitabilityRecords: [],
  manifest: null,
}

async function fetchRuntimeData<K extends RuntimeDataKind>(
  kind: K,
  path: string,
  signal: AbortSignal,
) {
  const response = await fetch(localAssetUrl(path), { signal })
  if (!response.ok) {
    throw new Error(`${RUNTIME_DATA_LABELS[kind]}加载失败（HTTP ${response.status}）`)
  }
  let value: unknown
  try {
    value = await response.json()
  } catch {
    throw new Error(`${RUNTIME_DATA_LABELS[kind]}不是有效 JSON，请重试或重新构建本地数据。`)
  }
  return parseRuntimeData(kind, value)
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function useCatalogData(): CatalogDataState {
  const [data, setData] = useState<CatalogData>(EMPTY_CATALOG)
  const [status, setStatus] = useState<DataLoadStatus>('idle')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const requestIdRef = useRef(0)
  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    const requestId = ++requestIdRef.current
    setStatus('loading')
    setError('')

    void Promise.all([
      fetchRuntimeData('pals', '/data/pals.json', controller.signal),
      fetchRuntimeData('elements', '/data/elements.json', controller.signal),
      fetchRuntimeData('skills', '/data/skills.json', controller.signal),
      fetchRuntimeData('items', '/data/items.json', controller.signal),
      fetchRuntimeData(
        'workSuitabilities',
        '/data/work-suitabilities.json',
        controller.signal,
      ),
      fetchRuntimeData('manifest', '/data/manifest.json', controller.signal),
    ])
      .then(([palData, elementData, skillData, itemData, workData, manifest]) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return
        setData({
          pals: palData.pals,
          elementRecords: elementData.elements,
          skills: skillData.skills,
          items: itemData.items,
          workSuitabilityRecords: workData.workSuitabilities,
          manifest,
        })
        setError('')
        setStatus('success')
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return
        setError(errorMessage(cause, '本地图鉴数据加载失败'))
        setStatus('error')
      })

    return () => controller.abort()
  }, [attempt])

  return { ...data, status, error, retry }
}

export function useBreedingIndex(active: boolean): BreedingIndexState {
  const [data, setData] = useState<BreedingIndexPayload | null>(null)
  const [status, setStatus] = useState<DataLoadStatus>('idle')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const requestIdRef = useRef(0)
  const loadedAttemptRef = useRef(-1)
  const dataRef = useRef<BreedingIndexPayload | null>(null)
  dataRef.current = data
  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  useEffect(() => {
    const requestId = ++requestIdRef.current
    if (!active) {
      setStatus('idle')
      setError('')
      return undefined
    }
    if (dataRef.current && loadedAttemptRef.current === attempt) {
      setStatus('success')
      setError('')
      return undefined
    }

    const controller = new AbortController()
    setStatus('loading')
    setError('')
    void fetchRuntimeData(
      'breedingIndex',
      '/data/breeding-index.json',
      controller.signal,
    )
      .then((nextData) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return
        loadedAttemptRef.current = attempt
        setData(nextData)
        setError('')
        setStatus('success')
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return
        setError(errorMessage(cause, '配种索引加载失败'))
        setStatus('error')
      })

    return () => controller.abort()
  }, [active, attempt])

  return { status, data, error, retry }
}
