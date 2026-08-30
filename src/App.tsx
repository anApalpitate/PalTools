import { useEffect, useMemo, useState } from 'react'
import { PaldexPage } from './features/paldex/PaldexPage'
import { BreedingPage } from './features/breeding/BreedingPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { useBreedingIndex, useCatalogData } from './hooks/useCatalogData'
import { APP_VERSION } from './lib/app-version'
import { localAssetUrl } from './lib/assets'
import { isMobileDevice } from './lib/device'
import {
  formatAppRouteHash,
  parseAppRouteHash,
  pushAppRoute,
  replaceAppRoute,
  type AppRoute,
} from './lib/app-route'
import {
  THEME_STORAGE_KEY,
  parseThemePreference,
  useThemePreference,
} from './theme/theme'

export function App() {
  if (isMobileDevice()) {
    return (
      <main className="mobile-unsupported">
        <span className="mobile-unsupported-mark" aria-hidden="true">◇</span>
        <p className="eyebrow">DESKTOP ONLY</p>
        <h1>本应用不支持移动端</h1>
        <p>请使用桌面浏览器或 Windows、macOS 桌面版访问 PalTools。</p>
      </main>
    )
  }

  return <DesktopApp />
}

function DesktopApp() {
  const [route, setRoute] = useState<AppRoute>(() =>
    parseAppRouteHash(window.location.hash) ?? { tool: 'paldex' },
  )
  const [breedingLoadingError, setBreedingLoadingError] = useState('')
  const catalog = useCatalogData()
  const initialThemeId = useMemo(
    () => parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY)),
    [],
  )
  const theme = useThemePreference(initialThemeId)
  const breedingIndex = useBreedingIndex(
    route.tool === 'breeding' || (route.tool === 'paldex' && Boolean(route.palId)),
    setBreedingLoadingError,
  )
  const navigate = (nextRoute: AppRoute, state?: unknown) => {
    pushAppRoute(nextRoute, state)
    setRoute(nextRoute)
  }
  const replaceRoute = (nextRoute: AppRoute) => {
    replaceAppRoute(nextRoute)
    setRoute(nextRoute)
  }
  useEffect(() => {
    if (!parseAppRouteHash(window.location.hash)) {
      replaceRoute({ tool: 'paldex' })
    }
    const syncRoute = () => {
      const nextRoute = parseAppRouteHash(window.location.hash)
      if (nextRoute) setRoute(nextRoute)
      else replaceRoute({ tool: 'paldex' })
    }
    window.addEventListener('hashchange', syncRoute)
    window.addEventListener('popstate', syncRoute)
    return () => {
      window.removeEventListener('hashchange', syncRoute)
      window.removeEventListener('popstate', syncRoute)
    }
  }, [])

  useEffect(() => {
    if (!catalog.pals.length) return
    if (route.tool === 'paldex' && route.palId && !catalog.pals.some((pal) => pal.internalId === route.palId)) {
      replaceRoute({ tool: 'paldex' })
    }
    if (route.tool === 'breeding' && route.mode === 'reverse' && route.targetId && breedingIndex && !breedingIndex.palIds.includes(route.targetId)) {
      replaceRoute({ tool: 'breeding', mode: 'reverse' })
    }
  }, [breedingIndex, catalog.pals, route])
  useEffect(() => {
    if (typeof indexedDB !== 'undefined') {
      indexedDB.deleteDatabase('paltools-breeding')
    }
  }, [])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand brand-button" href={formatAppRouteHash({ tool: 'paldex' })}>
            <span className="brand-mark" aria-hidden="true">
              <img src={localAssetUrl('/app-icon-96.png')} alt="" />
            </span>
            <span>
              <strong>PalTools</strong>
              <small>本地帕鲁助手</small>
            </span>
          </a>
          <nav className="tool-tabs" aria-label="工具导航">
            <a className={route.tool === 'paldex' ? 'is-active' : ''} href={formatAppRouteHash({ tool: 'paldex' })}>
              图鉴
            </a>
            <a className={route.tool === 'breeding' ? 'is-active' : ''} href={formatAppRouteHash({ tool: 'breeding', mode: 'forward' })}>
              配种
            </a>
            <a className={route.tool === 'settings' ? 'is-active' : ''} href={formatAppRouteHash({ tool: 'settings' })}>
              设置
            </a>
          </nav>
          <div className="version-chip">
            <span className="online-dot" aria-hidden="true" />
            版本 {APP_VERSION}
          </div>
        </div>
      </header>

      <div className="app-frame">
        {catalog.loadingError || (route.tool === 'breeding' && breedingLoadingError) ? (
          <main className="error-state">
            <span>!</span>
            <h1>本地数据未就绪</h1>
            <p>{catalog.loadingError || breedingLoadingError}</p>
            <code>npm run data:sync</code>
          </main>
        ) : route.tool === 'paldex' ? (
          <PaldexPage
            pals={catalog.pals}
            elementRecords={catalog.elementRecords}
            skills={catalog.skills}
            items={catalog.items}
            workSuitabilityRecords={catalog.workSuitabilityRecords}
            selectedPalId={route.palId}
            breedingIndex={breedingIndex}
            breedingIndexError={breedingLoadingError}
            onOpenDetail={(palId) => navigate({ tool: 'paldex', palId }, { paltoolsDetail: true })}
            onCloseDetail={() => {
              if (window.history.state?.paltoolsDetail) window.history.back()
              else replaceRoute({ tool: 'paldex' })
            }}
            onNavigateToBreeding={(targetId) => navigate({ tool: 'breeding', mode: 'reverse', targetId })}
          />
        ) : route.tool === 'settings' ? (
          <SettingsPage
            themeId={theme.themeId}
            onThemeChange={theme.setThemeId}
          />
        ) : (
          <BreedingPage
            pals={catalog.pals}
            breedingIndex={breedingIndex}
            datasetVersion={catalog.manifest?.datasetVersion ?? ''}
            mode={route.mode}
            reverseTarget={route.mode === 'reverse' ? route.targetId ?? '' : ''}
            onModeChange={(mode) => navigate({ tool: 'breeding', mode })}
            onReverseTargetChange={(targetId) => navigate({ tool: 'breeding', mode: 'reverse', ...(targetId ? { targetId } : {}) })}
            onNavigateToPaldex={(palId) => navigate({ tool: 'paldex', palId }, { paltoolsDetail: true })}
          />
        )}

        <footer className="app-footer">
          <span>离线可用 · 默认零遥测</span>
          <span>
            正式版 {catalog.manifest?.gameReleaseLine ?? '1.0'} · Steam build{' '}
            {catalog.manifest?.gameBuildId ?? '24181527'}
          </span>
          <span>非官方粉丝工具</span>
        </footer>
      </div>
    </div>
  )
}
