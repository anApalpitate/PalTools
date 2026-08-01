import { LocalPalImage } from '../../components/pal-ui'
import type { BreedingRecipeMatch, PalRecord } from '../../domain/types'

export function FormulaCard({
  recipe,
  palsById,
  displayParents,
  onAppend,
  appendDisabled = false,
}: {
  recipe: BreedingRecipeMatch
  palsById: ReadonlyMap<string, PalRecord>
  displayParents?: [string, string]
  onAppend?: (recipe: BreedingRecipeMatch) => void
  appendDisabled?: boolean
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
      {onAppend && (
        <button
          type="button"
          className="recipe-append-button quiet-button"
          disabled={appendDisabled}
          onClick={() => onAppend(recipe)}
          aria-label={`追加到配种图 ${parentA.name.zhHans} 加 ${parentB.name.zhHans} 得到 ${child.name.zhHans}`}
        >
          追加到配种图
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
