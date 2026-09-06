import type { Dispatch, SetStateAction } from 'react'
import { PalPicker } from '../../components/PalPicker'
import { otherParentIdForRecipe } from '../../domain/pals'
import type {
  BreedingRecipeSortDirection,
  BreedingRecipeSortKey,
} from '../../domain/pals'
import type { BreedingRecipeMatch, PalRecord } from '../../domain/types'
import { FormulaCard } from './BreedingComponents'
import { RecipeQueryOptions } from './RecipeQueryOptions'

interface ForwardBreedingPanelProps {
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
  recipes: BreedingRecipeMatch[]
  pageItems: BreedingRecipeMatch[]
  setQuery: (value: string) => void
  setExcludeLegendary: (value: boolean) => void
  setExcludeSelfBreeding: (value: boolean) => void
  setSortKey: (value: BreedingRecipeSortKey) => void
  setSortDirection: (value: BreedingRecipeSortDirection) => void
  setPage: Dispatch<SetStateAction<number>>
  bagRecipeIndexes: ReadonlySet<number>
  onAddToBag: (recipe: BreedingRecipeMatch) => void
  bagReady: boolean
  legendaryIds: ReadonlySet<string>
  selectedAvatarKey: string
  onAvatarActivate: (key: string, palId: string) => void
}

export function ForwardBreedingPanel({
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
  selectedAvatarKey,
  onAvatarActivate,
}: ForwardBreedingPanelProps) {
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
          data-tooltip="交换两只亲本"
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
                  name="forward-recipe-search"
                  autoComplete="off"
                  placeholder="搜索另一亲本或子代…"
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
                    avatarScope="forward"
                    selectedAvatarKey={selectedAvatarKey}
                    onAvatarActivate={onAvatarActivate}
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
