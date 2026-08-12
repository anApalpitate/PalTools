import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { LocalPalImage } from '../../components/pal-ui'
import {
  DEFAULT_PLAN_ID,
  derivePlanGraph,
  detectRecipeCycle,
  filterAndSortBagRelations,
  formatPlanSteps,
  resolveWorkspaceRelations,
} from '../../domain/breeding-workspace'
import type {
  BagFilters,
  BreedingWorkspace,
  ResolvedRelation,
  WorkspaceNodeMode,
  WorkspaceView,
} from '../../domain/breeding-workspace'
import type { BreedingIndexPayload, BreedingRecipeMatch, PalRecord } from '../../domain/types'
import { APP_VERSION } from '../../lib/app-version'
import { createWorkspaceExport, parseWorkspaceImport } from '../../storage/breeding-workspace'
import type { useBreedingWorkspace } from './useBreedingWorkspace'

const BreedingGraph = lazy(() => import('./BreedingGraph').then((module) => ({ default: module.BreedingGraph })))

type WorkspaceController = ReturnType<typeof useBreedingWorkspace>

interface SolutionWorkspaceProps {
  pals: PalRecord[]
  breedingIndex: BreedingIndexPayload
  datasetVersion: string
  controller: WorkspaceController
  onNavigateToQuery: (mode: 'forward' | 'reverse') => void
}

export function SolutionWorkspace(props: SolutionWorkspaceProps) {
  const { controller } = props
  if (!controller.workspace) {
    return <UnavailableSolutionWorkspace {...props} />
  }
  return <ReadySolutionWorkspace {...props} workspace={controller.workspace} />
}

