import { useEffect, useMemo, useState } from 'react'
import { PalPicker } from '../../components/PalPicker'
import {
  filterAndSortRecipesForParent,
  otherParentIdForRecipe,
  recipeMatchesForChild,
  recipeMatchesForParent,
  recipeMatchesForParents,
} from '../../domain/pals'
import { matchesPalIdentityQuery } from '../../domain/search'
import type {
  BreedingIndexPayload,
  PalRecord,
} from '../../domain/types'
import type { BreedingGraphStorageState } from '../../hooks/useBreedingGraphStorage'
import type { useBreedingGraphWorkspace } from '../../hooks/useBreedingGraphWorkspace'
import type { useBreedingPlanEditor } from '../../hooks/useBreedingPlanEditor'
import { BreedingGraphWorkspace } from './BreedingGraphWorkspace'
import { FormulaCard } from './BreedingComponents'

type BreedingMode = 'forward' | 'reverse' | 'graph'

interface BreedingPageProps {
  pals: PalRecord[]
  breedingIndex: BreedingIndexPayload | null
  graphStorage: BreedingGraphStorageState
  graphWorkspace: ReturnType<typeof useBreedingGraphWorkspace>
  graphEditor: ReturnType<typeof useBreedingPlanEditor>
  datasetVersion?: string
}

