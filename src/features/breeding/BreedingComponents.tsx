import { RarityStars } from '../../components/pal-ui'
import type { BreedingRecipeMatch, PalRecord } from '../../domain/types'
import { BreedingPalAvatar } from './BreedingPalAvatar'

export function FormulaCard({
  recipe,
  palsById,
  displayParents,
  inBag = false,
  bagReady = true,
  onAddToBag,
  legendaryIds = new Set<string>(),
  avatarScope,
  selectedAvatarKey,
  onAvatarActivate,
}: {
  recipe: BreedingRecipeMatch
  palsById: ReadonlyMap<string, PalRecord>
  displayParents?: [string, string]
  inBag?: boolean
  bagReady?: boolean
  onAddToBag?: (recipe: BreedingRecipeMatch) => void
  legendaryIds?: ReadonlySet<string>
  avatarScope: 'forward' | 'reverse'
  selectedAvatarKey: string
  onAvatarActivate: (key: string, palId: string) => void
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
          avatarKey={`${avatarScope}:${recipe.recipeIndex}:parentA`}
          selectedAvatarKey={selectedAvatarKey}
          onAvatarActivate={onAvatarActivate}
        />
        <span className="formula-operator" aria-hidden="true">+</span>
        <FormulaPal
          pal={parentB}
          role="亲本 B"
          legendary={legendaryIds.has(parentB.internalId)}
          avatarKey={`${avatarScope}:${recipe.recipeIndex}:parentB`}
          selectedAvatarKey={selectedAvatarKey}
          onAvatarActivate={onAvatarActivate}
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
          avatarKey={`${avatarScope}:${recipe.recipeIndex}:child`}
          selectedAvatarKey={selectedAvatarKey}
          onAvatarActivate={onAvatarActivate}
        />
      </div>
      {onAddToBag && (
        <button
          className={`bag-add-button ${inBag ? 'is-added' : ''}`}
          disabled={!bagReady || inBag}
          onClick={() => onAddToBag(recipe)}
          aria-label={
            inBag
              ? '已加入配方背包'
              : bagReady
                ? '加入配方背包'
                : '配方背包载入中'
          }
          data-tooltip={
            inBag
              ? '已加入配方背包'
              : bagReady
                ? '加入配方背包'
                : '配方背包载入中'
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
  avatarKey,
  selectedAvatarKey,
  onAvatarActivate,
}: {
  pal: PalRecord
  role: string
  legendary: boolean
  avatarKey: string
  selectedAvatarKey: string
  onAvatarActivate: (key: string, palId: string) => void
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
      <BreedingPalAvatar
        mode="interactive"
        pal={pal}
        size="formula"
        selected={selectedAvatarKey === avatarKey}
        onActivate={() => onAvatarActivate(avatarKey, pal.internalId)}
      />
      <strong>{pal.name.zhHans}</strong>
      <span className="formula-role">{role}</span>
      <span className="formula-rarity">
        <RarityStars rarity={pal.rarity} />
      </span>
    </div>
  )
}
