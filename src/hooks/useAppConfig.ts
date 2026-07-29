import { useMemo, useState } from 'react'
import {
  ADMIN_CONFIG_STORAGE_KEY,
  DEFAULT_APP_CONFIG,
  DEFAULT_MAX_EXACT_GENERATION,
  HARD_MAX_EXACT_GENERATION,
  parseAppConfig,
} from '../domain/config'
import type { AppConfig } from '../domain/types'

export function useAppConfig() {
  const initial = useMemo(
    () => parseAppConfig(localStorage.getItem(ADMIN_CONFIG_STORAGE_KEY)),
    [],
  )
  const [appConfig, setAppConfig] = useState<AppConfig>(initial.config)
  const [configRecovered, setConfigRecovered] = useState(initial.recovered)
  const [configDraft, setConfigDraft] = useState(
    String(initial.config.pathPlanner.maxExactGeneration),
  )

  const saveConfig = () => {
    const value = Number(configDraft)
    if (
      !Number.isInteger(value) ||
      value < 1 ||
      value > HARD_MAX_EXACT_GENERATION
    ) {
      setConfigRecovered(true)
      return
    }
    const next: AppConfig = {
      schemaVersion: 1,
      pathPlanner: { maxExactGeneration: value },
    }
    localStorage.setItem(ADMIN_CONFIG_STORAGE_KEY, JSON.stringify(next))
    setAppConfig(next)
    setConfigRecovered(false)
  }

  const resetConfig = () => {
    localStorage.setItem(
      ADMIN_CONFIG_STORAGE_KEY,
      JSON.stringify(DEFAULT_APP_CONFIG),
    )
    setAppConfig(DEFAULT_APP_CONFIG)
    setConfigDraft(String(DEFAULT_MAX_EXACT_GENERATION))
    setConfigRecovered(false)
  }

  return {
    appConfig,
    configDraft,
    configRecovered,
    setConfigDraft,
    saveConfig,
    resetConfig,
  }
}
