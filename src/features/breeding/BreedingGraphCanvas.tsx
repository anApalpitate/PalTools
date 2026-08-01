import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LocalPalImage } from '../../components/pal-ui'
import {
  computeLayeredLayout,
  deleteLayeredNodes,
  deriveCombineSlots,
  deriveLayeredSlots,
  type LayeredLayout,
  type LayeredSlotTarget,
} from '../../domain/breeding-layered-graph'
import type { GraphViewportV1 } from '../../domain/breeding-graph'
import {
  GRAPH_MAX_ZOOM,
  GRAPH_MIN_ZOOM,
  fitGraphViewport,
  revealGraphBounds,
  zoomGraphViewportAtPoint,
} from '../../domain/graph-viewport'
import type { BreedingRecipeMatch, PalRecord } from '../../domain/types'
import type { useBreedingPlanEditor } from '../../hooks/useBreedingPlanEditor'
import { FormulaCard } from './BreedingComponents'
import { GraphToolButton } from './GraphToolButton'

export const PAL_DRAG_MIME = 'application/x-paltools-pal-id'
type GraphTool = 'cursor' | 'pan' | 'query'

export function BreedingGraphCanvas({
  palsById,
  editor,
  markedRecipes,
  onToggleRecipeMark,
  onQueryPal,
  panelOpen = false,
  onRelationsOpenChange,
}: {
  palsById: ReadonlyMap<string, PalRecord>
  editor: ReturnType<typeof useBreedingPlanEditor>
  markedRecipes: BreedingRecipeMatch[]
  onToggleRecipeMark(recipeIndex: number): void
  onQueryPal: (palId: string) => void
  panelOpen?: boolean
  onRelationsOpenChange?(open: boolean): void
}) {
  const [tool, setTool] = useState<GraphTool>('cursor')
  const [relationsOpen, setRelationsOpen] = useState(false)
  const [rightPanelTab, setRightPanelTab] = useState<'marked' | 'relations'>('relations')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [hoveredSlotId, setHoveredSlotId] = useState<string | null>(null)
  const [nodeDragSource, setNodeDragSource] = useState<string | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [deleteExit, setDeleteExit] = useState<{ layout: LayeredLayout; ids: Set<string> } | null>(null)
  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 })
  const surfaceRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<GraphViewportV1>(editor.state.plan?.viewport ?? { x: 0, y: 0, zoom: 1 })
  const panRef = useRef<{ pointerId: number; clientX: number; clientY: number; viewport: GraphViewportV1 } | null>(null)
  const nodeDragRef = useRef<{ nodeId: string; pointerId: number; moved: boolean } | null>(null)
  const ignoreClickRef = useRef(false)
  const wheelTimerRef = useRef<number | null>(null)

  const plan = editor.state.plan
  const layout = useMemo(() => computeLayeredLayout(plan ?? emptyPlan()), [plan])
  const graphNodeById = useMemo(() => new Map((plan?.nodes ?? []).map((node) => [node.id, node])), [plan?.nodes])
  const insertionSlots = useMemo(() => deriveLayeredSlots(plan ?? emptyPlan()), [plan])
  const combineSlots = useMemo(() => deriveCombineSlots(plan ?? emptyPlan()), [plan])
  const showInsertSlots = Boolean(editor.state.placementPalId) || layout.nodes.length === 0
  const showCombineSlots = Boolean(nodeDragSource)

  const applyViewport = useCallback((viewport: GraphViewportV1) => {
    const next = { ...viewport, zoom: Math.min(GRAPH_MAX_ZOOM, Math.max(GRAPH_MIN_ZOOM, viewport.zoom)) }
    viewportRef.current = next
    if (sceneRef.current) sceneRef.current.style.transform = `translate3d(${next.x}px, ${next.y}px, 0) scale(${next.zoom})`
    return next
  }, [])

  const settleViewport = useCallback((viewport: GraphViewportV1) => {
    const next = applyViewport(viewport)
    editor.actions.setViewport(next)
  }, [applyViewport, editor.actions])

  useEffect(() => {
    const next = editor.state.plan?.viewport ?? { x: 0, y: 0, zoom: 1 }
    viewportRef.current = next
    applyViewport(next)
  }, [applyViewport, editor.state.plan?.id])

  useEffect(() => {
    if (panelOpen && relationsOpen) {
      setRelationsOpen(false)
      onRelationsOpenChange?.(false)
    }
  }, [onRelationsOpenChange, panelOpen, relationsOpen])

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return
    const observer = new ResizeObserver(() => setSurfaceSize({ width: surface.clientWidth, height: surface.clientHeight }))
    observer.observe(surface)
    setSurfaceSize({ width: surface.clientWidth, height: surface.clientHeight })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const nodeId = editor.state.revealNodeId
    const node = nodeId ? layout.nodeById.get(nodeId) : undefined
    if (!node || surfaceSize.width === 0 || surfaceSize.height === 0) return
    const next = revealGraphBounds(viewportRef.current, node, surfaceSize, { left: 24, right: 24, top: 92, bottom: 48 })
    settleViewport(next)
    if (nodeId) editor.actions.acknowledgeRevealNode(nodeId)
  }, [editor.state.revealNodeId, layout, settleViewport, surfaceSize, editor.actions])

  useEffect(() => () => {
    if (wheelTimerRef.current !== null) window.clearTimeout(wheelTimerRef.current)
  }, [])

  function selectNode(nodeId: string) {
    if (tool === 'query') {
      const palId = graphNodeById.get(nodeId)?.palId
      if (palId) onQueryPal(palId)
      return
    }
    if (tool !== 'cursor') return
    const next = editor.state.selectedNodeIds.includes(nodeId)
      ? editor.state.selectedNodeIds.filter((id) => id !== nodeId)
      : [...editor.state.selectedNodeIds, nodeId].slice(-2)
    editor.actions.setSelectedNodeIds(next)
    editor.actions.setFocusedNodeId(nodeId)
  }

  function beginNodePointerDrag(event: React.PointerEvent<HTMLButtonElement>, nodeId: string) {
    if (tool !== 'cursor' || event.button !== 0) return
    nodeDragRef.current = { nodeId, pointerId: event.pointerId, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveNodePointerDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = nodeDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (Math.abs(event.movementX) + Math.abs(event.movementY) > 2) {
      drag.moved = true
      ignoreClickRef.current = true
      setNodeDragSource(drag.nodeId)
    }
  }

  function finishNodePointerDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = nodeDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-combine-node]')
    if (drag.moved && target?.dataset.combineNode && target.dataset.combineNode !== drag.nodeId) {
      editor.actions.createChildFromNodes(drag.nodeId, target.dataset.combineNode)
    }
    nodeDragRef.current = null
    setNodeDragSource(null)
    window.setTimeout(() => { ignoreClickRef.current = false }, 0)
  }

  function beginPan(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (event.button !== 0 || (tool !== 'pan' && tool !== 'cursor') || target.closest('button')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    panRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, viewport: viewportRef.current }
    setIsPanning(true)
  }

  function movePan(event: React.PointerEvent<HTMLDivElement>) {
    const pan = panRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    applyViewport({ ...pan.viewport, x: pan.viewport.x + event.clientX - pan.clientX, y: pan.viewport.y + event.clientY - pan.clientY })
  }

  function finishPan(event: React.PointerEvent<HTMLDivElement>) {
    if (panRef.current?.pointerId !== event.pointerId) return
    panRef.current = null
    setIsPanning(false)
    settleViewport(viewportRef.current)
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    if (event.ctrlKey) {
      const next = zoomGraphViewportAtPoint(viewportRef.current, viewportRef.current.zoom * Math.exp(-event.deltaY * 0.0015), { x: event.clientX - rect.left, y: event.clientY - rect.top })
      applyViewport(next)
    } else {
      applyViewport({ ...viewportRef.current, x: viewportRef.current.x - event.deltaX, y: viewportRef.current.y - event.deltaY })
    }
    if (wheelTimerRef.current !== null) window.clearTimeout(wheelTimerRef.current)
    wheelTimerRef.current = window.setTimeout(() => settleViewport(viewportRef.current), 140)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (target.matches('input, textarea, select, [contenteditable="true"]')) return
    if (event.key === 'Escape') {
      if (editor.state.placementPalId) editor.actions.cancelPlacement()
      else if (editor.state.recipeChoices.length > 0) editor.actions.cancelChildChoice()
      else editor.actions.setSelectedNodeIds([])
      return
    }
    if (!event.ctrlKey) return
    if (event.key.toLowerCase() === 'c') {
      event.preventDefault()
      editor.actions.copySelected()
    } else if (event.key.toLowerCase() === 'v') {
      event.preventDefault()
      editor.actions.paste()
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      applyViewport({ ...viewportRef.current, zoom: viewportRef.current.zoom + 0.2 })
      settleViewport(viewportRef.current)
    } else if (event.key === '-') {
      event.preventDefault()
      applyViewport({ ...viewportRef.current, zoom: viewportRef.current.zoom - 0.2 })
      settleViewport(viewportRef.current)
    }
  }

  function fitCanvas() {
    if (!layout.bounds) return
    settleViewport(fitGraphViewport(layout.bounds, surfaceSize, { left: 24, right: 24, top: 92, bottom: 48 }))
  }

  const deletionPreview = confirmDelete && plan && editor.state.selectedNodeIds.length > 0
    ? deleteLayeredNodes(plan, new Set(editor.state.selectedNodeIds))
    : null

  function confirmDeletion() {
    if (!deletionPreview) return
    const snapshot = { layout, ids: new Set(deletionPreview.deletedNodeIds) }
    editor.actions.deleteSelected()
    setDeleteExit(snapshot)
    setConfirmDelete(false)
    window.setTimeout(() => setDeleteExit(null), 240)
  }

  return (
    <div className={relationsOpen ? 'graph-editor-layout is-relations-open' : 'graph-editor-layout'}>
      <section className="graph-canvas-area" aria-label="配种图编辑器">
        <div className="graph-canvas-toolbar" role="toolbar" aria-label="配种图工具">
          <div className="graph-tool-group" aria-label="操作模式">
            <GraphToolButton label="光标" icon="select" active={tool === 'cursor'} onClick={() => setTool('cursor')} />
            <GraphToolButton label="仅平移" icon="pan" active={tool === 'pan'} onClick={() => setTool('pan')} />
            <GraphToolButton label="查询获取方式" icon="search" active={tool === 'query'} onClick={() => setTool('query')} />
          </div>
          <div className="graph-tool-separator" aria-hidden="true" />
          <div className="graph-tool-group" aria-label="关系编辑">
            <GraphToolButton label="产生子代" icon="child" disabled={editor.state.selectedNodeIds.length !== 2} onClick={editor.actions.createChild} />
            <GraphToolButton label="删除选中节点" icon="delete" danger disabled={editor.state.selectedNodeIds.length === 0} onClick={() => setConfirmDelete(true)} />
          </div>
          <div className="graph-tool-separator" aria-hidden="true" />
          <div className="graph-tool-group" aria-label="编辑历史">
            <GraphToolButton label="撤销" icon="undo" disabled={!editor.state.canUndo} onClick={editor.actions.undo} />
            <GraphToolButton label="重做" icon="redo" disabled={!editor.state.canRedo} onClick={editor.actions.redo} />
          </div>
          <div className="graph-tool-separator" aria-hidden="true" />
          <div className="graph-tool-group" aria-label="画布视图">
            <GraphToolButton label="适应画布" icon="fit" disabled={!layout.bounds} onClick={fitCanvas} />
            <GraphToolButton label="放大画布" icon="zoom-in" disabled={viewportRef.current.zoom >= GRAPH_MAX_ZOOM} onClick={() => { applyViewport({ ...viewportRef.current, zoom: viewportRef.current.zoom + 0.2 }); settleViewport(viewportRef.current) }} />
            <GraphToolButton label="缩小画布" icon="zoom-out" disabled={viewportRef.current.zoom <= GRAPH_MIN_ZOOM} onClick={() => { applyViewport({ ...viewportRef.current, zoom: viewportRef.current.zoom - 0.2 }); settleViewport(viewportRef.current) }} />
          </div>
        </div>
        <div
          ref={surfaceRef}
          tabIndex={0}
          className={`graph-forest-surface is-tool-${tool}${isPanning ? ' is-panning' : ''}`}
          onKeyDown={handleKeyDown}
          onPointerDown={beginPan}
          onPointerMove={movePan}
          onPointerUp={finishPan}
          onPointerCancel={finishPan}
          onWheel={handleWheel}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes(PAL_DRAG_MIME)) {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
            }
          }}
          onDrop={(event) => event.preventDefault()}
        >
          <div
            ref={sceneRef}
            className="graph-forest-scene"
            style={{ width: Math.max(layout.bounds?.width ?? 1, 1), height: Math.max(layout.bounds?.height ?? 1, 1), transform: `translate3d(${viewportRef.current.x}px, ${viewportRef.current.y}px, 0) scale(${viewportRef.current.zoom})` }}
          >
            <svg className="graph-forest-edges" aria-hidden="true">
              <defs><marker id="graph-arrow-v2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
              {layout.edges.map((edge) => <LayeredEdge key={edge.id} edge={edge} nodeById={layout.nodeById} danger={deletionPreview?.deletedRelationIds.includes(edge.relationId) ?? false} />)}
            </svg>
            {showInsertSlots && insertionSlots.map((slot) => (
              <SlotButton key={slot.id} slot={slot} layout={layout} active={hoveredSlotId === slot.id} onHover={setHoveredSlotId} onDrop={(palId) => editor.actions.placeManualNode(palId, slot)} />
            ))}
            {showCombineSlots && combineSlots.map((slot) => (
              <button key={slot.id} type="button" data-combine-node={slot.anchorNodeId} className="graph-combine-slot" aria-label={slot.label} style={combineSlotPosition(slot, layout)} />
            ))}
            {layout.nodes.map((node) => {
              const graphNode = graphNodeById.get(node.id)
              const pal = graphNode ? palsById.get(graphNode.palId) : undefined
              const selected = editor.state.selectedNodeIds.includes(node.id)
              const danger = deletionPreview?.deletedNodeIds.includes(node.id) ?? false
              return (
                <button
                  key={node.id}
                  type="button"
                  className={`graph-forest-node${selected ? ' is-selected' : ''}${danger ? ' is-delete-preview' : ''}`}
                  style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
                  aria-pressed={selected}
                  aria-label={pal ? `帕鲁节点 ${pal.name.zhHans}` : `帕鲁节点 ${graphNode?.palId ?? node.id}`}
                  onPointerDown={(event) => beginNodePointerDrag(event, node.id)}
                  onPointerMove={moveNodePointerDrag}
                  onPointerUp={finishNodePointerDrag}
                  onClick={(event) => { event.stopPropagation(); if (!ignoreClickRef.current) selectNode(node.id) }}
                  onDragStart={(event) => event.preventDefault()}
                >
                  {pal ? <div className="graph-flow-node-content"><LocalPalImage pal={pal} size="tree" /><span><strong>{pal.name.zhHans}</strong><small>{pal.paldexNo ? `#${pal.paldexNo}` : '无编号'}</small></span></div> : graphNode?.palId}
                </button>
              )
            })}
            {deleteExit && <DeleteExitSceneV2 snapshot={deleteExit} graphNodeById={graphNodeById} palsById={palsById} />}
          </div>
          {layout.nodes.length === 0 && <div className="graph-canvas-empty graph-canvas-empty--overlay"><span aria-hidden="true">◇</span><h2>空槽位</h2><p>从左侧加入帕鲁，或使用键盘/按钮选择放置位置。</p></div>}
        </div>
        {(editor.state.error || editor.state.statusMessage) && <p className={editor.state.error ? 'graph-inline-error' : 'graph-status-message'} role={editor.state.error ? 'alert' : 'status'}>{editor.state.error || editor.state.statusMessage}</p>}
      </section>
      <button type="button" className="graph-relations-toggle graph-side-icon-button quiet-button" aria-expanded={relationsOpen} aria-label={relationsOpen ? '收起配方与关系列表' : `打开配方与关系列表（已标记 ${markedRecipes.length}，关系 ${plan?.relations.length ?? 0}）`} data-tooltip="配方与关系列表" onClick={() => { const next = !relationsOpen; if (next && markedRecipes.length > 0) setRightPanelTab('marked'); setRelationsOpen(next); onRelationsOpenChange?.(next) }}><span aria-hidden="true">☷</span><span className="graph-panel-counts" aria-hidden="true">{markedRecipes.length}/{plan?.relations.length ?? 0}</span></button>
      {relationsOpen && <section className="graph-relation-list" aria-label="配方与关系列表">
        <div className="graph-side-tabs" role="tablist" aria-label="右侧栏内容">
          <button type="button" role="tab" aria-selected={rightPanelTab === 'marked'} className={rightPanelTab === 'marked' ? 'is-active' : ''} onClick={() => setRightPanelTab('marked')}>已标记配方 {markedRecipes.length}</button>
          <button type="button" role="tab" aria-selected={rightPanelTab === 'relations'} className={rightPanelTab === 'relations' ? 'is-active' : ''} onClick={() => setRightPanelTab('relations')}>当前方案关系 {plan?.relations.length ?? 0}</button>
        </div>
        {rightPanelTab === 'marked' ? <div className="graph-marked-recipes" role="tabpanel" aria-label="已标记配方">{markedRecipes.length === 0 ? <p className="preset-empty">尚未标记配方</p> : markedRecipes.map((recipe) => <FormulaCard key={recipe.recipeIndex} recipe={recipe} palsById={palsById} compact marked onToggleMark={(match) => onToggleRecipeMark(match.recipeIndex)} />)}</div> : <div role="tabpanel" aria-label="当前方案关系">{!plan || plan.relations.length === 0 ? <p className="preset-empty">尚未创建配种关系</p> : <ol>{plan.relations.map((relation) => { const a = plan.nodes.find((node) => node.id === relation.parentANodeId); const b = plan.nodes.find((node) => node.id === relation.parentBNodeId); const child = plan.nodes.find((node) => node.id === relation.childNodeId); return <li key={relation.id}>{palName(a?.palId, palsById)} + {palName(b?.palId, palsById)} → {palName(child?.palId, palsById)}</li> })}</ol>}</div>}
      </section>}
      {editor.state.recipeChoices.length > 0 && <RecipeChoiceDialog choices={editor.state.recipeChoices} palsById={palsById} onChoose={editor.actions.chooseChild} onCancel={editor.actions.cancelChildChoice} />}
      {confirmDelete && deletionPreview && <DeleteNodesDialog deletedNodeCount={deletionPreview.deletedNodeIds.length} deletedRelationCount={deletionPreview.deletedRelationIds.length} onClose={() => setConfirmDelete(false)} onConfirm={confirmDeletion} />}
    </div>
  )
}

