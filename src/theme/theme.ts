import { useState } from 'react'

export const THEME_STORAGE_KEY = 'paltools.theme.v1'
export const DEFAULT_THEME_ID = 'forest'

export const THEMES = [
  {
    id: 'forest',
    label: '森林夜色',
    description: 'PalTools 默认深色绿色主题',
    colorScheme: 'dark',
    previewColors: ['#07110e', '#10241b', '#67e9ab'],
  },
  {
    id: 'pearl',
    label: '珍珠白',
    description: '白色表面与现代蓝色强调',
    colorScheme: 'light',
    previewColors: ['#f6f7f9', '#ffffff', '#2563eb'],
  },
  {
    id: 'graphite',
    label: '石墨灰',
    description: '克制的冷灰深色界面',
    colorScheme: 'dark',
    previewColors: ['#111315', '#1c2024', '#8ea0b8'],
  },
  {
    id: 'sky',
    label: '晴空浅蓝',
    description: '清爽浅蓝背景与湖蓝强调',
    colorScheme: 'light',
    previewColors: ['#eef8ff', '#ffffff', '#0369a1'],
  },
  {
    id: 'lavender',
    label: '薰衣草霓虹',
    description: '深紫霓虹背景与电光青强调',
    colorScheme: 'dark',
    previewColors: ['#211a3a', '#b79cff', '#44e5d0'],
  },
  {
    id: 'coral',
    label: '珊瑚莓果',
    description: '暖白珊瑚红与莓果紫强调',
    colorScheme: 'light',
    previewColors: ['#fff4ee', '#ff6b6b', '#b83b7e'],
  },
  {
    id: 'mint',
    label: '深海薄荷',
    description: '深海靛蓝与薄荷青强调',
    colorScheme: 'dark',
    previewColors: ['#102a43', '#5eead4', '#a7f3d0'],
  },
] as const

export type ThemeId = (typeof THEMES)[number]['id']
export type ThemeDefinition = (typeof THEMES)[number]

export interface ThemePreferenceV1 {
  schemaVersion: 1
  themeId: ThemeId
}

const themeIds = new Set<string>(THEMES.map((theme) => theme.id))

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && themeIds.has(value)
}

export function parseThemePreference(raw: string | null): ThemeId {
  if (!raw) return DEFAULT_THEME_ID
  try {
    const value = JSON.parse(raw) as Partial<ThemePreferenceV1>
    return value.schemaVersion === 1 && isThemeId(value.themeId)
      ? value.themeId
      : DEFAULT_THEME_ID
  } catch {
    return DEFAULT_THEME_ID
  }
}

export function serializeThemePreference(themeId: ThemeId): string {
  return JSON.stringify({ schemaVersion: 1, themeId })
}

export function applyTheme(themeId: ThemeId): void {
  document.documentElement.dataset.theme = themeId
  document.documentElement.style.colorScheme =
    THEMES.find((theme) => theme.id === themeId)?.colorScheme ?? 'dark'
}

export function initializeTheme(): ThemeId {
  const themeId = parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY))
  applyTheme(themeId)
  return themeId
}

export function useThemePreference(initialThemeId: ThemeId) {
  const [themeId, setThemeIdState] = useState(() => {
    applyTheme(initialThemeId)
    return initialThemeId
  })

  const setThemeId = (nextThemeId: ThemeId) => {
    applyTheme(nextThemeId)
    localStorage.setItem(
      THEME_STORAGE_KEY,
      serializeThemePreference(nextThemeId),
    )
    setThemeIdState(nextThemeId)
  }

  return { themeId, setThemeId }
}
