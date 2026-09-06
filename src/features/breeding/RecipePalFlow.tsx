import type { BreedingRecipeMatch, PalRecord } from '../../domain/types'
import { BreedingPalAvatar } from './BreedingPalAvatar'

interface RecipePalFlowProps {
  recipe: Pick<
    BreedingRecipeMatch,
    'recipeIndex' | 'parentAId' | 'parentBId' | 'childId'
  >
  palsById: ReadonlyMap<string, PalRecord>
  variant?: 'detail' | 'bag'
  scope: 'bag' | 'steps' | 'relations'
  selectedAvatarKey: string
  onAvatarActivate: (key: string, palId: string) => void
}

export function RecipePalFlow({
  recipe,
  palsById,
  variant = 'detail',
  scope,
  selectedAvatarKey,
  onAvatarActivate,
}: RecipePalFlowProps) {
  const name = (id: string) => palsById.get(id)?.name.zhHans ?? id
  const chip = (
    id: string,
    role: '亲本' | '子代',
    slot: 'parentA' | 'parentB' | 'child',
  ) => {
    const pal = palsById.get(id)
    const avatarKey = `${scope}:${recipe.recipeIndex}:${slot}`
    return (
      <div className={`workspace-recipe-pal workspace-recipe-pal--${role === '子代' ? 'child' : 'parent'} ${variant === 'bag' ? 'workspace-recipe-pal--stacked' : ''}`} title={`${role}：${name(id)}`}>
        {pal ? (
          <BreedingPalAvatar mode="interactive" pal={pal} size="mini" selected={selectedAvatarKey === avatarKey} onActivate={() => onAvatarActivate(avatarKey, id)} />
        ) : (
          <span className="workspace-recipe-image-fallback" role="img" aria-label={`${name(id)}图片不可用`}>◇</span>
        )}
        <span className="workspace-recipe-pal-copy">
          {variant === 'detail' && <small>{role}</small>}
          <span>{name(id)}</span>
        </span>
      </div>
    )
  }
  return (
    <div className={`workspace-recipe-flow ${variant === 'bag' ? 'workspace-recipe-flow--bag' : ''}`} aria-label={`${name(recipe.parentAId)}加${name(recipe.parentBId)}得到${name(recipe.childId)}`}>
      {chip(recipe.parentAId, '亲本', 'parentA')}
      <span className="workspace-recipe-operator" aria-hidden="true">+</span>
      {chip(recipe.parentBId, '亲本', 'parentB')}
      <span className="workspace-recipe-operator workspace-recipe-arrow" aria-hidden="true">→</span>
      {chip(recipe.childId, '子代', 'child')}
    </div>
  )
}