function SlotButton({ slot, layout, active, onHover, onDrop }: { slot: LayeredSlotTarget; layout: LayeredLayout; active: boolean; onHover(slotId: string | null): void; onDrop(palId: string): void }) {
  if (!slot) return null
  const { x, y } = slotPosition(slot, layout)
  return <button type="button" className={`graph-slot graph-slot--${slot.kind}${active ? ' is-active' : ''}`} style={{ left: x, top: y }} aria-label={slot.label} data-slot-id={slot.id} onMouseEnter={() => onHover(slot.id)} onMouseLeave={() => onHover(null)} onClick={() => undefined} onDragOver={(event) => { if (event.dataTransfer.types.includes(PAL_DRAG_MIME)) { event.preventDefault(); onHover(slot.id) } }} onDragLeave={() => onHover(null)} onDrop={(event) => { const palId = event.dataTransfer.getData(PAL_DRAG_MIME); if (palId) { event.preventDefault(); onDrop(palId); onHover(null) } }}>{slot.kind === 'empty' ? '放入帕鲁' : slot.direction === 'left' ? '＋ 左侧' : '＋ 右侧'}</button>
}

function slotPosition(slot: LayeredSlotTarget, layout: LayeredLayout): { x: number; y: number } {
  if (slot.kind === 'empty') return { x: Math.max(24, (layout.bounds?.width ?? 320) / 2 - 56), y: 160 }
  const rowNodes = layout.nodes.filter((node) => node.row === slot.row).sort((left, right) => left.index - right.index)
  const anchor = slot.anchorNodeId ? layout.nodeById.get(slot.anchorNodeId) : undefined
  const neighbor = slot.direction === 'left'
    ? rowNodes.find((node) => node.index === slot.index - 1)
    : rowNodes.find((node) => node.index === slot.index)
  const x = neighbor && anchor
    ? ((neighbor.x + neighbor.width) + anchor.x) / 2 - 48
    : slot.direction === 'left'
      ? (anchor?.x ?? 56) - 104
      : (anchor?.x ?? 56) + (anchor?.width ?? 160) + 8
  return { x: Math.max(8, x), y: (anchor?.y ?? (slot.row * 180 + 108)) + 20 }
}

