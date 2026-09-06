import type { Dispatch, SetStateAction } from 'react'
import { PalPicker } from '../../components/PalPicker'
import type {
  BreedingRecipeSortDirection,
  BreedingRecipeSortKey,
} from '../../domain/pals'
import type { BreedingRecipeMatch, PalRecord } from '../../domain/types'
import { FormulaCard } from './BreedingComponents'
import { RecipeQueryOptions } from './RecipeQueryOptions'

interface ReverseBreedingPanelProps {
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
  recipes: BreedingRecipeMatch[]
  pageItems: BreedingRecipeMatch[]
  setTarget: (id: string) => void
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

export function ReverseBreedingPanel({
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
  selectedAvatarKey,
  onAvatarActivate,
}: ReverseBreedingPanelProps) {
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
            name="reverse-recipe-search"
            autoComplete="off"
            placeholder="在全部亲本中搜索…"
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
                    avatarScope="reverse"
                    selectedAvatarKey={selectedAvatarKey}
                    onAvatarActivate={onAvatarActivate}
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