export function BreedingPage({
  pals,
  breedingIndex,
  graphStorage,
  graphWorkspace,
  graphEditor,
  datasetVersion = '',
}: BreedingPageProps) {
  const [mode, setMode] = useState<BreedingMode>('forward')
  const [parentA, setParentA] = useState('')
  const [parentB, setParentB] = useState('')
  const [forwardQuery, setForwardQuery] = useState('')
  const [forwardPage, setForwardPage] = useState(1)
  const [reverseTarget, setReverseTarget] = useState('')
  const [reverseQuery, setReverseQuery] = useState('')
  const [reversePage, setReversePage] = useState(1)
  const [pendingMode, setPendingMode] = useState<BreedingMode | null>(null)
  const [graphNotice, setGraphNotice] = useState('')
  const [canReturnToGraph, setCanReturnToGraph] = useState(false)

  const palsById = useMemo(
    () => new Map(pals.map((pal) => [pal.internalId, pal])),
    [pals],
  )
  const breedingPals = useMemo(
    () =>
      breedingIndex
        ? pals.filter((pal) => breedingIndex.palIds.includes(pal.internalId))
        : pals.filter((pal) => pal.internalId !== 'WorldTreeDragon'),
    [pals, breedingIndex],
  )
  const workspace = graphWorkspace
  const singleParentId =
    parentA && !parentB ? parentA : parentB && !parentA ? parentB : ''
  const singleParentAllRecipes = useMemo(
    () =>
      breedingIndex && singleParentId
        ? recipeMatchesForParent(breedingIndex, singleParentId)
        : [],
    [breedingIndex, singleParentId],
  )
  const forwardRecipes = useMemo(() => {
    if (!breedingIndex) return []
    if (parentA && parentB) {
      return recipeMatchesForParents(breedingIndex, parentA, parentB)
    }
    if (singleParentId) {
      return filterAndSortRecipesForParent(
        singleParentAllRecipes,
        singleParentId,
        palsById,
        forwardQuery,
      )
    }
    return []
  }, [
    breedingIndex,
    forwardQuery,
    palsById,
    parentA,
    parentB,
    singleParentAllRecipes,
    singleParentId,
  ])
  const forwardPages = Math.max(1, Math.ceil(forwardRecipes.length / 50))
  const forwardPageItems = singleParentId
    ? forwardRecipes.slice((forwardPage - 1) * 50, forwardPage * 50)
    : forwardRecipes
  const reverseRecipes = useMemo(() => {
    if (!breedingIndex || !reverseTarget) return []
    const queryText = reverseQuery.trim().toLocaleLowerCase('zh-CN')
    return recipeMatchesForChild(breedingIndex, reverseTarget)
      .filter((recipe) => {
        if (!queryText) return true
        const parentARecord = palsById.get(recipe.parentAId)
        const parentBRecord = palsById.get(recipe.parentBId)
        return [parentARecord, parentBRecord].some(
          (pal) => pal && matchesPalIdentityQuery(pal, queryText),
        )
      })
      .sort((left, right) => {
        const leftA = palsById.get(left.parentAId)
        const rightA = palsById.get(right.parentAId)
        return (
          (leftA?.paldexNo ?? '9999').localeCompare(
            rightA?.paldexNo ?? '9999',
            undefined,
            { numeric: true },
          ) || left.parentBId.localeCompare(right.parentBId)
        )
      })
  }, [breedingIndex, reverseTarget, reverseQuery, palsById])
  const reversePages = Math.max(1, Math.ceil(reverseRecipes.length / 50))
  const reversePageItems = reverseRecipes.slice(
    (reversePage - 1) * 50,
    reversePage * 50,
  )

  useEffect(() => {
    setForwardQuery('')
    setForwardPage(1)
  }, [parentA, parentB])

  useEffect(() => {
    setForwardPage(1)
  }, [forwardQuery])

  useEffect(() => {
    setReversePage(1)
  }, [reverseTarget, reverseQuery])

  function requestMode(nextMode: BreedingMode) {
    if (
      mode === 'graph' &&
      nextMode !== 'graph' &&
      (workspace.state.presetDirty || graphEditor.state.dirty)
    ) {
      setPendingMode(nextMode)
      return
    }
    setMode(nextMode)
  }

  async function savePresetAndSwitchMode() {
    if (!pendingMode) return
    if (workspace.state.presetDirty) {
      const presetSaved = await workspace.actions.savePreset()
      if (!presetSaved) return
    }
    const planSaved = await graphEditor.actions.flush()
    if (!planSaved) return
    setMode(pendingMode)
    setPendingMode(null)
  }

  async function discardPresetAndSwitchMode() {
    if (!pendingMode) return
    if (workspace.state.presetDirty) workspace.actions.discardPresetChanges()
    const planSaved = await graphEditor.actions.flush()
    if (!planSaved) return
    setMode(pendingMode)
    setPendingMode(null)
  }

  return (
    <main>
      <section className="page-heading page-heading--breeding">
        <div>
          <p className="eyebrow">BREEDING / 44,851 条无性别公式</p>
          <h1>配种工具</h1>
          <p>正向查询、目标反查与帕鲁配种图均在本机完成。</p>
        </div>
      </section>

      <nav className="breeding-mode-tabs" aria-label="配种功能">
        {([
          ['forward', '双亲查子代'],
          ['reverse', '获取目标帕鲁'],
          ['graph', '帕鲁配种图'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            className={mode === value ? 'is-active' : ''}
            onClick={() => requestMode(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      {graphNotice && (
        <div className="breeding-graph-notice" role="status">
          <span>{graphNotice}</span>
          <button
            type="button"
            className="quiet-button"
            onClick={() => {
              setMode('graph')
              setGraphNotice('')
            }}
          >
            前往查看
          </button>
        </div>
      )}

      {mode === 'graph' ? (
        <BreedingGraphMode
          pals={breedingPals}
          breedingIndex={breedingIndex}
          datasetVersion={datasetVersion}
          storage={graphStorage}
          workspace={workspace}
          editor={graphEditor}
          onQueryPal={(palId) => {
            setReverseTarget(palId)
            setCanReturnToGraph(true)
            setMode('reverse')
          }}
        />
      ) : !breedingIndex ? (
        <section className="breeding-workspace result-placeholder">
          <h2>正在载入配方索引…</h2>
        </section>
      ) : mode === 'forward' ? (
        <ForwardBreeding
          pals={breedingPals}
          palsById={palsById}
          parentA={parentA}
          parentB={parentB}
          setParentA={setParentA}
          setParentB={setParentB}
          singleParentId={singleParentId}
          query={forwardQuery}
          page={forwardPage}
          pages={forwardPages}
          totalRecipes={singleParentAllRecipes.length}
          recipes={forwardRecipes}
          pageItems={forwardPageItems}
          setQuery={setForwardQuery}
          setPage={setForwardPage}
          onAppend={(recipe) => {
            if (graphEditor.actions.appendRecipe(recipe)) {
              setGraphNotice('配方已追加到当前方案。')
            }
          }}
          appendDisabled={!graphEditor.state.plan}
        />
      ) : (
        <ReverseBreeding
          pals={breedingPals}
          palsById={palsById}
          target={reverseTarget}
          query={reverseQuery}
          page={reversePage}
          pages={reversePages}
          recipes={reverseRecipes}
          pageItems={reversePageItems}
          setTarget={setReverseTarget}
          setQuery={setReverseQuery}
          setPage={setReversePage}
          onAppend={(recipe) => {
            if (graphEditor.actions.appendRecipe(recipe)) {
              setGraphNotice('配方已追加到当前方案。')
            }
          }}
          appendDisabled={!graphEditor.state.plan}
          canReturnToGraph={canReturnToGraph}
          onReturnToGraph={() => {
            setMode('graph')
            setCanReturnToGraph(false)
          }}
        />
      )}

      {pendingMode && (
        <div className="graph-modal-backdrop">
          <div
            className="graph-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-graph-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setPendingMode(null)
            }}
          >
            <h2 id="leave-graph-title">配种图有未保存更改</h2>
            <p>离开配种图前需保存方案；预设草稿可选择保存或放弃。</p>
            {workspace.state.presetSaveState === 'error' && (
              <p className="graph-modal-error" role="alert">
                {workspace.state.presetSaveError}
              </p>
            )}
            {graphEditor.state.saveState === 'error' && (
              <p className="graph-modal-error" role="alert">
                {graphEditor.state.error}
              </p>
            )}
            <div className="graph-modal-actions">
              <button
                type="button"
                className="primary-button"
                autoFocus
                onClick={() => void savePresetAndSwitchMode()}
              >
                保存并继续
              </button>
              <button
                type="button"
                className="quiet-button"
                onClick={() => void discardPresetAndSwitchMode()}
                disabled={!workspace.state.presetDirty}
              >
                放弃更改
              </button>
              <button
                type="button"
                className="quiet-button"
                onClick={() => setPendingMode(null)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function BreedingGraphMode({
  pals,
  breedingIndex,
  datasetVersion,
  storage,
  workspace,
  editor,
  onQueryPal,
}: {
  pals: PalRecord[]
  breedingIndex: BreedingIndexPayload | null
  datasetVersion: string
  storage: BreedingGraphStorageState
  workspace: ReturnType<typeof useBreedingGraphWorkspace>
  editor: ReturnType<typeof useBreedingPlanEditor>
  onQueryPal: (palId: string) => void
}) {
  if (workspace.state.status === 'ready' && breedingIndex) {
    return (
      <BreedingGraphWorkspace
        pals={pals}
        state={workspace.state}
        actions={workspace.actions}
        editor={editor}
        breedingIndex={breedingIndex}
        datasetVersion={datasetVersion}
        onQueryPal={onQueryPal}
      />
    )
  }

  const statusText =
    storage.status === 'error' || workspace.state.status === 'error'
      ? `本机图数据仓储初始化失败：${storage.error || workspace.state.error}`
      : workspace.state.status === 'initializing'
        ? '正在初始化配种图工作区…'
        : storage.status === 'ready'
          ? '本机图数据仓储已就绪。'
          : '正在初始化本机图数据仓储…'

  return (
    <section className="breeding-workspace breeding-graph-placeholder">
      <div className="result-placeholder">
        <span aria-hidden="true">◇</span>
        <h2>帕鲁配种图</h2>
        <p role={storage.status === 'error' || workspace.state.status === 'error' ? 'alert' : 'status'}>
          {statusText}
        </p>
      </div>
    </section>
  )
}

function ForwardBreeding({
  pals,
  palsById,
  parentA,
  parentB,
  setParentA,
  setParentB,
  singleParentId,
  query,
  page,
  pages,
  totalRecipes,
  recipes,
  pageItems,
  setQuery,
  setPage,
  onAppend,
  appendDisabled,
}: {
  pals: PalRecord[]
  palsById: ReadonlyMap<string, PalRecord>
  parentA: string
  parentB: string
  setParentA: (id: string) => void
  setParentB: (id: string) => void
  singleParentId: string
  query: string
  page: number
  pages: number
  totalRecipes: number
  recipes: ReturnType<typeof recipeMatchesForParents>
  pageItems: ReturnType<typeof recipeMatchesForParents>
  setQuery: (value: string) => void
  setPage: React.Dispatch<React.SetStateAction<number>>
  onAppend: Parameters<typeof FormulaCard>[0]['onAppend']
  appendDisabled: boolean
}) {
  return (
    <section className="breeding-workspace">
      <div className="parent-panel">
        <div className="parent-column">
          <span className="parent-label">亲本 A</span>
          <PalPicker
            id="parent-a"
            label="选择第一只帕鲁"
            pals={pals}
            selectedId={parentA}
            onSelect={setParentA}
          />
        </div>
        <button
          className="swap-button"
          aria-label="交换两只亲本"
          onClick={() => {
            setParentA(parentB)
            setParentB(parentA)
          }}
        >
          ⇄
        </button>
        <div className="parent-column">
          <span className="parent-label">亲本 B</span>
          <PalPicker
            id="parent-b"
            label="选择第二只帕鲁"
            pals={pals}
            selectedId={parentB}
            onSelect={setParentB}
          />
        </div>
      </div>
      <div className="result-panel">
        <p className="result-label">配种结果</p>
        {singleParentId && (
          <div className="single-parent-controls">
            <label className="search-field">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="筛选单亲配方"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索另一亲本或子代"
                spellCheck={false}
              />
            </label>
            <div className="reverse-summary" aria-live="polite">
              <strong>{recipes.length}</strong>
              <span>
                {' '}条匹配配方 · 共 {totalRecipes} 条 · 第 {page}/{pages} 页
              </span>
            </div>
          </div>
        )}
        {!parentA && !parentB ? (
          <div className="result-placeholder">
            <span>○</span><h2>等待选择亲本</h2>
          </div>
        ) : recipes.length === 0 ? (
          <div className="result-placeholder">
            <h2>
              {singleParentId
                ? query
                  ? '没有匹配的配方'
                  : '该亲本没有可用配方'
                : '当前组合没有结果'}
            </h2>
          </div>
        ) : (
          <>
            <div className="result-list">
              {pageItems.map((recipe, index) => {
                const otherParentId = singleParentId
                  ? otherParentIdForRecipe(recipe, singleParentId)
                  : null
                return (
                  <FormulaCard
                    key={`${recipe.parentAId}-${recipe.parentBId}-${recipe.childId}-${index}`}
                    recipe={recipe}
                    palsById={palsById}
                    displayParents={
                      singleParentId && otherParentId
                        ? [singleParentId, otherParentId]
                        : [parentA, parentB]
                    }
                    onAppend={onAppend}
                    appendDisabled={appendDisabled}
                  />
                )
              })}
            </div>
            {singleParentId && (
              <div className="pagination">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  上一页
                </button>
                <span>{page} / {pages}</span>
                <button
                  disabled={page >= pages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function ReverseBreeding({
  pals,
  palsById,
  target,
  query,
  page,
  pages,
  recipes,
  pageItems,
  setTarget,
  setQuery,
  setPage,
  onAppend,
  appendDisabled,
  canReturnToGraph,
  onReturnToGraph,
}: {
  pals: PalRecord[]
  palsById: ReadonlyMap<string, PalRecord>
  target: string
  query: string
  page: number
  pages: number
  recipes: ReturnType<typeof recipeMatchesForChild>
  pageItems: ReturnType<typeof recipeMatchesForChild>
  setTarget: (id: string) => void
  setQuery: (value: string) => void
  setPage: React.Dispatch<React.SetStateAction<number>>
  onAppend: Parameters<typeof FormulaCard>[0]['onAppend']
  appendDisabled: boolean
  canReturnToGraph: boolean
  onReturnToGraph: () => void
}) {
  return (
    <section className="breeding-workspace reverse-workspace">
      <div className="reverse-controls">
        <PalPicker
          id="reverse-target"
          label="选择目标子代"
          pals={pals}
          selectedId={target}
          onSelect={setTarget}
        />
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="筛选反查亲本"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="在全部亲本中搜索"
            spellCheck={false}
          />
        </label>
        {canReturnToGraph && (
          <button type="button" className="quiet-button" onClick={onReturnToGraph}>
            返回配种图
          </button>
        )}
      </div>
      {!target ? (
        <div className="result-placeholder"><h2>请选择目标子代</h2></div>
      ) : (
        <>
          <div className="reverse-summary">
            <strong>{recipes.length}</strong>
            <span> 条亲本公式 · 第 {page}/{pages} 页</span>
          </div>
          <div className="result-list reverse-list">
            {pageItems.map((recipe, index) => (
              <FormulaCard
                key={`${recipe.parentAId}-${recipe.parentBId}-${index}`}
                recipe={recipe}
                palsById={palsById}
                onAppend={onAppend}
                appendDisabled={appendDisabled}
              />
            ))}
          </div>
          <div className="pagination">
            <button
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              上一页
            </button>
            <span>{page} / {pages}</span>
            <button
              disabled={page >= pages}
              onClick={() => setPage((current) => current + 1)}
            >
              下一页
            </button>
          </div>
        </>
      )}
    </section>
  )
}
