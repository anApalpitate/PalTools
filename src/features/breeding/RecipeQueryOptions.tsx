import type {
  BreedingRecipeSortDirection,
  BreedingRecipeSortKey,
} from '../../domain/pals'

interface RecipeQueryOptionsProps {
  scope: string
  excludeLegendary: boolean
  excludeSelfBreeding: boolean
  sortKey: BreedingRecipeSortKey
  sortDirection: BreedingRecipeSortDirection
  setExcludeLegendary: (value: boolean) => void
  setExcludeSelfBreeding: (value: boolean) => void
  setSortKey: (value: BreedingRecipeSortKey) => void
  setSortDirection: (value: BreedingRecipeSortDirection) => void
}

export function RecipeQueryOptions({
  scope,
  excludeLegendary,
  excludeSelfBreeding,
  sortKey,
  sortDirection,
  setExcludeLegendary,
  setExcludeSelfBreeding,
  setSortKey,
  setSortDirection,
}: RecipeQueryOptionsProps) {
  return (
    <div className="recipe-query-options" aria-label={`${scope}选项`}>
      <div className="recipe-filter-icons" aria-label={`${scope}配方过滤`}>
        <RecipeFilterToggle
          scope={scope}
          label="排除传说帕鲁"
          pressed={excludeLegendary}
          symbol="传"
          idleText="排除传说"
          activeText="已排除传说"
          onToggle={() => setExcludeLegendary(!excludeLegendary)}
        />
        <RecipeFilterToggle
          scope={scope}
          label="排除同种配种"
          pressed={excludeSelfBreeding}
          symbol="同"
          idleText="排除自交"
          activeText="已排除自交"
          onToggle={() => setExcludeSelfBreeding(!excludeSelfBreeding)}
        />
      </div>
      <div className="recipe-sort-field">
        <div className="recipe-sort-controls">
          <button
            type="button"
            className="recipe-sort-key"
            aria-label={`${scope}配方排序：${sortKey === 'paldexNo' ? '按编号' : '按稀有度'}`}
            title={sortKey === 'paldexNo' ? '按编号，点击切换为按稀有度' : '按稀有度，点击切换为按编号'}
            onClick={() => setSortKey(sortKey === 'paldexNo' ? 'averageRarity' : 'paldexNo')}
          >
            {sortKey === 'paldexNo' ? '按编号' : '按稀有度'}
          </button>
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

function RecipeFilterToggle({
  scope,
  label,
  pressed,
  symbol,
  idleText,
  activeText,
  onToggle,
}: {
  scope: string
  label: string
  pressed: boolean
  symbol: string
  idleText: string
  activeText: string
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
      <span className="recipe-filter-symbol" aria-hidden="true">{symbol}</span>
      <span>{pressed ? activeText : idleText}</span>
    </button>
  )
}
