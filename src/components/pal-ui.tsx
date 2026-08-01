import { useState } from 'react'
import type {
  ElementId,
  ElementRecord,
  ItemRecord,
  PalRecord,
  WorkSuitabilityRecord,
} from '../domain/types'
import { localAssetUrl } from '../lib/assets'

export type ElementMap = ReadonlyMap<ElementId, ElementRecord>

export function RarityStars({ rarity }: { rarity: number | null }) {
  if (rarity === null) {
    return <span className="rarity-empty">暂无数据</span>
  }

  const normalizedRarity = Math.max(0, rarity)
  const rainbowStars = Math.min(5, Math.max(0, normalizedRarity - 5))
  const yellowStars = Math.min(5, normalizedRarity)

  return (
    <span
      className="rarity-stars"
      role="img"
      aria-label={`稀有度 ${rarity}`}
      title={`稀有度 ${rarity}`}
    >
      {Array.from({ length: 5 }, (_, index) => {
        const style =
          index < rainbowStars
            ? 'rarity-star--rainbow'
            : index < yellowStars
              ? 'rarity-star--yellow'
              : 'rarity-star--empty'
        return (
          <span className={`rarity-star ${style}`} aria-hidden="true" key={index}>
            {index < yellowStars ? '★' : '☆'}
          </span>
        )
      })}
    </span>
  )
}

export function LocalPalImage({
  pal,
  size = 'card',
}: {
  pal: PalRecord
  size?: 'card' | 'detail' | 'formula' | 'tree'
}) {
  const [failed, setFailed] = useState(false)
  return (
    <div className={`pal-image pal-image--${size} ${failed ? 'is-fallback' : ''}`}>
      {!failed ? (
        <img
          src={localAssetUrl(pal.image.localPath)}
          alt={pal.name.zhHans}
          draggable={false}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-label={`${pal.name.zhHans}图片不可用`} role="img">◈</span>
      )}
    </div>
  )
}

export function ItemImage({ item }: { item: ItemRecord }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className={`item-image ${failed ? 'is-fallback' : ''}`}>
      {!failed ? (
        <img
          src={localAssetUrl(item.icon.localPath)}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">◇</span>
      )}
    </span>
  )
}

export function WorkSuitabilityIcon({
  item,
  compact = false,
}: {
  item: WorkSuitabilityRecord | undefined
  compact?: boolean
}) {
  const [failed, setFailed] = useState(false)
  return (
    <span
      className={`work-icon ${compact ? 'work-icon--compact' : ''} ${
        failed || !item ? 'is-fallback' : ''
      }`}
      aria-hidden="true"
    >
      {!failed && item ? (
        <img
          src={localAssetUrl(item.icon.localPath)}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : '◇'}
    </span>
  )
}

export function ElementBadge({
  id,
  elements,
  compact = false,
}: {
  id: ElementId
  elements: ElementMap
  compact?: boolean
}) {
  const element = elements.get(id)
  const [failed, setFailed] = useState(false)
  const label = element?.name.zhHans ?? id
  return (
    <span
      className={`element-badge ${compact ? 'element-badge--compact' : ''} ${
        failed || !element?.icon ? 'is-fallback' : ''
      }`}
      title={label}
    >
      {!failed && element?.icon ? (
        <img
          src={localAssetUrl(element.icon.localPath)}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">?</span>
      )}
      {!compact && <b>{label}</b>}
      <span className="sr-only">{label}</span>
    </span>
  )
}
