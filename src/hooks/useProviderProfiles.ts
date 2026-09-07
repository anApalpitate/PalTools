import { useCallback, useMemo, useState, useEffect, useRef } from 'react'
import type { ProviderProfile } from '../domain/agent'
import { ProviderService, type ProviderSnapshot } from '../lib/provider-service'

const EMPTY_SNAPSHOT: ProviderSnapshot = { profiles: [], defaultProfileId: '', encryptionAvailable: false, managedProfileIds: [], platform: 'web' }

export function useProviderProfiles() {
  const service = useMemo(() => new ProviderService(), [])
  const [snapshot, setSnapshot] = useState<ProviderSnapshot>(EMPTY_SNAPSHOT)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const mounted = useRef(false)
  const refreshGeneration = useRef(0)
  const refresh = useCallback(async () => {
    if (!mounted.current) return
    const generation = ++refreshGeneration.current
    const isCurrent = () => mounted.current && generation === refreshGeneration.current
    setLoading(true)
    setError('')
    try {
      const next = await service.load()
      if (isCurrent()) setSnapshot(next)
    }
    catch (cause) { if (isCurrent()) setError(cause instanceof Error ? cause.message : '模型配置加载失败') }
    finally { if (isCurrent()) setLoading(false) }
  }, [service])
  useEffect(() => {
    mounted.current = true
    void refresh()
    return () => { mounted.current = false; refreshGeneration.current += 1 }
  }, [refresh])

  return {
    service, snapshot, loading, error,
    save: async (profile: ProviderProfile, apiKey?: string) => { await service.save(profile, apiKey); await refresh() },
    remove: async (profileId: string) => { await service.remove(profileId); await refresh() },
    setDefault: async (profileId: string) => { await service.setDefault(profileId); await refresh() },
    refresh,
  }
}

export type ProviderProfilesController = ReturnType<typeof useProviderProfiles>
