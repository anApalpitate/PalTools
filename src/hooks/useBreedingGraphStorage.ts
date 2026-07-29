import { useEffect, useState } from 'react'
import type { PalRecord } from '../domain/types'
import {
  IndexedDbBreedingGraphRepository,
  LEGACY_OWNED_PALS_STORAGE_KEY,
} from '../storage/breeding-graph-repository'

export interface BreedingGraphStorageState {
  status: 'idle' | 'initializing' | 'ready' | 'error'
  error: string
}

const INITIAL_STATE: BreedingGraphStorageState = {
  status: 'idle',
  error: '',
}

export function useBreedingGraphStorage(
  pals: PalRecord[],
): BreedingGraphStorageState {
  const [state, setState] = useState(INITIAL_STATE)

  useEffect(() => {
    if (pals.length === 0) return
    if (typeof indexedDB === 'undefined') {
      setState({
        status: 'error',
        error: '当前环境不支持 IndexedDB。',
      })
      return
    }

    let active = true
    const repository = new IndexedDbBreedingGraphRepository()
    setState({ status: 'initializing', error: '' })
    repository
      .migrateLegacyOwnedPals({
        raw: localStorage.getItem(LEGACY_OWNED_PALS_STORAGE_KEY),
        validPalIds: new Set(pals.map((pal) => pal.internalId)),
      })
      .then(() => {
        if (active) setState({ status: 'ready', error: '' })
      })
      .catch((error: unknown) => {
        if (!active) return
        setState({
          status: 'error',
          error: error instanceof Error ? error.message : '未知错误',
        })
      })

    return () => {
      active = false
      void repository.close()
    }
  }, [pals])

  return state
}