function ReadySolutionWorkspace({
  pals,
  breedingIndex,
  datasetVersion,
  controller,
  onNavigateToQuery,
  workspace,
}: SolutionWorkspaceProps & { workspace: BreedingWorkspace }) {
  const { resolvedRelations } = controller
  const palsById = useMemo(() => new Map(pals.map((pal) => [pal.internalId, pal])), [pals])
  const chillet = palsById.get('WeaselDragon')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [relationQuery, setRelationQuery] = useState('')
  const [confirmAction, setConfirmAction] = useState<null | { title: string; detail: string; run: () => void }>(null)
  const [importPreview, setImportPreview] = useState<BreedingWorkspace | null>(null)
  const [filters, setFilters] = useState<BagFilters>({
    query: '', onlyNotInPlan: false, excludeSelfBreeding: true,
    sortKey: 'addedAt', sortDirection: 'desc',
  })
  const [renameValue, setRenameValue] = useState('')
  const [localMessage, setLocalMessage] = useState('')
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(max-width: 768px)').matches,
  )
  const [narrowViewFallback, setNarrowViewFallback] = useState(() =>
    isNarrow && workspace.preferences.lastView === 'graph',
  )
  const bagScrollRef = useRef<HTMLDivElement>(null)
  const relationScrollRef = useRef<HTMLDivElement>(null)
  const drawerOpenButtonRef = useRef<HTMLButtonElement>(null)
  const drawerCloseButtonRef = useRef<HTMLButtonElement>(null)

  const currentPlan = workspace.plans.find((plan) => plan.id === workspace.currentPlanId) ?? workspace.plans[0]
  const currentRecipeIndexes = workspace.planRelations[currentPlan.id] ?? []
  const currentRecipeSet = new Set(currentRecipeIndexes)
  const bagRelations = filterAndSortBagRelations(
    resolvedRelations,
    palsById,
    currentRecipeSet,
    filters,
  )
  // A single recipe is always clearer as three pals and two parent edges. Instance
  // mode only adds useful context once several recipes share the same pals.
  const graphNodeMode: WorkspaceNodeMode = currentRecipeIndexes.length <= 1
    ? 'merged'
    : workspace.preferences.nodeMode
  const graph = derivePlanGraph(resolvedRelations, currentRecipeIndexes, graphNodeMode)
  const validCurrentRecipes = graph.validRelations
  const addability = new Map<number, { kind: 'invalid' | 'inPlan' | 'cycle'; message: string }>()
  for (const relation of resolvedRelations.filter(({ snapshot }) => snapshot.inBag)) {
    if (relation.status === 'invalid') addability.set(relation.snapshot.recipeIndex, { kind: 'invalid', message: relation.reason })
    else if (currentRecipeSet.has(relation.snapshot.recipeIndex)) addability.set(relation.snapshot.recipeIndex, { kind: 'inPlan', message: '已在当前方案中' })
    else {
      const cycle = detectRecipeCycle([...validCurrentRecipes, relation.recipe])
      if (cycle) addability.set(relation.snapshot.recipeIndex, { kind: 'cycle', message: `加入后会形成循环（配方 #${cycle.recipeIndexes.join('、#')}）` })
    }
  }
  const selectedIndexes = [...selected]
  const selectedBlocked = selectedIndexes.map((index) => addability.get(index)?.message).find(Boolean)
  const allVisibleSelected = bagRelations.length > 0 && bagRelations.every((relation) => selected.has(relation.snapshot.recipeIndex))
  const bagVirtualizer = useVirtualizer({
    count: bagRelations.length,
    getScrollElement: () => bagScrollRef.current,
    estimateSize: () => 122,
    overscan: 6,
    initialRect: { width: 340, height: 520 },
  })
  const relationList = graph.validRelations.filter((recipe) => {
    const query = relationQuery.trim().toLowerCase()
    if (!query) return true
    return String(recipe.recipeIndex).includes(query) ||
      [recipe.parentAId, recipe.parentBId, recipe.childId].some((id) => {
        const pal = palsById.get(id)
        return `${id} ${pal?.name.zhHans ?? ''} ${pal?.name.en ?? ''}`.toLowerCase().includes(query)
      })
  })
  const relationVirtualizer = useVirtualizer({
    count: relationList.length,
    getScrollElement: () => relationScrollRef.current,
    estimateSize: () => 132,
    overscan: 6,
    initialRect: { width: 700, height: 520 },
  })
  const bagVirtualRows = bagVirtualizer.getVirtualItems()
  const visibleBagRows = bagVirtualRows.length
    ? bagVirtualRows
    : bagRelations.slice(0, 20).map((_, index) => ({ index, start: index * 122, size: 122, key: index, end: (index + 1) * 122, lane: 0 }))
  const relationVirtualRows = relationVirtualizer.getVirtualItems()
  const visibleRelationRows = relationVirtualRows.length
    ? relationVirtualRows
    : relationList.slice(0, 20).map((_, index) => ({ index, start: index * 132, size: 132, key: index, end: (index + 1) * 132, lane: 0 }))

  useEffect(() => {
    if (drawerOpen) drawerCloseButtonRef.current?.focus()
  }, [drawerOpen])

  useEffect(() => {
    if (!window.matchMedia) return
    const query = window.matchMedia('(max-width: 768px)')
    const update = () => setIsNarrow(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!isNarrow) setNarrowViewFallback(false)
  }, [isNarrow])

  useEffect(() => {
    if (!isNarrow || !drawerOpen) return
    const close = () => {
      setDrawerOpen(false)
      drawerOpenButtonRef.current?.focus()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab') return
      const drawer = drawerCloseButtonRef.current?.closest('aside')
      const focusable = drawer
        ? [...drawer.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]')]
        : []
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [drawerOpen, isNarrow])

  const toggleSelected = (recipeIndex: number) => setSelected((current) => {
    const next = new Set(current)
    if (next.has(recipeIndex)) next.delete(recipeIndex)
    else next.add(recipeIndex)
    return next
  })
  const toggleAllVisible = () => setSelected(allVisibleSelected
    ? new Set()
    : new Set(bagRelations.map((relation) => relation.snapshot.recipeIndex)))
  const removeSelected = () => setConfirmAction({
    title: '批量移出配方背包',
    detail: `确认移出选中的 ${selected.size} 条关系？方案中的同一关系会继续保留。`,
    run: () => { void controller.removeFromBag([...selected]); setSelected(new Set()) },
  })
  const exportWorkspace = () => {
    const payload = createWorkspaceExport(workspace, APP_VERSION, datasetVersion)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    const now = new Date()
    const localDate = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-')
    anchor.download = `paltools-breeding-workspace-${localDate}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  const readImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const parsed = parseWorkspaceImport(JSON.parse(await file.text()))
      setImportPreview(parsed)
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : '导入文件无效。')
    }
  }
  const copySteps = async () => {
    const text = formatPlanSteps(graph, palsById)
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
      else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.append(textarea)
        textarea.select()
        document.execCommand('copy')
        textarea.remove()
      }
    } catch {
      setLocalMessage('复制失败，请切换到关系列表后手动复制。')
    }
  }
  const effectiveView: WorkspaceView = narrowViewFallback ? 'steps' : workspace.preferences.lastView
  const setView = (lastView: WorkspaceView) => {
    setNarrowViewFallback(false)
    void controller.setPreferences({ lastView })
  }
  const setNodeMode = (nodeMode: WorkspaceNodeMode) => void controller.setPreferences({ nodeMode })
  const moveRadio = <T extends string>(
    event: React.KeyboardEvent,
    values: readonly T[],
    current: T,
    prefix: string,
    select: (value: T) => void,
  ) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
    const next = values[(values.indexOf(current) + direction + values.length) % values.length]
    select(next)
    document.getElementById(`${prefix}-${next}`)?.focus()
  }
  const name = (id: string) => palsById.get(id)?.name.zhHans ?? id
  const importResolved = importPreview ? resolveWorkspaceRelations(importPreview, breedingIndex) : []
  const importValidCount = importResolved.filter((relation) => relation.status === 'valid').length
  const importPlanRelationCount = importPreview
    ? Object.values(importPreview.planRelations).reduce((sum, indexes) => sum + indexes.length, 0)
    : 0

  return (
    <section className="solution-workspace" aria-label="配种方案网">
      {(controller.error || localMessage) && (
        <div className="workspace-error" role="alert">
          <span>{controller.error || localMessage}</span>
          <button onClick={() => { controller.clearError(); setLocalMessage('') }}>关闭</button>
        </div>
      )}
      {controller.busy && <p className="workspace-busy" role="status">正在保存工作区…</p>}
      <button ref={drawerOpenButtonRef} className="bag-drawer-toggle" aria-controls="relation-bag" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}>打开配方背包</button>
      <aside id="relation-bag" className={`relation-bag ${drawerOpen ? 'is-open' : ''}`} aria-label="配方背包" aria-hidden={isNarrow && !drawerOpen ? true : undefined} inert={isNarrow && !drawerOpen ? true : undefined}>
        <header>
          <div><h2>配方背包</h2><span>{workspace.relations.filter((relation) => relation.inBag).length} 条</span></div>
          <button ref={drawerCloseButtonRef} className="bag-drawer-close" aria-label="关闭配方背包" onClick={() => { setDrawerOpen(false); drawerOpenButtonRef.current?.focus() }}>×</button>
        </header>
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <input aria-label="搜索配方背包" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="搜索亲本、子代或配方号" />
        </label>
        <div className="bag-filter-row" aria-label="配方背包过滤">
          <button
            type="button"
            className="bag-select-all"
            aria-pressed={allVisibleSelected}
            aria-label={allVisibleSelected ? '取消全选当前列表' : '全选当前列表'}
            title={allVisibleSelected ? '取消全选当前列表' : '全选当前列表'}
            onClick={toggleAllVisible}
          >
            <span aria-hidden="true">{allVisibleSelected ? '☑' : '☐'}</span>
          </button>
          <BagIconToggle
            label={filters.onlyNotInPlan ? '显示已加入当前方案的配方' : '隐藏已加入当前方案的配方'}
            icon={<JoinedPlanFilterIcon hidden={filters.onlyNotInPlan} />}
            pressed={filters.onlyNotInPlan}
            onToggle={() => setFilters({ ...filters, onlyNotInPlan: !filters.onlyNotInPlan })}
          />
          <BagIconToggle
            label={filters.excludeSelfBreeding ? '显示自交配方' : '排除自交配方'}
            icon={chillet ? <LocalPalImage pal={chillet} size="mini" /> : <span className="bag-filter-fallback">鼬</span>}
            slashed={filters.excludeSelfBreeding}
            pressed={filters.excludeSelfBreeding}
            onToggle={() => setFilters({ ...filters, excludeSelfBreeding: !filters.excludeSelfBreeding })}
          />
          <button
            type="button"
            className="bag-sort-key"
            aria-label={`背包排序字段：${filters.sortKey === 'addedAt' ? '按加入时间排序' : '按配方编号排序'}`}
            title={filters.sortKey === 'addedAt' ? '按加入时间排序，点击切换为按配方编号排序' : '按配方编号排序，点击切换为按加入时间排序'}
            onClick={() => setFilters({ ...filters, sortKey: filters.sortKey === 'addedAt' ? 'recipeIndex' : 'addedAt' })}
          >
            {filters.sortKey === 'addedAt' ? '按加入时间排序' : '按配方编号排序'}
          </button>
          <BagIconToggle
            label={`背包排序方向：${filters.sortDirection === 'desc' ? '倒序' : '正序'}`}
            icon={filters.sortDirection === 'desc' ? '▼' : '▲'}
            pressed={filters.sortDirection === 'desc'}
            onToggle={() => setFilters({ ...filters, sortDirection: filters.sortDirection === 'desc' ? 'asc' : 'desc' })}
          />
        </div>
        <div className="bag-actions">
          <button disabled={!selected.size || Boolean(selectedBlocked)} title={selectedBlocked} onClick={() => void controller.addToCurrentPlan(selectedIndexes)}>批量加入</button>
          <button disabled={!selected.size} onClick={removeSelected}>批量移除</button>
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
                      <input type="checkbox" checked={selected.has(relation.snapshot.recipeIndex)} onChange={() => toggleSelected(relation.snapshot.recipeIndex)} />
                      <RecipePalFlow recipe={relation.snapshot} palsById={palsById} variant="bag" />
                    </label>
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

      <div className="solution-main">
        <header className="plan-toolbar">
          <select aria-label="选择方案" value={currentPlan.id} onChange={(event) => { setSelected(new Set()); void controller.switchPlan(event.target.value) }}>{workspace.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select>
          <button onClick={() => { setSelected(new Set()); void controller.createPlan() }}>新建方案</button>
          {currentPlan.kind === 'custom' && (
            <><input aria-label="新方案名称" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} placeholder="输入新名称" maxLength={40} /><button onClick={() => { void controller.renamePlan(renameValue); setRenameValue('') }}>重命名</button></>
          )}
          <button disabled={!currentRecipeIndexes.length} onClick={() => setConfirmAction({ title: '清空方案', detail: `确认清空“${currentPlan.name}”的全部关系？配方背包不会变化。`, run: () => void controller.clearPlan() })}>清空</button>
          {currentPlan.kind === 'custom' && <button onClick={() => setConfirmAction({ title: '删除方案', detail: `确认删除“${currentPlan.name}”？删除后将切回默认方案。`, run: () => void controller.deletePlan() })}>删除</button>}
          <button onClick={exportWorkspace}>导出</button>
          <label className="file-button">导入<input type="file" accept="application/json,.json" onChange={(event) => void readImport(event.target.files?.[0])} /></label>
        </header>
        <div className="plan-summary"><strong>{currentPlan.name}</strong><span>{currentRecipeIndexes.length} 条关系 · {graph.validRelations.length} 有效 · {graph.invalidRelations.length} 失效 · {graph.components.length} 个分量</span></div>
        <div className="view-controls">
          <div role="radiogroup" aria-label="方案视图">
            {([['steps', '步骤列表'], ['graph', '图形网'], ['relations', '关系列表']] as const).map(([value, label]) => <button key={value} id={`workspace-view-${value}`} role="radio" aria-checked={effectiveView === value} tabIndex={effectiveView === value ? 0 : -1} onClick={() => setView(value)} onKeyDown={(event) => moveRadio(event, ['steps', 'graph', 'relations'] as const, value, 'workspace-view', setView)}>{label}</button>)}
          </div>
          {effectiveView === 'graph' && currentRecipeIndexes.length > 0 && (currentRecipeIndexes.length <= 1 ? (
            <p className="graph-node-mode-hint">单条关系已使用简洁视图</p>
          ) : (
            <div role="radiogroup" aria-label="节点模式">
              <button id="workspace-node-merged" role="radio" aria-checked={workspace.preferences.nodeMode === 'merged'} tabIndex={workspace.preferences.nodeMode === 'merged' ? 0 : -1} onClick={() => setNodeMode('merged')} onKeyDown={(event) => moveRadio(event, ['merged', 'instance'] as const, 'merged', 'workspace-node', setNodeMode)}>合并视图</button>
              <button id="workspace-node-instance" role="radio" aria-checked={workspace.preferences.nodeMode === 'instance'} tabIndex={workspace.preferences.nodeMode === 'instance' ? 0 : -1} onClick={() => setNodeMode('instance')} onKeyDown={(event) => moveRadio(event, ['merged', 'instance'] as const, 'instance', 'workspace-node', setNodeMode)}>实例视图</button>
            </div>
          ))}
        </div>
        {!currentRecipeIndexes.length ? (
          <div className="result-placeholder"><h2>从配方背包选择配方加入当前方案</h2></div>
        ) : effectiveView === 'graph' ? (
          <Suspense fallback={<div className="result-placeholder"><h2>正在载入图形网…</h2></div>}>
          <BreedingGraph graph={graph} palsById={palsById} onRemove={(index) => void controller.removeFromPlan([index])} />
          </Suspense>
        ) : effectiveView === 'relations' ? (
          <section className="plan-relations-view">
            <label className="search-field"><span aria-hidden="true">⌕</span><input aria-label="搜索方案关系" value={relationQuery} onChange={(event) => setRelationQuery(event.target.value)} placeholder="搜索帕鲁或配方号" /></label>
            <div ref={relationScrollRef} className="virtual-relation-list plan-relation-list" tabIndex={0} aria-label="方案关系列表">
              <div style={{ height: relationVirtualizer.getTotalSize(), position: 'relative' }}>{visibleRelationRows.map((virtualRow) => {
                const recipe = relationList[virtualRow.index]
                return (
                  <article key={recipe.recipeIndex} className="plan-relation-row" style={{ position: 'absolute', transform: `translateY(${virtualRow.start}px)`, height: virtualRow.size, width: '100%' }}>
                    <div className="plan-relation-content">
                      <span className="recipe-index-badge" translate="no">配方 #{recipe.recipeIndex}</span>
                      <RecipePalFlow recipe={recipe} palsById={palsById} variant="detail" />
                    </div>
                    <button aria-label={`从方案移除配方 ${recipe.recipeIndex}`} onClick={() => void controller.removeFromPlan([recipe.recipeIndex])}>移除</button>
                  </article>
                )
              })}</div>
            </div>
            <InvalidRelations relations={graph.invalidRelations} palsById={palsById} onRemove={(index) => void controller.removeFromPlan([index])} />
          </section>
        ) : (
          <section className="plan-steps-view">
            <button onClick={() => void copySteps()}>复制完整步骤</button>
            {graph.components.map((component) => (
              <section key={component.id} className="step-component">
                <h3>{component.id} · 目标：{component.targetIds.map(name).join('、')}</h3>
                {graph.steps.filter((step) => step.componentId === component.id).map((step) => (
                  <article key={step.recipe.recipeIndex} className="plan-step">
                    <header>
                      <strong>步骤 {step.number}</strong>
                      <span className="recipe-index-badge" translate="no">配方 #{step.recipe.recipeIndex}</span>
                    </header>
                    <RecipePalFlow recipe={step.recipe} palsById={palsById} variant="detail" />
                    <p>{step.prerequisiteSteps.length ? `前置步骤 ${step.prerequisiteSteps.join('、')}` : '无前置步骤'}</p>
                    <button aria-label={`从方案移除步骤 ${step.number} 的配方 ${step.recipe.recipeIndex}`} onClick={() => void controller.removeFromPlan([step.recipe.recipeIndex])}>移除</button>
                  </article>
                ))}
              </section>
            ))}
            <InvalidRelations relations={graph.invalidRelations} palsById={palsById} onRemove={(index) => void controller.removeFromPlan([index])} />
          </section>
        )}
      </div>

      {confirmAction && <ConfirmDialog title={confirmAction.title} detail={confirmAction.detail} onCancel={() => setConfirmAction(null)} onConfirm={() => { confirmAction.run(); setConfirmAction(null) }} />}
      {importPreview && <ConfirmDialog title="导入工作区" detail={`将替换当前工作区：${importPreview.relations.filter((relation) => relation.inBag).length} 条背包配方、${importPreview.plans.length} 个方案、${importPlanRelationCount} 条方案引用；当前数据下 ${importValidCount} 条有效、${importResolved.length - importValidCount} 条失效。数据版本 ${importPreview.datasetVersion}${importPreview.datasetVersion === datasetVersion ? '（一致）' : '（与当前版本不同，将逐条校验）'}。`} onCancel={() => setImportPreview(null)} onConfirm={() => { void controller.replaceWorkspace(importPreview); setImportPreview(null); setSelected(new Set()) }} />}
    </section>
  )
}

function BagIconToggle({
  label,
  icon,
  slashed = false,
  pressed,
  onToggle,
}: {
  label: string
  icon: ReactNode
  slashed?: boolean
  pressed: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className="bag-filter-icon"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onToggle}
    >
      <div className="bag-filter-graphic" aria-hidden="true">{icon}</div>
      {slashed && <span className="bag-filter-slash" aria-hidden="true" />}
      <span className="bag-filter-tooltip" role="tooltip">{label}</span>
    </button>
  )
}

function JoinedPlanFilterIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg className="bag-joined-filter-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5.5h14v13H5z" />
      <path d="m8 12 2.2 2.2L16.5 8" />
      {hidden && <path className="bag-joined-filter-hide" d="M4 20 20 4" />}
    </svg>
  )
}

function UnavailableSolutionWorkspace(props: SolutionWorkspaceProps) {
  const { controller, datasetVersion } = props
  const [resetPending, setResetPending] = useState(false)
  const [preview, setPreview] = useState<BreedingWorkspace | null>(null)
  const [localError, setLocalError] = useState('')
  const readImport = async (file: File | undefined) => {
    if (!file) return
    try {
      setPreview(parseWorkspaceImport(JSON.parse(await file.text())))
      setLocalError('')
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '导入文件无效。')
    }
  }
  return (
    <section className="solution-loading result-placeholder" aria-label="配种工作区恢复">
      <h2>{controller.loading ? '正在载入配种工作区…' : '配种工作区不可用'}</h2>
      {(controller.error || localError) && <p role="alert">{controller.error || localError}</p>}
      {!controller.loading && <div className="workspace-recovery-actions">
        <button onClick={controller.retryWorkspace}>重试</button>
        <label className="file-button">导入备份<input type="file" accept="application/json,.json" onChange={(event) => void readImport(event.target.files?.[0])} /></label>
        <button onClick={() => setResetPending(true)}>重置本机工作区</button>
      </div>}
      {resetPending && <ConfirmDialog title="重置本机工作区" detail="确认删除本机损坏的配种工作区并重新建立默认方案？此操作不可撤销。" onCancel={() => setResetPending(false)} onConfirm={() => { void controller.resetWorkspace(); setResetPending(false) }} />}
      {preview && <ConfirmDialog title="导入工作区备份" detail={`将以数据版本 ${preview.datasetVersion} 的备份替换本机工作区；当前数据版本为 ${datasetVersion}，导入后会重新校验全部关系。`} onCancel={() => setPreview(null)} onConfirm={() => { void controller.replaceWorkspace(preview); setPreview(null) }} />}
    </section>
  )
}

function RelationSummary({ relation, palsById }: { relation: ResolvedRelation; palsById: ReadonlyMap<string, PalRecord> }) {
  const snapshot = relation.snapshot
  return <div className="relation-summary"><span className="recipe-index-badge" translate="no">配方 #{snapshot.recipeIndex}</span><RecipePalFlow recipe={snapshot} palsById={palsById} variant="detail" />{relation.status === 'invalid' && <small>失效 · {relation.reason}</small>}</div>
}

function RecipePalFlow({
  recipe,
  palsById,
  variant = 'detail',
}: {
  recipe: Pick<BreedingRecipeMatch, 'parentAId' | 'parentBId' | 'childId'>
  palsById: ReadonlyMap<string, PalRecord>
  variant?: 'detail' | 'bag'
}) {
  const name = (id: string) => palsById.get(id)?.name.zhHans ?? id
  const chip = (id: string, role: '亲本' | '子代') => {
    const pal = palsById.get(id)
    return (
      <div className={`workspace-recipe-pal workspace-recipe-pal--${role === '子代' ? 'child' : 'parent'} ${variant === 'bag' ? 'workspace-recipe-pal--stacked' : ''}`} title={`${role}：${name(id)}`}>
        {pal ? (
          <LocalPalImage pal={pal} size="mini" />
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
      {chip(recipe.parentAId, '亲本')}
      <span className="workspace-recipe-operator" aria-hidden="true">+</span>
      {chip(recipe.parentBId, '亲本')}
      <span className="workspace-recipe-operator workspace-recipe-arrow" aria-hidden="true">→</span>
      {chip(recipe.childId, '子代')}
    </div>
  )
}

function InvalidRelations({ relations, palsById, onRemove }: { relations: ResolvedRelation[]; palsById: ReadonlyMap<string, PalRecord>; onRemove: (index: number) => void }) {
  if (!relations.length) return null
  return <section className="invalid-relations" aria-label="失效关系"><h3>失效关系</h3>{relations.map((relation) => <article key={relation.snapshot.recipeIndex}><RelationSummary relation={relation} palsById={palsById} /><button onClick={() => onRemove(relation.snapshot.recipeIndex)}>移除</button></article>)}</section>
}

function ConfirmDialog({ title, detail, onCancel, onConfirm }: { title: string; detail: string; onCancel: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLElement>(null)
  const previouslyFocused = useRef(document.activeElement as HTMLElement | null)
  useEffect(() => () => previouslyFocused.current?.focus(), [])
  return <div className="confirm-backdrop"><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="confirm-dialog" onKeyDown={(event) => {
    if (event.key === 'Escape') { event.preventDefault(); onCancel() }
    if (event.key === 'Tab') {
      const buttons = [...(dialogRef.current?.querySelectorAll('button') ?? [])]
      if (!buttons.length) return
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const next = event.shiftKey ? (current - 1 + buttons.length) % buttons.length : (current + 1) % buttons.length
      event.preventDefault()
      buttons[next].focus()
    }
  }}><h2 id="confirm-title">{title}</h2><p>{detail}</p><div><button autoFocus onClick={onCancel}>取消</button><button onClick={onConfirm}>确认</button></div></section></div>
}
