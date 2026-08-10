import { useEffect, useMemo, useState } from 'react'
import { PalPicker } from '../../components/PalPicker'
import { LocalPalImage } from '../../components/pal-ui'
import {
  filterAndSortBreedingRecipes,
  filterAndSortRecipesForParent,
  legendaryPalIds,
  otherParentIdForRecipe,
  recipeMatchesForChild,
  recipeMatchesForParent,
  recipeMatchesForParents,
} from '../../domain/pals'
import type {
  BreedingRecipeSortDirection,
  BreedingRecipeSortKey,
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
  const [forwardExcludeLegendary, setForwardExcludeLegendary] = useState(false)
  const [forwardExcludeSelfBreeding, setForwardExcludeSelfBreeding] = useState(false)
  const [forwardSortKey, setForwardSortKey] =
    useState<BreedingRecipeSortKey>('paldexNo')
  const [forwardSortDirection, setForwardSortDirection] =
    useState<BreedingRecipeSortDirection>('asc')
  const [forwardPage, setForwardPage] = useState(1)
  const [reverseTarget, setReverseTarget] = useState('')
  const [reverseQuery, setReverseQuery] = useState('')
  const [reverseExcludeLegendary, setReverseExcludeLegendary] = useState(false)
  const [reverseExcludeSelfBreeding, setReverseExcludeSelfBreeding] = useState(false)
  const [reverseSortKey, setReverseSortKey] =
    useState<BreedingRecipeSortKey>('paldexNo')
  const [reverseSortDirection, setReverseSortDirection] =
    useState<BreedingRecipeSortDirection>('asc')
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
  const legendaryIds = useMemo(
    () => breedingIndex ? legendaryPalIds(breedingIndex) : new Set<string>(),
    [breedingIndex],
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
      return filterAndSortBreedingRecipes(
        recipeMatchesForParents(breedingIndex, parentA, parentB),
        palsById,
        {
          legendaryIds,
          excludeLegendary: forwardExcludeLegendary,
          excludeSelfBreeding: forwardExcludeSelfBreeding,
          sortKey: forwardSortKey,
          sortDirection: forwardSortDirection,
          identityIds: (recipe) => [recipe.childId],
        },
      )
    }
    if (singleParentId) {
      return filterAndSortRecipesForParent(
        singleParentAllRecipes,
        singleParentId,
        palsById,
        forwardQuery,
        {
          legendaryIds,
          excludeLegendary: forwardExcludeLegendary,
          excludeSelfBreeding: forwardExcludeSelfBreeding,
          sortKey: forwardSortKey,
          sortDirection: forwardSortDirection,
        },
      )
    }
    return []
  }, [
    breedingIndex,
    forwardExcludeLegendary,
    forwardExcludeSelfBreeding,
    forwardQuery,
    forwardSortDirection,
    forwardSortKey,
    legendaryIds,
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
    const matchingRecipes = recipeMatchesForChild(breedingIndex, reverseTarget)
      .filter((recipe) => {
        if (!queryText) return true
        const parentARecord = palsById.get(recipe.parentAId)
        const parentBRecord = palsById.get(recipe.parentBId)
        return [parentARecord, parentBRecord].some(
          (pal) => pal && matchesPalIdentityQuery(pal, queryText),
        )
      })
    return filterAndSortBreedingRecipes(matchingRecipes, palsById, {
      legendaryIds,
      excludeLegendary: reverseExcludeLegendary,
      excludeSelfBreeding: reverseExcludeSelfBreeding,
      sortKey: reverseSortKey,
      sortDirection: reverseSortDirection,
      identityIds: (recipe) => [recipe.parentAId, recipe.parentBId],
    })
  }, [
    breedingIndex,
    legendaryIds,
    palsById,
    reverseExcludeLegendary,
    reverseExcludeSelfBreeding,
    reverseQuery,
    reverseSortDirection,
    reverseSortKey,
    reverseTarget,
  ])
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
  }, [forwardExcludeLegendary, forwardExcludeSelfBreeding, forwardQuery, forwardSortDirection, forwardSortKey])

  useEffect(() => {
    setReversePage(1)
  }, [reverseExcludeLegendary, reverseExcludeSelfBreeding, reverseQuery, reverseSortDirection, reverseSortKey, reverseTarget])

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
          excludeLegendary={forwardExcludeLegendary}
          excludeSelfBreeding={forwardExcludeSelfBreeding}
          sortKey={forwardSortKey}
          sortDirection={forwardSortDirection}
          page={forwardPage}
          pages={forwardPages}
          totalRecipes={singleParentAllRecipes.length}
          recipes={forwardRecipes}
          pageItems={forwardPageItems}
          setQuery={setForwardQuery}
          setExcludeLegendary={setForwardExcludeLegendary}
          setExcludeSelfBreeding={setForwardExcludeSelfBreeding}
          setSortKey={setForwardSortKey}
          setSortDirection={setForwardSortDirection}
          setPage={setForwardPage}
          bagRecipeIndexes={bagRecipeIndexes}
          onAddToBag={addToBag}
          bagReady={Boolean(workspaceController.workspace)}
          legendaryIds={legendaryIds}
        />
        </div>
      ) : mode === 'reverse' ? (
        <div role="tabpanel" id="breeding-panel-reverse" aria-labelledby="breeding-tab-reverse">
        <ReverseBreeding
          pals={breedingPals}
          palsById={palsById}
          target={reverseTarget}
          query={reverseQuery}
          excludeLegendary={reverseExcludeLegendary}
          excludeSelfBreeding={reverseExcludeSelfBreeding}
          sortKey={reverseSortKey}
          sortDirection={reverseSortDirection}
          page={reversePage}
          pages={reversePages}
          recipes={reverseRecipes}
          pageItems={reversePageItems}
          setTarget={setReverseTarget}
          setQuery={setReverseQuery}
          setExcludeLegendary={setReverseExcludeLegendary}
          setExcludeSelfBreeding={setReverseExcludeSelfBreeding}
          setSortKey={setReverseSortKey}
          setSortDirection={setReverseSortDirection}
          setPage={setReversePage}
          bagRecipeIndexes={bagRecipeIndexes}
          onAddToBag={addToBag}
          bagReady={Boolean(workspaceController.workspace)}
          legendaryIds={legendaryIds}
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
  excludeLegendary,
  excludeSelfBreeding,
  sortKey,
  sortDirection,
  page,
  pages,
  totalRecipes,
  recipes,
  pageItems,
  setQuery,
  setExcludeLegendary,
  setExcludeSelfBreeding,
  setSortKey,
  setSortDirection,
  setPage,
  bagRecipeIndexes,
  onAddToBag,
  bagReady,
  legendaryIds,
}: {
  pals: PalRecord[]
  palsById: ReadonlyMap<string, PalRecord>
  parentA: string
  parentB: string
  setParentA: (id: string) => void
  setParentB: (id: string) => void
  singleParentId: string
  query: string
  excludeLegendary: boolean
  excludeSelfBreeding: boolean
  sortKey: BreedingRecipeSortKey
  sortDirection: BreedingRecipeSortDirection
  page: number
  pages: number
  totalRecipes: number
  recipes: ReturnType<typeof recipeMatchesForParents>
  pageItems: ReturnType<typeof recipeMatchesForParents>
  setQuery: (value: string) => void
  setExcludeLegendary: (value: boolean) => void
  setExcludeSelfBreeding: (value: boolean) => void
  setSortKey: (value: BreedingRecipeSortKey) => void
  setSortDirection: (value: BreedingRecipeSortDirection) => void
  setPage: React.Dispatch<React.SetStateAction<number>>
  bagRecipeIndexes: ReadonlySet<number>
  onAddToBag: (recipe: BreedingRecipeMatch) => void
  bagReady: boolean
  legendaryIds: ReadonlySet<string>
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
        {(parentA || parentB) && (
          <div className="recipe-query-toolbar">
            {singleParentId && (
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
            )}
            <RecipeQueryOptions
              scope="正向查询"
              excludeLegendary={excludeLegendary}
              excludeSelfBreeding={excludeSelfBreeding}
              sortKey={sortKey}
              sortDirection={sortDirection}
              setExcludeLegendary={setExcludeLegendary}
              setExcludeSelfBreeding={setExcludeSelfBreeding}
              legendaryIconPal={palsById.get('JetDragon')}
              selfBreedingIconPal={palsById.get('PinkCat')}
              setSortKey={setSortKey}
              setSortDirection={setSortDirection}
            />
            {singleParentId && (
              <div className="reverse-summary" aria-live="polite">
                <strong>{recipes.length}</strong>
                <span>
                  {' '}条匹配配方 · 共 {totalRecipes} 条 · 第 {page}/{pages} 页
                </span>
              </div>
            )}
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
                  : excludeLegendary || excludeSelfBreeding
                    ? '没有符合筛选条件的配方'
                    : '该亲本没有可用配方'
                : excludeLegendary || excludeSelfBreeding
                  ? '没有符合筛选条件的配方'
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
                    legendaryIds={legendaryIds}
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
  excludeLegendary,
  excludeSelfBreeding,
  sortKey,
  sortDirection,
  page,
  pages,
  recipes,
  pageItems,
  setTarget,
  setQuery,
  setExcludeLegendary,
  setExcludeSelfBreeding,
  setSortKey,
  setSortDirection,
  setPage,
  bagRecipeIndexes,
  onAddToBag,
  bagReady,
  legendaryIds,
}: {
  pals: PalRecord[]
  palsById: ReadonlyMap<string, PalRecord>
  target: string
  query: string
  excludeLegendary: boolean
  excludeSelfBreeding: boolean
  sortKey: BreedingRecipeSortKey
  sortDirection: BreedingRecipeSortDirection
  page: number
  pages: number
  recipes: ReturnType<typeof recipeMatchesForChild>
  pageItems: ReturnType<typeof recipeMatchesForChild>
  setTarget: (id: string) => void
  setQuery: (value: string) => void
  setExcludeLegendary: (value: boolean) => void
  setExcludeSelfBreeding: (value: boolean) => void
  setSortKey: (value: BreedingRecipeSortKey) => void
  setSortDirection: (value: BreedingRecipeSortDirection) => void
  setPage: React.Dispatch<React.SetStateAction<number>>
  bagRecipeIndexes: ReadonlySet<number>
  onAddToBag: (recipe: BreedingRecipeMatch) => void
  bagReady: boolean
  legendaryIds: ReadonlySet<string>
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
        <RecipeQueryOptions
          scope="目标反查"
          excludeLegendary={excludeLegendary}
          excludeSelfBreeding={excludeSelfBreeding}
          sortKey={sortKey}
          sortDirection={sortDirection}
          setExcludeLegendary={setExcludeLegendary}
          setExcludeSelfBreeding={setExcludeSelfBreeding}
          legendaryIconPal={palsById.get('JetDragon')}
          selfBreedingIconPal={palsById.get('PinkCat')}
          setSortKey={setSortKey}
          setSortDirection={setSortDirection}
        />
      </div>
      {!target ? (
        <div className="result-placeholder"><h2>请选择目标子代</h2></div>
      ) : (
        <>
          <div className="reverse-summary">
            <strong>{recipes.length}</strong>
            <span> 条亲本公式 · 第 {page}/{pages} 页</span>
          </div>
          {recipes.length === 0 ? (
            <div className="result-placeholder">
              <h2>没有符合筛选条件的配方</h2>
            </div>
          ) : (
            <>
              <div className="result-list reverse-list">
                {pageItems.map((recipe) => (
                  <FormulaCard
                    key={recipe.recipeIndex}
                    recipe={recipe}
                    palsById={palsById}
                    inBag={bagRecipeIndexes.has(recipe.recipeIndex)}
                    onAddToBag={onAddToBag}
                    bagReady={bagReady}
                    legendaryIds={legendaryIds}
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
        </>
      )}
    </section>
  )
}

function RecipeQueryOptions({
  scope,
  excludeLegendary,
  excludeSelfBreeding,
  sortKey,
  sortDirection,
  setExcludeLegendary,
  setExcludeSelfBreeding,
  legendaryIconPal,
  selfBreedingIconPal,
  setSortKey,
  setSortDirection,
}: {
  scope: string
  excludeLegendary: boolean
  excludeSelfBreeding: boolean
  sortKey: BreedingRecipeSortKey
  sortDirection: BreedingRecipeSortDirection
  setExcludeLegendary: (value: boolean) => void
  setExcludeSelfBreeding: (value: boolean) => void
  legendaryIconPal?: PalRecord
  selfBreedingIconPal?: PalRecord
  setSortKey: (value: BreedingRecipeSortKey) => void
  setSortDirection: (value: BreedingRecipeSortDirection) => void
}) {
  return (
    <div className="recipe-query-options" aria-label={`${scope}选项`}>
      <div className="recipe-filter-icons" aria-label={`${scope}配方过滤`}>
        <FilterIconToggle
          scope={scope}
          label="排除传说帕鲁"
          pressed={excludeLegendary}
          pal={legendaryIconPal}
          onToggle={() => setExcludeLegendary(!excludeLegendary)}
        />
        <FilterIconToggle
          scope={scope}
          label="排除同种配种"
          pressed={excludeSelfBreeding}
          pal={selfBreedingIconPal}
          onToggle={() => setExcludeSelfBreeding(!excludeSelfBreeding)}
        />
      </div>
      <div className="recipe-sort-field">
        <span>配方排序</span>
        <div className="recipe-sort-controls">
          <select
            aria-label={`${scope}配方排序`}
            value={sortKey}
            onChange={(event) =>
              setSortKey(event.target.value as BreedingRecipeSortKey)
            }
          >
            <option value="paldexNo">按编号</option>
            <option value="averageRarity">按平均稀有度</option>
          </select>
          <button
            type="button"
            className="recipe-sort-direction"
            aria-label={`${scope}配方排序方向：${sortDirection === 'asc' ? '正序' : '倒序'}`}
            aria-pressed={sortDirection === 'desc'}
            title={sortDirection === 'asc' ? '正序，点击切换为倒序' : '倒序，点击切换为正序'}
            onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
          >
            <span aria-hidden="true">{sortDirection === 'asc' ? '▲' : '▼'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function FilterIconToggle({
  scope,
  label,
  pressed,
  pal,
  onToggle,
}: {
  scope: string
  label: string
  pressed: boolean
  pal?: PalRecord
  onToggle: () => void
}) {
  const description = pressed ? `已${label}，点击取消` : label
  return (
    <button
      type="button"
      className="recipe-filter-icon"
      aria-label={`${scope}${description}`}
      aria-pressed={pressed}
      title={description}
      onClick={onToggle}
    >
      {pal ? <LocalPalImage pal={pal} size="mini" /> : <span className="recipe-filter-fallback" aria-hidden="true">◇</span>}
      {pressed && <span className="recipe-filter-slash" aria-hidden="true" />}
    </button>
  )
}
