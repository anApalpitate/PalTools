import { LocalPalImage, RarityStars } from '../../components/pal-ui'
import type { BreedingRecipeMatch, PalRecord } from '../../domain/types'

export function FormulaCard({
  recipe,
  palsById,
  displayParents,
  inBag = false,
  bagReady = true,
  onAddToBag,
  legendaryIds = new Set<string>(),
}: {
  recipe: BreedingRecipeMatch
  palsById: ReadonlyMap<string, PalRecord>
  displayParents?: [string, string]
  inBag?: boolean
  bagReady?: boolean
  onAddToBag?: (recipe: BreedingRecipeMatch) => void
  legendaryIds?: ReadonlySet<string>
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
        <FormulaPal
          pal={parentA}
          role="亲本 A"
          legendary={legendaryIds.has(parentA.internalId)}
        />
        <span className="formula-operator" aria-hidden="true">+</span>
        <FormulaPal
          pal={parentB}
          role="亲本 B"
          legendary={legendaryIds.has(parentB.internalId)}
        />
        <span
          className="formula-operator formula-operator--arrow"
          aria-hidden="true"
        >
          →
        </span>
        <FormulaPal
          pal={child}
          role="子代"
          legendary={legendaryIds.has(child.internalId)}
        />
      </div>
      {onAddToBag && (
        <button
          className={`bag-add-button ${inBag ? 'is-added' : ''}`}
          disabled={!bagReady || inBag}
          onClick={() => onAddToBag(recipe)}
          aria-label={
            inBag
              ? '已加入关系背包'
              : bagReady
                ? '加入关系背包'
                : '关系背包载入中'
          }
          title={
            inBag
              ? '已加入关系背包'
              : bagReady
                ? '加入关系背包'
                : '关系背包载入中'
          }
        >
          <span aria-hidden="true">{inBag ? '✓' : '+'}</span>
        </button>
      )}
    </article>
  )
}

function FormulaPal({
  pal,
  role,
  legendary,
}: {
  pal: PalRecord
  role: string
  legendary: boolean
}) {
  return (
    <div className={`formula-pal ${legendary ? 'is-legendary' : ''}`}>
      {legendary && (
        <span
          className="formula-legendary-mark"
          role="img"
          aria-label="传说帕鲁"
          title="传说帕鲁：只能自交获得"
        >
          ◆
        </span>
      )}
      <LocalPalImage pal={pal} size="formula" />
      <strong>{pal.name.zhHans}</strong>
      <span className="formula-role">{role}</span>
      <span className="formula-rarity">
        <RarityStars rarity={pal.rarity} />
      </span>
    </div>
  )
}
