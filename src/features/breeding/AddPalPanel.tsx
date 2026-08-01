import { memo, useMemo, useState } from 'react'
import { LocalPalImage } from '../../components/pal-ui'
import { matchesPalIdentityQuery } from '../../domain/search'
import type { PalRecord } from '../../domain/types'
import { PAL_DRAG_MIME } from './BreedingGraphCanvas'

export const AddPalPanel = memo(function AddPalPanel({
  pals,
  open,
  onToggle,
  onAdd,
}: {
  pals: PalRecord[]
  open: boolean
  onToggle(): void
  onAdd(palId: string): void
}) {
  const [query, setQuery] = useState('')
  const visiblePals = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
    return [...pals]
      .filter((pal) => matchesPalIdentityQuery(pal, normalizedQuery))
      .sort((left, right) => {
        if (left.paldexNo === null && right.paldexNo === null) {
          return left.internalId.localeCompare(right.internalId)
        }
        if (left.paldexNo === null) return 1
        if (right.paldexNo === null) return -1
        return (
          left.paldexNo.localeCompare(right.paldexNo, undefined, {
            numeric: true,
          }) || left.internalId.localeCompare(right.internalId)
        )
      })
  }, [pals, query])

  return (
    <aside
      className={open ? 'add-pal-panel is-open' : 'add-pal-panel'}
      aria-label="加入帕鲁"
    >
      <button
        type="button"
        className="add-pal-panel-toggle graph-side-icon-button quiet-button"
        aria-expanded={open}
        aria-controls="add-pal-panel-content"
        aria-label={open ? '收起加入帕鲁' : '打开加入帕鲁'}
        data-tooltip={open ? '收起加入帕鲁' : '加入帕鲁'}
        onClick={onToggle}
      >
        <span aria-hidden="true">{open ? '‹' : '+'}</span>
      </button>
      {open && (
        <div id="add-pal-panel-content" className="add-pal-panel-content">
          <div className="add-pal-panel-heading">
            <h2>加入帕鲁</h2>
            <span>{visiblePals.length} 项</span>
          </div>
          <label className="search-field">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="搜索可加入的帕鲁"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="名称、拼音或图鉴编号"
              spellCheck={false}
            />
          </label>
          <div className="add-pal-list themed-scrollbar" role="list">
            {visiblePals.length === 0 ? (
              <p className="preset-empty">没有匹配的帕鲁</p>
            ) : (
              visiblePals.map((pal) => (
                <div
                  key={pal.internalId}
                  className="add-pal-item"
                  role="listitem"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.clearData()
                    event.dataTransfer.setData(PAL_DRAG_MIME, pal.internalId)
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                >
                  <LocalPalImage pal={pal} size="tree" />
                  <span>
                    <strong>{pal.name.zhHans}</strong>
                    <small>{pal.paldexNo ? `#${pal.paldexNo}` : '无编号'}</small>
                  </span>
                  <button
                    type="button"
                    className="queue-add-button"
                    onClick={() => onAdd(pal.internalId)}
                    aria-label={`加入画布 ${pal.name.zhHans}`}
                  >
                    加入
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </aside>
  )
})
