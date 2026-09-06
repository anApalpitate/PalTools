import { useEffect, useRef, type RefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  CloseIcon,
  ExcludeSelfIcon,
  PanelCloseIcon,
  PendingPlanIcon,
  SelectAllIcon,
  SortDirectionIcon,
  SortKeyIcon,
} from '../../components/ui-icons'
import type {
  BagFilters,
  BreedingWorkspace,
  ResolvedRelation,
} from '../../domain/breeding-workspace'
import type { PalRecord } from '../../domain/types'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { RecipePalFlow } from './RecipePalFlow'
import type { useBreedingWorkspace } from './useBreedingWorkspace'

type WorkspaceController = ReturnType<typeof useBreedingWorkspace>

type BagAddability = ReadonlyMap<
  number,
  { kind: 'invalid' | 'inPlan' | 'cycle'; message: string }
>

interface RelationBagPanelProps {
  workspace: BreedingWorkspace
  controller: WorkspaceController
  palsById: ReadonlyMap<string, PalRecord>
  isNarrow: boolean
  drawerOpen: boolean
  desktopBagCollapsed: boolean
  drawerOpenButtonRef: RefObject<HTMLButtonElement | null>
  filters: BagFilters
  bagRelations: ResolvedRelation[]
  addability: BagAddability
  selected: ReadonlySet<number>
  selectedIndexes: number[]
  selectedBlocked?: string
  allVisibleSelected: boolean
  selectedAvatarKey: string
  onAvatarActivate: (key: string, palId: string) => void
  onDrawerClose: () => void
  onDesktopCollapse: () => void
  onFiltersChange: (filters: BagFilters) => void
  onToggleAllVisible: () => void
  onToggleSelected: (recipeIndex: number) => void
  onRemoveSelected: () => void
  onNavigateToQuery: (mode: 'forward' | 'reverse') => void
}

