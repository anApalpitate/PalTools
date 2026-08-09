import { LocalPalImage } from '../../components/pal-ui'
import type { BreedingRecipeMatch, PalRecord } from '../../domain/types'

export function FormulaCard({
  recipe,
  palsById,
  displayParents,
  inBag = false,
  bagReady = true,
  onAddToBag,
}: {
  recipe: BreedingRecipeMatch
  palsById: ReadonlyMap<string, PalRecord>
  displayParents?: [string, string]
  inBag?: boolean
  bagReady?: boolean
  onAddToBag?: (recipe: BreedingRecipeMatch) => void
}) {
  const firstId = displayParents?.[0] ?? recipe.parentAId
  const secondId = displayParents?.[1] ?? recipe.parentBId
  const parentA = palsById.get(firstId)
  const parentB = palsById.get(secondId)
  const child = palsById.get(recipe.childId)
  if (!parentA || !parentB || !child) return null

  return (
    <article className="result-card">
      <span className="result-kind">
        {recipe.parentAId === recipe.parentBId ? '同种配种' : '正式版配方'}
      </span>
      <div
        className="breeding-equation"
        aria-label={`${parentA.name.zhHans}加${parentB.name.zhHans}得到${child.name.zhHans}`}
      >
        <FormulaPal pal={parentA} role="亲本 A" />
        <span className="formula-operator" aria-hidden="true">+</span>
        <FormulaPal pal={parentB} role="亲本 B" />
        <span
          className="formula-operator formula-operator--arrow"
          aria-hidden="true"
        >
          →
        </span>
        <FormulaPal pal={child} role="子代" />
      </div>
      {onAddToBag && (
        <button
          className={`bag-add-button ${inBag ? 'is-added' : ''}`}
          disabled={!bagReady || inBag}
          onClick={() => onAddToBag(recipe)}
        >
          {inBag ? '✓ 已在关系背包' : bagReady ? '加入关系背包' : '关系背包载入中'}
        </button>
      )}
    </article>
  )
}

function FormulaPal({ pal, role }: { pal: PalRecord; role: string }) {
  return (
    <div className="formula-pal">
      <LocalPalImage pal={pal} size="formula" />
      <strong>{pal.name.zhHans}</strong>
      <small>{role}</small>
    </div>
  )
}
