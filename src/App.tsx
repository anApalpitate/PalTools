import { useEffect, useMemo, useState } from 'react'
import { PaldexPage } from './features/paldex/PaldexPage'
import { BreedingPage } from './features/breeding/BreedingPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { useBreedingIndex, useCatalogData } from './hooks/useCatalogData'
import { APP_VERSION } from './lib/app-version'
import { localAssetUrl } from './lib/assets'
import {
  THEME_STORAGE_KEY,
  parseThemePreference,
  useThemePreference,
} from './theme/theme'

type Tool = 'paldex' | 'breeding' | 'settings'

export function App() {
  const [tool, setTool] = useState<Tool>('paldex')
  const catalog = useCatalogData()
  const initialThemeId = useMemo(
    () => parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY)),
    [],
  )
  const theme = useThemePreference(initialThemeId)
  const breedingIndex = useBreedingIndex(
    tool === 'breeding',
    catalog.setLoadingError,
  )
  useEffect(() => {
    if (typeof indexedDB !== 'undefined') {
      indexedDB.deleteDatabase('paltools-breeding')
    }
  }, [])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <button
            className="brand brand-button"
            onClick={() => setTool('paldex')}
          >
            <span className="brand-mark" aria-hidden="true">
              <img src={localAssetUrl('/app-icon-96.png')} alt="" />
            </span>
            <span>
              <strong>PalTools</strong>
              <small>本地帕鲁助手</small>
            </span>
          </button>
          <nav className="tool-tabs" aria-label="工具导航">
            <button
              className={tool === 'paldex' ? 'is-active' : ''}
              onClick={() => setTool('paldex')}
            >
              图鉴
            </button>
            <button
              className={tool === 'breeding' ? 'is-active' : ''}
              onClick={() => setTool('breeding')}
            >
              配种
            </button>
            <button
              className={tool === 'settings' ? 'is-active' : ''}
              onClick={() => setTool('settings')}
            >
              设置
            </button>
          </nav>
          <div className="version-chip">
            <span className="online-dot" aria-hidden="true" />
            版本 {APP_VERSION}
          </div>
        </div>
      </header>

      <div className="app-frame">
        {catalog.loadingError ? (
          <main className="error-state">
            <span>!</span>
            <h1>本地数据未就绪</h1>
            <p>{catalog.loadingError}</p>
            <code>npm run data:sync</code>
          </main>
        ) : tool === 'paldex' ? (
          <PaldexPage
            pals={catalog.pals}
            elementRecords={catalog.elementRecords}
            skills={catalog.skills}
            items={catalog.items}
            workSuitabilityRecords={catalog.workSuitabilityRecords}
          />
        ) : tool === 'settings' ? (
          <SettingsPage
            themeId={theme.themeId}
            onThemeChange={theme.setThemeId}
          />
        ) : (
          <BreedingPage
            pals={catalog.pals}
            breedingIndex={breedingIndex}
            datasetVersion={catalog.manifest?.datasetVersion ?? ''}
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