function combineSlotPosition(slot: LayeredSlotTarget, layout: LayeredLayout): { left: number; top: number } {
  const node = slot.anchorNodeId ? layout.nodeById.get(slot.anchorNodeId) : undefined
  return { left: (node?.x ?? 0) + (node?.width ?? 160) + 8, top: (node?.y ?? 0) + 20 }
}

function LayeredEdge({ edge, nodeById, danger }: { edge: { sourceNodeId: string; targetNodeId: string; relationId: string }; nodeById: ReadonlyMap<string, { x: number; y: number; width: number; height: number }>; danger: boolean }) {
  const source = nodeById.get(edge.sourceNodeId)
  const target = nodeById.get(edge.targetNodeId)
  if (!source || !target) return null
  const sourceX = source.x + source.width / 2
  const sourceY = source.y + source.height
  const targetX = target.x + target.width / 2
  const targetY = target.y
  const middleY = (sourceY + targetY) / 2
  return <path className={`graph-forest-edge${danger ? ' is-delete-preview' : ''}`} d={`M ${sourceX} ${sourceY} C ${sourceX} ${middleY}, ${targetX} ${middleY}, ${targetX} ${targetY}`} markerEnd="url(#graph-arrow-v2)" />
}

function DeleteExitScene({ snapshot, palsById }: { snapshot: { layout: LayeredLayout; ids: Set<string> }; palsById: ReadonlyMap<string, PalRecord> }) {
  return <div className="graph-delete-exit-scene">{snapshot.layout.nodes.filter((node) => snapshot.ids.has(node.id)).map((node) => { const pal = palsById.get(node.id); return <div key={node.id} className="graph-forest-node is-delete-preview" style={{ left: node.x, top: node.y, width: node.width, height: node.height }}>{pal?.name.zhHans ?? '已删除节点'}</div> })}</div>
}

