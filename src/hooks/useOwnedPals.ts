import { useEffect, useMemo, useState } from 'react'
import {
  OWNED_PALS_STORAGE_KEY,
  parseOwnedPalIds,
  serializeOwnedPalIds,
} from '../domain/config'
import type { PalRecord } from '../domain/types'

export function useOwnedPals(pals: PalRecord[]) {
  const [ownedIds, setOwnedIds] = useState<string[]>([])
  const [persistedOwnedIds, setPersistedOwnedIds] = useState<string[]>([])
  const [savedFeedback, setSavedFeedback] = useState(false)

  useEffect(() => {
    if (pals.length === 0) return
    const validIds = new Set(pals.map((pal) => pal.internalId))
    const savedIds = parseOwnedPalIds(
      localStorage.getItem(OWNED_PALS_STORAGE_KEY),
      validIds,
    )
    setOwnedIds(savedIds)
    setPersistedOwnedIds(savedIds)
  }, [pals])

  const dirty = useMemo(
    () =>
      serializeOwnedPalIds(ownedIds) !==
      serializeOwnedPalIds(persistedOwnedIds),
    [ownedIds, persistedOwnedIds],
  )

  const save = () => {
    localStorage.setItem(
      OWNED_PALS_STORAGE_KEY,
      serializeOwnedPalIds(ownedIds),
    )
    setPersistedOwnedIds(ownedIds)
    setSavedFeedback(true)
  }

  const confirmLeave = () =>
    !dirty || window.confirm('已拥有帕鲁有未保存更改，确定要离开吗？')

  useEffect(() => {
    if (!dirty) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

  useEffect(() => {
    if (!savedFeedback) return
    const timer = window.setTimeout(() => setSavedFeedback(false), 2200)
    return () => window.clearTimeout(timer)
  }, [savedFeedback])

  return {
    ownedIds,
    setOwnedIds,
    dirty,
    savedFeedback,
    save,
    confirmLeave,
  }
}

export type OwnedPalsState = ReturnType<typeof useOwnedPals>
