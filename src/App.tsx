import { useEffect, useMemo, useState } from 'react'
import { PaldexPage } from './features/paldex/PaldexPage'
import { BreedingPage } from './features/breeding/BreedingPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { useBreedingGraphStorage } from './hooks/useBreedingGraphStorage'
import { useBreedingGraphWorkspace } from './hooks/useBreedingGraphWorkspace'
import { useBreedingPlanEditor } from './hooks/useBreedingPlanEditor'
import { useBreedingIndex, useCatalogData } from './hooks/useCatalogData'
import { useMarkedBreedingRecipes } from './hooks/useMarkedBreedingRecipes'
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
  const [breedingGraphActive, setBreedingGraphActive] = useState(false)
  const catalog = useCatalogData()
  const graphStorage = useBreedingGraphStorage()
  const markedRecipes = useMarkedBreedingRecipes()
  const initialThemeId = useMemo(
    () => parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY)),
    [],
  )
  const theme = useThemePreference(initialThemeId)
  const breedingIndex = useBreedingIndex(
    tool === 'breeding',
    catalog.setLoadingError,
  )
  const breedingPals = useMemo(
    () =>
      breedingIndex
        ? catalog.pals.filter((pal) =>
            breedingIndex.palIds.includes(pal.internalId),
          )
        : catalog.pals.filter((pal) => pal.internalId !== 'WorldTreeDragon'),
    [breedingIndex, catalog.pals],
  )
  const graphWorkspace = useBreedingGraphWorkspace({
    storage: graphStorage,
  })
  const currentGraphPlan =
    graphWorkspace.state.plans.find(
      (plan) => plan.id === graphWorkspace.state.currentPlanId,
    ) ?? null
  const graphEditor = useBreedingPlanEditor({
    plan: currentGraphPlan,
    pals: breedingPals,
    breedingIndex,
    savePlan: graphWorkspace.actions.savePlan,
  })
  const [pendingTool, setPendingTool] = useState<Tool | null>(null)

  const navigateToTool = (nextTool: Tool) => {
    if (
      tool === 'breeding' &&
      nextTool !== 'breeding' &&
      graphEditor.state.dirty
    ) {
      setPendingTool(nextTool)
      return
    }
    setTool(nextTool)
  }

  useEffect(() => {
    if (!graphEditor.state.dirty) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [graphEditor.state.dirty])

  async function savePlanAndNavigate() {
    if (!pendingTool) return
    const planSaved = await graphEditor.actions.flush()
    if (!planSaved) return
    setTool(pendingTool)
    setPendingTool(null)
  }

  return (
    <div
      className={
        tool === 'breeding' && breedingGraphActive
          ? 'app-shell app-shell--graph'
          : 'app-shell'
      }
    >
      <header className="topbar">
        <div className="topbar-inner">
          <button
            className="brand brand-button"
            onClick={() => navigateToTool('paldex')}
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
              onClick={() => navigateToTool('paldex')}
            >
              图鉴
            </button>
            <button
              className={tool === 'breeding' ? 'is-active' : ''}
              onClick={() => navigateToTool('breeding')}
            >
              配种
            </button>
            <button
              className={tool === 'settings' ? 'is-active' : ''}
              onClick={() => navigateToTool('settings')}
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

      <div
        className={
          tool === 'breeding' && breedingGraphActive
            ? 'app-frame app-frame--graph'
            : 'app-frame'
        }
      >
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
            graphStorage={graphStorage}
            graphWorkspace={graphWorkspace}
            graphEditor={graphEditor}
            markedRecipeIndices={markedRecipes.state.recipeIndices}
            onToggleRecipeMark={markedRecipes.actions.toggle}
            datasetVersion={catalog.manifest?.datasetVersion ?? ''}
            onGraphModeChange={setBreedingGraphActive}
          />
        )}

        {!(tool === 'breeding' && breedingGraphActive) && (
        <footer className="app-footer">
          <span>离线可用 · 默认零遥测</span>
          <span>
            正式版 {catalog.manifest?.gameReleaseLine ?? '1.0'} · Steam build{' '}
            {catalog.manifest?.gameBuildId ?? '24181527'}
          </span>
          <span>非官方粉丝工具</span>
        </footer>
        )}
      </div>

      {pendingTool && (
        <div className="graph-modal-backdrop">
          <div
            className="graph-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-breeding-title"
          >
            <h2 id="leave-breeding-title">配种图有未保存更改</h2>
            <p>离开配种工具前需要先保存当前方案。</p>
            {graphEditor.state.saveState === 'error' && (
              <p className="graph-modal-error" role="alert">
                {graphEditor.state.error}
              </p>
            )}
            <div className="graph-modal-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => void savePlanAndNavigate()}
              >
                保存并离开
              </button>
              <button
                type="button"
                className="quiet-button"
                onClick={() => setPendingTool(null)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
