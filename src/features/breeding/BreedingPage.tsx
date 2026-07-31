import { useEffect, useMemo, useState } from 'react'
import { PalPicker } from '../../components/PalPicker'
import {
  filterAndSortRecipesForParent,
  otherParentIdForRecipe,
  recipesForChild,
  recipesForParent,
  recipesForParents,
} from '../../domain/pals'
import { matchesPalIdentityQuery } from '../../domain/search'
import type {
  BreedingIndexPayload,
  PalRecord,
} from '../../domain/types'
import type { BreedingGraphStorageState } from '../../hooks/useBreedingGraphStorage'
import { FormulaCard } from './BreedingComponents'

type BreedingMode = 'forward' | 'reverse' | 'graph'

interface BreedingPageProps {
  pals: PalRecord[]
  breedingIndex: BreedingIndexPayload | null
  graphStorage: BreedingGraphStorageState
}

export function BreedingPage({
  pals,
  breedingIndex,
  graphStorage,
}: BreedingPageProps) {
  const [mode, setMode] = useState<BreedingMode>('forward')
  const [parentA, setParentA] = useState('')
  const [parentB, setParentB] = useState('')
  const [forwardQuery, setForwardQuery] = useState('')
  const [forwardPage, setForwardPage] = useState(1)
  const [reverseTarget, setReverseTarget] = useState('')
  const [reverseQuery, setReverseQuery] = useState('')
  const [reversePage, setReversePage] = useState(1)

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
  const singleParentId =
    parentA && !parentB ? parentA : parentB && !parentA ? parentB : ''
  const singleParentAllRecipes = useMemo(
    () =>
      breedingIndex && singleParentId
        ? recipesForParent(breedingIndex, singleParentId)
        : [],
    [breedingIndex, singleParentId],
  )
  const forwardRecipes = useMemo(() => {
    if (!breedingIndex) return []
    if (parentA && parentB) {
      return recipesForParents(breedingIndex, parentA, parentB)
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
          ['reverse', '子代反查亲本'],
          ['graph', '帕鲁配种图'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            className={mode === value ? 'is-active' : ''}
            onClick={() => setMode(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      {mode === 'graph' ? (
        <BreedingGraphPlaceholder storage={graphStorage} />
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
        />
      )}
    </main>
  )
}

function BreedingGraphPlaceholder({
  storage,
}: {
  storage: BreedingGraphStorageState
}) {
  const statusText =
    storage.status === 'error'
      ? `本机图数据仓储初始化失败：${storage.error}`
      : storage.status === 'ready'
        ? '本机图数据仓储已就绪。'
        : '正在初始化本机图数据仓储…'

  return (
    <section className="breeding-workspace breeding-graph-placeholder">
      <div className="result-placeholder">
        <span aria-hidden="true">◇</span>
        <h2>帕鲁配种图</h2>
        <p>可编辑画布将在后续阶段开放。</p>
        <p role={storage.status === 'error' ? 'alert' : 'status'}>
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
  recipes: ReturnType<typeof recipesForParents>
  pageItems: ReturnType<typeof recipesForParents>
  setQuery: (value: string) => void
  setPage: React.Dispatch<React.SetStateAction<number>>
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