export function RelationBagPanel({
  workspace,
  controller,
  palsById,
  isNarrow,
  drawerOpen,
  desktopBagCollapsed,
  drawerOpenButtonRef,
  filters,
  bagRelations,
  addability,
  selected,
  selectedIndexes,
  selectedBlocked,
  allVisibleSelected,
  selectedAvatarKey,
  onAvatarActivate,
  onDrawerClose,
  onDesktopCollapse,
  onFiltersChange,
  onToggleAllVisible,
  onToggleSelected,
  onRemoveSelected,
  onNavigateToQuery,
}: RelationBagPanelProps) {
  const panelRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const bagScrollRef = useRef<HTMLDivElement>(null)
  const bagVirtualizer = useVirtualizer({
    count: bagRelations.length,
    getScrollElement: () => bagScrollRef.current,
    estimateSize: () => 122,
    overscan: 6,
    initialRect: { width: 340, height: 520 },
  })
  const bagVirtualRows = bagVirtualizer.getVirtualItems()
  const visibleBagRows = bagVirtualRows.length
    ? bagVirtualRows
    : bagRelations.slice(0, 20).map((_, index) => ({
        index,
        start: index * 122,
        size: 122,
        key: index,
        end: (index + 1) * 122,
        lane: 0,
      }))

  useBodyScrollLock(isNarrow && drawerOpen)
  useFocusTrap(panelRef, {
    active: isNarrow && drawerOpen,
    initialFocusRef: closeButtonRef,
    returnFocusRef: drawerOpenButtonRef,
    onEscape: onDrawerClose,
  })

  useEffect(() => {
    bagVirtualizer.measure()
  }, [bagVirtualizer, desktopBagCollapsed, drawerOpen, isNarrow])

  return (
    <aside
      ref={panelRef}
      id="relation-bag"
      className={`relation-bag ${drawerOpen ? 'is-open' : ''}`}
      aria-label="配方背包"
      aria-hidden={isNarrow && !drawerOpen ? true : undefined}
      hidden={!isNarrow && desktopBagCollapsed}
      inert={isNarrow && !drawerOpen ? true : undefined}
    >
      <header>
        <div><h2>配方背包</h2><span>{workspace.relations.filter((relation) => relation.inBag).length} 条</span></div>
        {!isNarrow && (
          <button className="panel-toggle-button bag-desktop-collapse" aria-label="折叠配方背包" title="折叠配方背包" aria-controls="relation-bag" aria-expanded="true" onClick={onDesktopCollapse}><PanelCloseIcon /></button>
        )}
        <button ref={closeButtonRef} className="panel-toggle-button bag-drawer-close" aria-label="关闭配方背包" title="关闭配方背包" onClick={onDrawerClose}><CloseIcon /></button>
      </header>
      <label className="search-field">
        <span aria-hidden="true">⌕</span>
        <input aria-label="搜索配方背包" name="recipe-bag-search" autoComplete="off" value={filters.query} onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })} placeholder="搜索亲本、子代或配方号…" />
      </label>
      <div className="bag-filter-row" aria-label="配方背包过滤">
        <button
          type="button"
          className="bag-select-all"
          aria-pressed={allVisibleSelected}
          aria-label={allVisibleSelected ? '取消全选当前列表' : '全选当前列表'}
          title={allVisibleSelected ? '取消全选当前列表' : '全选当前列表'}
          onClick={onToggleAllVisible}
        >
          <SelectAllIcon selected={allVisibleSelected} />
          <span>{allVisibleSelected ? '取消' : '全选'}</span>
        </button>
        <button
          type="button"
          className="bag-filter-toggle"
          aria-label={filters.onlyNotInPlan ? '显示已加入当前方案的配方' : '隐藏已加入当前方案的配方'}
          aria-pressed={filters.onlyNotInPlan}
          onClick={() => onFiltersChange({ ...filters, onlyNotInPlan: !filters.onlyNotInPlan })}
        >
          <PendingPlanIcon />
          <span>未入方案</span>
        </button>
        <button
          type="button"
          className="bag-filter-toggle"
          aria-label={filters.excludeSelfBreeding ? '显示自交配方' : '排除自交配方'}
          aria-pressed={filters.excludeSelfBreeding}
          onClick={() => onFiltersChange({ ...filters, excludeSelfBreeding: !filters.excludeSelfBreeding })}
        >
          <ExcludeSelfIcon />
          <span>排除自交</span>
        </button>
        <button
          type="button"
          className="bag-sort-key"
          aria-label={`背包排序字段：${filters.sortKey === 'addedAt' ? '按加入时间排序' : '按配方编号排序'}`}
          title={filters.sortKey === 'addedAt' ? '按加入时间排序，点击切换为按配方编号排序' : '按配方编号排序，点击切换为按加入时间排序'}
          onClick={() => onFiltersChange({ ...filters, sortKey: filters.sortKey === 'addedAt' ? 'recipeIndex' : 'addedAt' })}
        >
          <SortKeyIcon />
          <span>{filters.sortKey === 'addedAt' ? '加入时间' : '配方编号'}</span>
        </button>
        <button
          type="button"
          className="bag-sort-direction"
          aria-label={`背包排序方向：${filters.sortDirection === 'desc' ? '倒序' : '正序'}`}
          aria-pressed={filters.sortDirection === 'desc'}
          onClick={() => onFiltersChange({ ...filters, sortDirection: filters.sortDirection === 'desc' ? 'asc' : 'desc' })}
        >
          <SortDirectionIcon direction={filters.sortDirection} />
          <span>{filters.sortDirection === 'desc' ? '倒序' : '正序'}</span>
        </button>
      </div>
      <div className="bag-actions">
        <button disabled={!selected.size || Boolean(selectedBlocked)} title={selectedBlocked} onClick={() => void controller.addToCurrentPlan(selectedIndexes)}>批量加入</button>
        <button disabled={!selected.size} onClick={onRemoveSelected}>批量移除</button>
      </div>
      <div className="virtual-relation-list" ref={bagScrollRef} tabIndex={0} aria-label="配方背包列表">
        {bagRelations.length ? (
          <div style={{ height: bagVirtualizer.getTotalSize(), position: 'relative' }}>
            {visibleBagRows.map((virtualRow) => {
              const relation = bagRelations[virtualRow.index]
              const blocked = addability.get(relation.snapshot.recipeIndex)
              return (
                <div key={relation.snapshot.recipeIndex} className={`bag-relation-row ${blocked ? 'is-blocked' : ''}`} style={{ position: 'absolute', transform: `translateY(${virtualRow.start}px)`, height: virtualRow.size, width: '100%' }} aria-setsize={bagRelations.length} aria-posinset={virtualRow.index + 1}>
                  <label className="bag-relation-select">
                    <input aria-label={`选择配方 ${relation.snapshot.recipeIndex}`} type="checkbox" checked={selected.has(relation.snapshot.recipeIndex)} onChange={() => onToggleSelected(relation.snapshot.recipeIndex)} />
                  </label>
                  <RecipePalFlow recipe={relation.snapshot} palsById={palsById} variant="bag" scope="bag" selectedAvatarKey={selectedAvatarKey} onAvatarActivate={onAvatarActivate} />
                  <div className="bag-relation-actions">
                    <button className="bag-relation-action bag-relation-remove" aria-label={`移出配方背包配方 ${relation.snapshot.recipeIndex}`} onClick={() => void controller.removeFromBag([relation.snapshot.recipeIndex])}>移出</button>
                    <button className="bag-relation-action bag-relation-add" disabled={Boolean(blocked)} title={blocked?.message} aria-label={`加入当前方案配方 ${relation.snapshot.recipeIndex}`} onClick={() => void controller.addToCurrentPlan([relation.snapshot.recipeIndex])}>加入</button>
                  </div>
                  <div className="bag-relation-footer">
                    {blocked && blocked.kind !== 'inPlan' ? <small>{blocked.message}</small> : <span />}
                    <span className="bag-relation-meta">
                      {blocked?.kind === 'inPlan' && (
                        <span className="bag-relation-status">{blocked.message}</span>
                      )}
                      <span className="bag-relation-index">#{relation.snapshot.recipeIndex}</span>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bag-empty">
            <span className="bag-empty-mark" aria-hidden="true">＋</span>
            <div><p>配方背包为空</p><small>先在查询结果中把需要的配方加入背包。</small></div>
            <div className="bag-empty-actions">
              <button onClick={() => onNavigateToQuery('forward')}><span aria-hidden="true">→</span>双亲查询</button>
              <button onClick={() => onNavigateToQuery('reverse')}><span aria-hidden="true">⌕</span>目标反查</button>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
