import { useEffect, useState } from 'react'
import {
  IndexedDbBreedingGraphRepository,
  type BreedingGraphRepository,
} from '../storage/breeding-graph-repository'

export interface BreedingGraphStorageState {
  status: 'idle' | 'initializing' | 'ready' | 'error'
  error: string
  repository?: BreedingGraphRepository | null
}

const INITIAL_STATE: BreedingGraphStorageState = {
  status: 'idle',
  error: '',
}

export function useBreedingGraphStorage(): BreedingGraphStorageState {
  const [state, setState] = useState(INITIAL_STATE)

  useEffect(() => {
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
    if (active) setState({ status: 'ready', error: '', repository })

    return () => {
      active = false
      void repository.close()
    }
  }, [])

  return state
}