function DeleteExitSceneV2({ snapshot, graphNodeById, palsById }: { snapshot: { layout: LayeredLayout; ids: Set<string> }; graphNodeById: ReadonlyMap<string, { palId: string }>; palsById: ReadonlyMap<string, PalRecord> }) {
  const edges = snapshot.layout.edges.filter((edge) => snapshot.ids.has(edge.sourceNodeId) || snapshot.ids.has(edge.targetNodeId))
  return <div className="graph-delete-exit-scene"><svg className="graph-delete-exit-edges" aria-hidden="true">{edges.map((edge) => <LayeredEdge key={edge.id} edge={edge} nodeById={snapshot.layout.nodeById} danger />)}</svg>{snapshot.layout.nodes.filter((node) => snapshot.ids.has(node.id)).map((node) => { const palId = graphNodeById.get(node.id)?.palId; const pal = palId ? palsById.get(palId) : undefined; return <div key={node.id} className="graph-forest-node is-delete-preview" style={{ left: node.x, top: node.y, width: node.width, height: node.height }}>{pal?.name.zhHans ?? 'deleted node'}</div> })}</div>
}

function RecipeChoiceDialog({ choices, palsById, onChoose, onCancel }: { choices: BreedingRecipeMatch[]; palsById: ReadonlyMap<string, PalRecord>; onChoose: (match: BreedingRecipeMatch) => void; onCancel: () => void }) {
  return <div className="graph-modal-backdrop"><div className="graph-modal" role="dialog" aria-modal="true" aria-labelledby="recipe-choice-title"><h2 id="recipe-choice-title">选择子代配方</h2><div className="graph-recipe-choices">{choices.map((choice) => <button type="button" className="quiet-button" key={choice.recipeIndex} onClick={() => onChoose(choice)}>{palName(choice.childId, palsById)}</button>)}</div><button type="button" className="quiet-button" onClick={onCancel}>取消</button></div></div>
}

function DeleteNodesDialog({ deletedNodeCount, deletedRelationCount, onClose, onConfirm }: { deletedNodeCount: number; deletedRelationCount: number; onClose: () => void; onConfirm: () => void }) {
  return <div className="graph-modal-backdrop"><div className="graph-modal graph-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-nodes-title"><h2 id="delete-nodes-title">删除节点及其后代</h2><p>将删除 {deletedNodeCount} 个节点和 {deletedRelationCount} 条关系。</p><p className="graph-delete-warning">删除区域已用红色标出，确认后无法恢复。</p><div className="graph-modal-actions"><button type="button" className="primary-button graph-danger-button" autoFocus onClick={onConfirm}>确认删除</button><button type="button" className="quiet-button" onClick={onClose}>取消</button></div></div></div>
}

function palName(palId: string | undefined, palsById: ReadonlyMap<string, PalRecord>): string { return palId ? palsById.get(palId)?.name.zhHans ?? palId : '未知节点' }

function emptyPlan() {
  const now = new Date(0).toISOString()
  return { id: 'empty', schemaVersion: 2 as const, name: '', layers: [], nodes: [], relations: [], viewport: { x: 0, y: 0, zoom: 1 }, createdAt: now, updatedAt: now }
}
