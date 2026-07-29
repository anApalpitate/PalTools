import { useEffect, useMemo, useRef, useState } from 'react'
import { PalPicker } from '../../components/PalPicker'
import {
  recipesForChild,
  recipesForParents,
} from '../../domain/pals'
import { matchesPalIdentityQuery } from '../../domain/search'
import type { PathPlanResult } from '../../domain/breeding-path'
import type {
  AppConfig,
  BreedingIndexPayload,
  PalRecord,
} from '../../domain/types'
import type { OwnedPalsState } from '../../hooks/useOwnedPals'
import {
  BreedingTreeView,
  FormulaCard,
  MultiPalSelector,
} from './BreedingComponents'

type BreedingMode = 'forward' | 'reverse' | 'path'
type PathMode = 'minimum' | 'exact'
type StartSource = 'owned' | 'temporary'

interface BreedingPageProps {
  pals: PalRecord[]
  breedingIndex: BreedingIndexPayload | null
  appConfig: AppConfig
  owned: OwnedPalsState
  onOpenSettings: () => void
}

export function BreedingPage({
  pals,
  breedingIndex,
  appConfig,
  owned,
  onOpenSettings,
}: BreedingPageProps) {
  const [mode, setMode] = useState<BreedingMode>('forward')
  const [parentA, setParentA] = useState('')
  const [parentB, setParentB] = useState('')
  const [reverseTarget, setReverseTarget] = useState('')
  const [reverseQuery, setReverseQuery] = useState('')
  const [reversePage, setReversePage] = useState(1)
  const [temporaryIds, setTemporaryIds] = useState<string[]>([])
  const [startSource, setStartSource] = useState<StartSource>('owned')
  const [pathTarget, setPathTarget] = useState('')
  const [pathMode, setPathMode] = useState<PathMode>('minimum')
  const [exactGeneration, setExactGeneration] = useState(1)
  const [pathResult, setPathResult] = useState<PathPlanResult | null>(null)
  const [pathPending, setPathPending] = useState(false)
  const [selectedTreeNode, setSelectedTreeNode] = useState('')
  const [preferredRecipes, setPreferredRecipes] = useState<Record<string, number>>({})
  const requestId = useRef(0)

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
  const forwardRecipes = useMemo(
    () =>
      breedingIndex && parentA && parentB
        ? recipesForParents(breedingIndex, parentA, parentB)
        : [],
    [breedingIndex, parentA, parentB],
  )
  const reverseRecipes = useMemo(() => {
    if (!breedingIndex || !reverseTarget) return []
    const queryText = reverseQuery.trim().toLocaleLowerCase('zh-CN')
    return recipesForChild(breedingIndex, reverseTarget)
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
  const activeStartIds =
    startSource === 'owned' ? owned.ownedIds : temporaryIds

  useEffect(() => {
    setReversePage(1)
  }, [reverseTarget, reverseQuery])

  useEffect(() => {
    const max = appConfig.pathPlanner.maxExactGeneration
    if (exactGeneration > max) {
      setExactGeneration(max)
      setPreferredRecipes({})
      setPathResult(null)
    }
  }, [appConfig, exactGeneration])

  useEffect(() => {
    if (mode !== 'path' || !breedingIndex || !pathTarget) {
      setPathResult(null)
      return
    }
    const currentRequest = ++requestId.current
    const worker = new Worker(
      new URL('../../workers/breeding-path.worker.ts', import.meta.url),
      { type: 'module' },
    )
    setPathPending(true)
    worker.onmessage = (
      event: MessageEvent<{ requestId: number; result: PathPlanResult }>,
    ) => {
      if (event.data.requestId !== requestId.current) return
      setPathResult(event.data.result)
      setPathPending(false)
    }
    worker.onerror = () => {
      if (currentRequest !== requestId.current) return
      setPathPending(false)
      setPathResult({
        status: 'unreachable',
        minGeneration: null,
        tree: null,
        message: '路径计算器发生错误。',
      })
    }
    worker.postMessage({
      requestId: currentRequest,
      payload: {
        index: breedingIndex,
        startIds: activeStartIds,
        targetId: pathTarget,
        mode: pathMode,
        exactGeneration,
        maxDisplayGeneration: appConfig.pathPlanner.maxExactGeneration,
        preferredRecipes,
      },
    })
    return () => worker.terminate()
  }, [
    mode,
    breedingIndex,
    pathTarget,
    pathMode,
    exactGeneration,
    activeStartIds,
    appConfig,
    preferredRecipes,
  ])

  const navigateToMode = (nextMode: BreedingMode) => {
    if (nextMode === mode) return
    if (mode === 'path' && !owned.confirmLeave()) return
    setMode(nextMode)
  }

  return (
    <main>
      <section className="page-heading page-heading--breeding">
        <div>
          <p className="eyebrow">BREEDING / 44,851 条无性别公式</p>
          <h1>配种工具</h1>
          <p>正向查询、目标反查与六代路径规划均在本机完成。</p>
        </div>
      </section>

      <nav className="breeding-mode-tabs" aria-label="配种功能">
        {([
          ['forward', '双亲查子代'],
          ['reverse', '子代反查亲本'],
          ['path', '路径规划'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            className={mode === value ? 'is-active' : ''}
            onClick={() => navigateToMode(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      {!breedingIndex ? (
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
          recipes={forwardRecipes}
        />
      ) : mode === 'reverse' ? (
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
        />
      ) : (
        <section className="breeding-workspace path-workspace">
          <div className="path-controls">
            <div
              className="segmented-control"
              role="group"
              aria-label="起点集合来源"
            >
              <button
                className={startSource === 'owned' ? 'is-active' : ''}
                onClick={() => setStartSource('owned')}
              >
                已拥有（本机保存）
              </button>
              <button
                className={startSource === 'temporary' ? 'is-active' : ''}
                onClick={() => setStartSource('temporary')}
              >
                临时起点
              </button>
            </div>
            <MultiPalSelector
              pals={breedingPals}
              selectedIds={activeStartIds}
              onChange={
                startSource === 'owned' ? owned.setOwnedIds : setTemporaryIds
              }
              label={
                startSource === 'owned'
                  ? '添加已拥有帕鲁'
                  : '添加临时起点'
              }
              saveAction={
                startSource === 'owned'
                  ? {
                      dirty: owned.dirty,
                      saved: owned.savedFeedback,
                      onSave: owned.save,
                    }
                  : undefined
              }
            />
            <div
              className={`path-query-grid ${
                pathMode === 'minimum' ? 'path-query-grid--minimum' : ''
              }`}
            >
              <PalPicker
                id="path-target"
                label="目标子代"
                pals={breedingPals}
                selectedId={pathTarget}
                onSelect={(id) => {
                  setPathTarget(id)
                  setPreferredRecipes({})
                  setSelectedTreeNode('')
                }}
              />
              <label className="field">
                <span>规划方式</span>
                <select
                  aria-label="规划方式"
                  value={pathMode}
                  onChange={(event) => {
                    setPathMode(event.target.value as PathMode)
                    setPreferredRecipes({})
                  }}
                >
                  <option value="minimum">最少代数</option>
                  <option value="exact">指定 N 代</option>
                </select>
              </label>
              {pathMode === 'exact' && (
                <label className="field">
                  <span>
                    指定代数（上限 {appConfig.pathPlanner.maxExactGeneration}）
                  </span>
                  <input
                    aria-label="指定代数"
                    type="number"
                    min="1"
                    max={appConfig.pathPlanner.maxExactGeneration}
                    value={exactGeneration}
                    onChange={(event) => {
                      const next = Math.max(
                        1,
                        Math.min(
                          appConfig.pathPlanner.maxExactGeneration,
                          Number(event.target.value) || 1,
                        ),
                      )
                      setExactGeneration(next)
                      setPreferredRecipes({})
                    }}
                  />
                </label>
              )}
            </div>
            <p className="path-limit-note">
              当前可视化上限：{appConfig.pathPlanner.maxExactGeneration} 代。
              <button onClick={onOpenSettings}>前往设置</button>
            </p>
          </div>
          <div className="path-result">
            {!pathTarget ? (
              <div className="result-placeholder">
                <h2>请选择目标和第 0 代集合</h2>
              </div>
            ) : pathPending ? (
              <div className="result-placeholder">
                <h2>正在计算配种路径…</h2>
              </div>
            ) : pathResult ? (
              <>
                <div className={`path-status path-status--${pathResult.status}`}>
                  <strong>
                    {pathResult.minGeneration === null
                      ? '—'
                      : `${pathResult.minGeneration} 代`}
                  </strong>
                  <span>{pathResult.message}</span>
                </div>
                {pathResult.tree && (
                  <BreedingTreeView
                    tree={pathResult.tree}
                    palsById={palsById}
                    index={breedingIndex}
                    selectedNodeId={selectedTreeNode}
                    onSelectNode={setSelectedTreeNode}
                    onChooseAlternative={(nodeId, recipeIndex) => {
                      if (
                        pathMode === 'minimum' &&
                        pathResult.minGeneration !== null
                      ) {
                        setPathMode('exact')
                        setExactGeneration(pathResult.minGeneration)
                      }
                      setPreferredRecipes((current) => ({
                        ...current,
                        [nodeId]: recipeIndex,
                      }))
                    }}
                  />
                )}
              </>
            ) : null}
          </div>
        </section>
      )}
    </main>
  )
}

function ForwardBreeding({
  pals,
  palsById,
  parentA,
  parentB,
  setParentA,
  setParentB,
  recipes,
}: {
  pals: PalRecord[]
  palsById: ReadonlyMap<string, PalRecord>
  parentA: string
  parentB: string
  setParentA: (id: string) => void
  setParentB: (id: string) => void
  recipes: ReturnType<typeof recipesForParents>
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
        {!parentA || !parentB ? (
          <div className="result-placeholder">
            <span>◇</span><h2>等待选择两只亲本</h2>
          </div>
        ) : recipes.length === 0 ? (
          <div className="result-placeholder"><h2>当前组合没有结果</h2></div>
        ) : (
          <div className="result-list">
            {recipes.map((recipe) => (
              <FormulaCard
                key={recipe.childId}
                recipe={recipe}
                palsById={palsById}
                displayParents={[parentA, parentB]}
              />
            ))}
          </div>
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
}: {
  pals: PalRecord[]
  palsById: ReadonlyMap<string, PalRecord>
  target: string
  query: string
  page: number
  pages: number
  recipes: ReturnType<typeof recipesForChild>
  pageItems: ReturnType<typeof recipesForChild>
  setTarget: (id: string) => void
  setQuery: (value: string) => void
  setPage: React.Dispatch<React.SetStateAction<number>>
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
          />
        </label>
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
