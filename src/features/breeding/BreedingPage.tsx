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
  BreedingRecipeMatch,
  PalRecord,
} from '../../domain/types'
import { FormulaCard } from './BreedingComponents'
import { SolutionWorkspace } from './SolutionWorkspace'
import { useBreedingWorkspace } from './useBreedingWorkspace'

type BreedingMode = 'forward' | 'reverse' | 'solution'

interface BreedingPageProps {
  pals: PalRecord[]
  breedingIndex: BreedingIndexPayload | null
  datasetVersion?: string
}

export function BreedingPage({
  pals,
  breedingIndex,
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
  const workspaceController = useBreedingWorkspace(breedingIndex, datasetVersion)
  const bagRecipeIndexes = useMemo(
    () => new Set(workspaceController.workspace?.relations.filter((relation) => relation.inBag).map((relation) => relation.recipeIndex) ?? []),
    [workspaceController.workspace],
  )
  const addToBag = (recipe: BreedingRecipeMatch) => void workspaceController.addToBag(recipe)

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

  return (
    <main className="breeding-page">
      <section className="page-heading page-heading--breeding">
        <div>
          <p className="eyebrow">BREEDING / 44,851 条无性别公式</p>
          <h1>配种工具</h1>
          <p>正向查询与目标反查均在本机完成。</p>
        </div>
      </section>

      <nav className="breeding-mode-tabs" aria-label="配种功能" role="tablist">
        {([
          ['forward', '双亲查子代'],
          ['reverse', '获取目标帕鲁'],
          ['solution', '配种方案网'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            id={`breeding-tab-${value}`}
            role="tab"
            aria-selected={mode === value}
            aria-controls={`breeding-panel-${value}`}
            tabIndex={mode === value ? 0 : -1}
            className={mode === value ? 'is-active' : ''}
            onClick={() => setMode(value)}
            onKeyDown={(event) => {
              const modes: BreedingMode[] = ['forward', 'reverse', 'solution']
              const current = modes.indexOf(value)
              const next = event.key === 'ArrowRight' ? (current + 1) % modes.length
                : event.key === 'ArrowLeft' ? (current - 1 + modes.length) % modes.length
                  : event.key === 'Home' ? 0 : event.key === 'End' ? modes.length - 1 : -1
              if (next >= 0) {
                event.preventDefault()
                setMode(modes[next])
                document.getElementById(`breeding-tab-${modes[next]}`)?.focus()
              }
            }}
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
        <div role="tabpanel" id="breeding-panel-forward" aria-labelledby="breeding-tab-forward">
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
          bagRecipeIndexes={bagRecipeIndexes}
          onAddToBag={addToBag}
          bagReady={Boolean(workspaceController.workspace)}
        />
        </div>
      ) : mode === 'reverse' ? (
        <div role="tabpanel" id="breeding-panel-reverse" aria-labelledby="breeding-tab-reverse">
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
          bagRecipeIndexes={bagRecipeIndexes}
          onAddToBag={addToBag}
          bagReady={Boolean(workspaceController.workspace)}
        />
        </div>
      ) : (
        <div role="tabpanel" id="breeding-panel-solution" aria-labelledby="breeding-tab-solution">
          <SolutionWorkspace
            pals={pals}
            breedingIndex={breedingIndex}
            datasetVersion={datasetVersion}
            controller={workspaceController}
            onNavigateToQuery={setMode}
          />
        </div>
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
  singleParentId,
  query,
  page,
  pages,
  totalRecipes,
  recipes,
  pageItems,
  setQuery,
  setPage,
  bagRecipeIndexes,
  onAddToBag,
  bagReady,
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
  bagRecipeIndexes: ReadonlySet<number>
  onAddToBag: (recipe: BreedingRecipeMatch) => void
  bagReady: boolean
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
              {pageItems.map((recipe) => {
                const otherParentId = singleParentId
                  ? otherParentIdForRecipe(recipe, singleParentId)
                  : null
                return (
                  <FormulaCard
                    key={recipe.recipeIndex}
                    recipe={recipe}
                    palsById={palsById}
                    displayParents={
                      singleParentId && otherParentId
                        ? [singleParentId, otherParentId]
                        : [parentA, parentB]
                    }
                    inBag={bagRecipeIndexes.has(recipe.recipeIndex)}
                    onAddToBag={onAddToBag}
                    bagReady={bagReady}
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
  bagRecipeIndexes,
  onAddToBag,
  bagReady,
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
  bagRecipeIndexes: ReadonlySet<number>
  onAddToBag: (recipe: BreedingRecipeMatch) => void
  bagReady: boolean
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
            {pageItems.map((recipe) => (
              <FormulaCard
                key={recipe.recipeIndex}
                recipe={recipe}
                palsById={palsById}
                inBag={bagRecipeIndexes.has(recipe.recipeIndex)}
                onAddToBag={onAddToBag}
                bagReady={bagReady}
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
