import { useEffect, useMemo, useState } from 'react'
import { PaldexPage } from './features/paldex/PaldexPage'
import { BreedingPage } from './features/breeding/BreedingPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { AssistantPage } from './features/assistant/AssistantPage'
import { AssistantIcon, BreedingRouteIcon, PaldexIcon, SettingsIcon } from './components/ui-icons'
import { HoverTooltip } from './components/HoverTooltip'
import { useBreedingIndex, useCatalogData } from './hooks/useCatalogData'
import { useProviderProfiles } from './hooks/useProviderProfiles'
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
  const catalog = useCatalogData()
  const initialThemeId = useMemo(
    () => parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY)),
    [],
  )
  const theme = useThemePreference(initialThemeId)
  const providerController = useProviderProfiles()
  const breeding = useBreedingIndex(
    route.tool === 'breeding' || route.tool === 'assistant' || (route.tool === 'paldex' && Boolean(route.palId)),
  )
  const breedingIndex = breeding.data
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
    if (route.tool === 'breeding' && route.mode === 'forward' && breedingIndex && ((route.parentAId && !breedingIndex.palIds.includes(route.parentAId)) || (route.parentBId && !breedingIndex.palIds.includes(route.parentBId)))) {
      replaceRoute({ tool: 'breeding', mode: 'forward' })
    }
  }, [breedingIndex, catalog.pals, route])
  useEffect(() => {
    if (typeof indexedDB !== 'undefined') {
      indexedDB.deleteDatabase('paltools-breeding')
    }
  }, [])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand brand-button" href={formatAppRouteHash({ tool: 'paldex' })}>
            <span className="brand-mark" aria-hidden="true">
              <img src={localAssetUrl('/app-icon-96.png')} alt="" width="36" height="36" />
            </span>
            <span>
              <strong>PalTools</strong>
              <small>本地帕鲁助手</small>
            </span>
          </a>
          <nav className="tool-tabs" aria-label="工具导航">
            <a className={route.tool === 'paldex' ? 'is-active' : ''} aria-current={route.tool === 'paldex' ? 'page' : undefined} href={formatAppRouteHash({ tool: 'paldex' })}>
              <PaldexIcon /><span>图鉴</span>
            </a>
            <a className={route.tool === 'breeding' ? 'is-active' : ''} aria-current={route.tool === 'breeding' ? 'page' : undefined} href={formatAppRouteHash({ tool: 'breeding', mode: 'forward' })}>
              <BreedingRouteIcon /><span>配种</span>
            </a>
            <a className={route.tool === 'assistant' ? 'is-active' : ''} aria-current={route.tool === 'assistant' ? 'page' : undefined} href={formatAppRouteHash({ tool: 'assistant' })}>
              <AssistantIcon /><span>助手</span>
            </a>
            <a className={route.tool === 'settings' ? 'is-active' : ''} aria-current={route.tool === 'settings' ? 'page' : undefined} href={formatAppRouteHash({ tool: 'settings' })}>
              <SettingsIcon /><span>设置</span>
            </a>
          </nav>
          <div className="version-chip">
            <span className="catalog-index-mark" aria-hidden="true" />
            版本 {APP_VERSION}
          </div>
        </div>
      </header>

      <div className="app-frame" id="main-content" tabIndex={-1}>
        {catalog.status === 'error' ? (
          <main className="error-state" aria-labelledby="catalog-error-title">
            <span>!</span>
            <h1 id="catalog-error-title">本地数据未就绪</h1>
            <p role="alert">{catalog.error}</p>
            <button className="primary-button" type="button" onClick={catalog.retry}>重试加载</button>
            <code>npm run data:sync</code>
          </main>
        ) : catalog.status !== 'success' ? (
          <main className="data-loading-state" role="status" aria-live="polite" aria-busy="true">
            <span className="catalog-index-mark" aria-hidden="true" />
            <h1>正在载入本地数据…</h1>
            <p>正在检查图鉴、技能与素材目录。</p>
          </main>
        ) : route.tool === 'breeding' && breeding.status === 'error' ? (
          <main className="error-state" aria-labelledby="breeding-error-title">
            <span>!</span>
            <h1 id="breeding-error-title">配种索引未就绪</h1>
            <p role="alert">{breeding.error}</p>
            <button className="primary-button" type="button" onClick={breeding.retry}>重试配种数据</button>
            <code>npm run data:sync</code>
          </main>
        ) : route.tool === 'paldex' ? (
          <>
            {breeding.status === 'error' && (
              <BreedingDataNotice message={breeding.error} onRetry={breeding.retry} />
            )}
            <PaldexPage
              pals={catalog.pals}
              elementRecords={catalog.elementRecords}
              skills={catalog.skills}
              items={catalog.items}
              workSuitabilityRecords={catalog.workSuitabilityRecords}
              selectedPalId={route.palId}
              breedingIndex={breedingIndex}
              breedingIndexError={breeding.error}
              onOpenDetail={(palId) => navigate({ tool: 'paldex', palId }, { paltoolsDetail: true })}
              onCloseDetail={() => {
                if (window.history.state?.paltoolsDetail) window.history.back()
                else replaceRoute({ tool: 'paldex' })
              }}
              onNavigateToBreeding={(targetId) => navigate({ tool: 'breeding', mode: 'reverse', targetId })}
            />
          </>
        ) : route.tool === 'settings' ? (
          <SettingsPage
            themeId={theme.themeId}
            onThemeChange={theme.setThemeId}
            providerController={providerController}
          />
        ) : route.tool === 'assistant' ? (
          <>
            {breeding.status === 'error' && (
              <BreedingDataNotice message={breeding.error} onRetry={breeding.retry} />
            )}
            <AssistantPage
              pals={catalog.pals}
              skills={catalog.skills}
              items={catalog.items}
              breedingIndex={breedingIndex}
              datasetVersion={catalog.manifest?.datasetVersion ?? ''}
              conversationId={route.conversationId}
              providerController={providerController}
              onNavigateConversation={(conversationId) => navigate({ tool: 'assistant', ...(conversationId ? { conversationId } : {}) })}
            />
          </>
        ) : (
          <BreedingPage
            pals={catalog.pals}
            breedingIndex={breedingIndex}
            datasetVersion={catalog.manifest?.datasetVersion ?? ''}
            mode={route.mode}
            reverseTarget={route.mode === 'reverse' ? route.targetId ?? '' : ''}
            forwardParentA={route.mode === 'forward' ? route.parentAId ?? '' : ''}
            forwardParentB={route.mode === 'forward' ? route.parentBId ?? '' : ''}
            onModeChange={(mode) => navigate({ tool: 'breeding', mode })}
            onReverseTargetChange={(targetId) => navigate({ tool: 'breeding', mode: 'reverse', ...(targetId ? { targetId } : {}) })}
            onNavigateToPaldex={(palId) => navigate({ tool: 'paldex', palId }, { paltoolsDetail: true })}
          />
        )}

        <footer className="app-footer">
          <span>核心离线可用 · 助手按需联网 · 默认零遥测</span>
          <span>
            正式版 {catalog.manifest?.gameReleaseLine ?? '1.0'} · Steam build{' '}
            {catalog.manifest?.gameBuildId ?? '24181527'}
          </span>
          <span>非官方粉丝工具</span>
        </footer>
      </div>
      <HoverTooltip />
    </div>
  )
}

function BreedingDataNotice({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <section
      className="data-load-notice"
      aria-labelledby="breeding-data-notice-title"
      aria-live="polite"
    >
      <span aria-hidden="true">!</span>
      <div>
        <strong id="breeding-data-notice-title">配种索引暂不可用</strong>
        <p>{message} 当前页面的基础功能仍可使用。</p>
      </div>
      <button className="quiet-button" type="button" onClick={onRetry}>重试配种数据</button>
    </section>
  )
}
