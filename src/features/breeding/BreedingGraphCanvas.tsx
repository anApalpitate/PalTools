import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LocalPalImage } from '../../components/pal-ui'
import {
  createForestLayoutEngine,
  type ForestLayoutEdge,
  type ForestLayoutNode,
} from '../../domain/breeding-forest-layout'
import type { GraphViewportV1 } from '../../domain/breeding-graph'
import {
  GRAPH_MAX_ZOOM,
  GRAPH_MIN_ZOOM,
  clampGraphViewport,
  fitGraphViewport,
  graphBoundsIntersect,
  revealGraphBounds,
  visibleGraphBounds,
  zoomGraphViewportAtPoint,
} from '../../domain/graph-viewport'
import type { BreedingRecipeMatch, PalRecord } from '../../domain/types'
import type { useBreedingPlanEditor } from '../../hooks/useBreedingPlanEditor'
import { FormulaCard } from './BreedingComponents'
import { GraphToolButton } from './GraphToolButton'

export const PAL_DRAG_MIME = 'application/x-paltools-pal-id'
type GraphTool = 'select' | 'pan' | 'query'

export function BreedingGraphCanvas({
  palsById,
  editor,
  markedRecipes,
  onToggleRecipeMark,
  onQueryPal,
  leftInset = 0,
}: {
  palsById: ReadonlyMap<string, PalRecord>
  editor: ReturnType<typeof useBreedingPlanEditor>
  markedRecipes: BreedingRecipeMatch[]
  onToggleRecipeMark(recipeIndex: number): void
  onQueryPal: (palId: string) => void
  leftInset?: number
}) {
  const [tool, setTool] = useState<GraphTool>('select')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [relationsOpen, setRelationsOpen] = useState(false)
  const [rightPanelTab, setRightPanelTab] = useState<'marked' | 'relations'>(
    'relations',
  )
  const [isPanning, setIsPanning] = useState(false)
  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 })
  const plan = editor.state.plan
  const layoutEngineRef = useRef(createForestLayoutEngine())
  const layout = useMemo(
    () =>
      plan
        ? layoutEngineRef.current.compute(plan, palsById)
        : layoutEngineRef.current.compute(emptyPlan(), palsById),
    [palsById, plan?.nodes, plan?.relations],
  )
  const graphNodeById = useMemo(
    () => new Map((plan?.nodes ?? []).map((node) => [node.id, node])),
    [plan?.nodes],
  )
  const initialViewport = clampGraphViewport(plan?.viewport ?? { x: 0, y: 0, zoom: 1 })
  const [settledViewport, setSettledViewport] = useState(initialViewport)
  const viewportRef = useRef(initialViewport)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number | null>(null)
  const rightPanelInitializedRef = useRef(false)
  const wheelCommitRef = useRef<number | null>(null)
  const panRef = useRef<{
    pointerId: number
    clientX: number
    clientY: number
    viewport: GraphViewportV1
  } | null>(null)

  const applyViewport = useCallback((viewport: GraphViewportV1) => {
    const next = clampGraphViewport(viewport)
    viewportRef.current = next
    if (sceneRef.current) {
      sceneRef.current.style.transform = `translate3d(${next.x}px, ${next.y}px, 0) scale(${next.zoom})`
    }
    return next
  }, [])

  const settleViewport = useCallback(
    (viewport: GraphViewportV1) => {
      const next = applyViewport(viewport)
      setSettledViewport(next)
      editor.actions.setViewport(next)
    },
    [applyViewport, editor.actions],
  )

  useEffect(() => {
    const handleWindowBlur = () => {
      if (!panRef.current) return

      panRef.current = null
      setIsPanning(false)
      settleViewport(viewportRef.current)
    }

    window.addEventListener('blur', handleWindowBlur)
    return () => window.removeEventListener('blur', handleWindowBlur)
  }, [settleViewport])

  useEffect(() => {
    const next = clampGraphViewport(plan?.viewport ?? { x: 0, y: 0, zoom: 1 })
    viewportRef.current = next
    setSettledViewport(next)
    applyViewport(next)
  }, [applyViewport, plan?.id])

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return
    const update = () => {
      const rect = surface.getBoundingClientRect()
      setSurfaceSize({ width: rect.width, height: rect.height })
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(surface)
    return () => observer.disconnect()
  }, [])

  useEffect(
    () => () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
      if (wheelCommitRef.current !== null) window.clearTimeout(wheelCommitRef.current)
    },
    [],
  )

  const animateViewport = useCallback(
    (target: GraphViewportV1, duration: number) => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
      const start = viewportRef.current
      const next = clampGraphViewport(target)
      let startedAt: number | null = null
      const frame = (now: number) => {
        startedAt ??= now
        const progress = Math.min(1, (now - startedAt) / duration)
        const eased = 1 - Math.pow(1 - progress, 3)
        applyViewport({
          x: start.x + (next.x - start.x) * eased,
          y: start.y + (next.y - start.y) * eased,
          zoom: start.zoom + (next.zoom - start.zoom) * eased,
        })
        if (progress < 1) {
          animationRef.current = requestAnimationFrame(frame)
        } else {
          animationRef.current = null
          settleViewport(next)
        }
      }
      animationRef.current = requestAnimationFrame(frame)
    },
    [applyViewport, settleViewport],
  )

  const fitCanvas = useCallback(() => {
    const toolbarHeight = toolbarRef.current?.getBoundingClientRect().height ?? 0
    animateViewport(
      fitGraphViewport(
        layout.bounds,
        surfaceSize,
        { left: leftInset, bottom: toolbarHeight + 20 },
      ),
      180,
    )
  }, [animateViewport, layout.bounds, leftInset, surfaceSize])

  const zoomAtCenter = useCallback(
    (delta: number) => {
      animateViewport(
        zoomGraphViewportAtPoint(
          viewportRef.current,
          viewportRef.current.zoom + delta,
          { x: surfaceSize.width / 2, y: surfaceSize.height / 2 },
        ),
        120,
      )
    },
    [animateViewport, surfaceSize],
  )

  useEffect(() => {
    const nodeId = editor.state.revealNodeId
    if (!nodeId) return
    const node = layout.nodeById.get(nodeId)
    if (!node) {
      editor.actions.acknowledgeRevealNode(nodeId)
      return
    }
    if (surfaceSize.width <= 0 || surfaceSize.height <= 0) return
    const toolbarHeight =
      toolbarRef.current?.getBoundingClientRect().height ?? 0
    settleViewport(
      revealGraphBounds(viewportRef.current, node, surfaceSize, {
        left: leftInset,
        bottom: toolbarHeight + 20,
      }),
    )
    editor.actions.acknowledgeRevealNode(nodeId)
  }, [
    editor.actions,
    editor.state.revealNodeId,
    layout.nodeById,
    leftInset,
    settleViewport,
    surfaceSize,
  ])

  function handleNodeClick(nodeId: string) {
    if (tool === 'query') {
      const palId = graphNodeById.get(nodeId)?.palId
      if (palId) onQueryPal(palId)
      return
    }
    const next = editor.state.selectedNodeIds.includes(nodeId)
      ? editor.state.selectedNodeIds.filter((id) => id !== nodeId)
      : [...editor.state.selectedNodeIds, nodeId].slice(-2)
    editor.actions.setSelectedNodeIds(next)
  }

  const visibleBounds = visibleGraphBounds(settledViewport, surfaceSize)
  const visibleNodes = layout.nodes.filter((node) =>
    graphBoundsIntersect(visibleBounds, node),
  )
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id))
  const visibleEdges = layout.edges.filter(
    (edge) =>
      visibleNodeIds.has(edge.sourceNodeId) || visibleNodeIds.has(edge.targetNodeId),
  )

  return (
    <div className={relationsOpen ? 'graph-editor-layout is-relations-open' : 'graph-editor-layout'}>
      <section className="graph-canvas-area" aria-label="配种图画布">
        <div ref={toolbarRef} className="graph-canvas-toolbar" role="toolbar" aria-label="配种图基础工具">
          <div className="graph-tool-group" aria-label="操作模式">
            <GraphToolButton label="选择节点" icon="select" active={tool === 'select'} onClick={() => setTool('select')} />
            <GraphToolButton label="平移画布" icon="pan" active={tool === 'pan'} onClick={() => setTool('pan')} />
            <GraphToolButton label="查询获取方式" icon="search" active={tool === 'query'} onClick={() => setTool('query')} />
          </div>
          <div className="graph-tool-separator" aria-hidden="true" />
          <div className="graph-tool-group" aria-label="关系编辑">
            <GraphToolButton label="创建子代" icon="child" disabled={editor.state.selectedNodeIds.length !== 2} onClick={editor.actions.createChild} />
            <GraphToolButton label="合并节点" icon="merge" disabled={editor.state.selectedNodeIds.length !== 2} onClick={editor.actions.mergeSelected} />
            <GraphToolButton label="删除选中节点" icon="delete" danger disabled={editor.state.selectedNodeIds.length === 0} onClick={() => setConfirmDelete(true)} />
          </div>
          <div className="graph-tool-separator" aria-hidden="true" />
          <div className="graph-tool-group" aria-label="编辑历史">
            <GraphToolButton label="撤销" icon="undo" disabled={!editor.state.canUndo} onClick={editor.actions.undo} />
            <GraphToolButton label="重做" icon="redo" disabled={!editor.state.canRedo} onClick={editor.actions.redo} />
          </div>
          <div className="graph-tool-separator" aria-hidden="true" />
          <div className="graph-tool-group" aria-label="画布视图">
            <GraphToolButton label="重新整理" icon="layout" disabled={!plan || plan.nodes.length === 0} onClick={editor.actions.autoLayout} />
            <GraphToolButton label="适应画布" icon="fit" disabled={layout.nodes.length === 0} onClick={fitCanvas} />
            <GraphToolButton label="放大画布" icon="zoom-in" disabled={settledViewport.zoom >= GRAPH_MAX_ZOOM} onClick={() => zoomAtCenter(0.2)} />
            <GraphToolButton label="缩小画布" icon="zoom-out" disabled={settledViewport.zoom <= GRAPH_MIN_ZOOM} onClick={() => zoomAtCenter(-0.2)} />
          </div>
        </div>

        <div
          ref={surfaceRef}
          className={`graph-forest-surface is-tool-${tool}${isPanning ? ' is-panning' : ''}`}
          onPointerDown={(event) => {
            if (tool !== 'pan' || event.button !== 0) return
            event.currentTarget.setPointerCapture(event.pointerId)
            panRef.current = {
              pointerId: event.pointerId,
              clientX: event.clientX,
              clientY: event.clientY,
              viewport: viewportRef.current,
            }
            setIsPanning(true)
          }}
          onPointerMove={(event) => {
            const pan = panRef.current
            if (!pan || pan.pointerId !== event.pointerId) return
            applyViewport({
              ...pan.viewport,
              x: pan.viewport.x + event.clientX - pan.clientX,
              y: pan.viewport.y + event.clientY - pan.clientY,
            })
          }}
          onPointerUp={(event) => {
            if (panRef.current?.pointerId !== event.pointerId) return
            panRef.current = null
            setIsPanning(false)
            settleViewport(viewportRef.current)
          }}
          onPointerCancel={() => {
            const wasPanning = panRef.current !== null
            panRef.current = null
            setIsPanning(false)
            if (wasPanning) settleViewport(viewportRef.current)
          }}
          onWheel={(event) => {
            event.preventDefault()
            const rect = event.currentTarget.getBoundingClientRect()
            const next = zoomGraphViewportAtPoint(
              viewportRef.current,
              viewportRef.current.zoom * Math.exp(-event.deltaY * 0.0015),
              { x: event.clientX - rect.left, y: event.clientY - rect.top },
            )
            applyViewport(next)
            if (wheelCommitRef.current !== null) window.clearTimeout(wheelCommitRef.current)
            wheelCommitRef.current = window.setTimeout(() => {
              wheelCommitRef.current = null
              settleViewport(viewportRef.current)
            }, 140)
          }}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes(PAL_DRAG_MIME)) {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
            }
          }}
          onDrop={(event) => {
            const palId = event.dataTransfer.getData(PAL_DRAG_MIME)
            if (!palId) return
            event.preventDefault()
            editor.actions.addManualNode(palId)
          }}
        >
          <div
            ref={sceneRef}
            className="graph-forest-scene"
            style={{
              width: Math.max(layout.bounds?.width ?? 0, 1),
              height: Math.max(layout.bounds?.height ?? 0, 1),
              transform: `translate3d(${settledViewport.x}px, ${settledViewport.y}px, 0) scale(${settledViewport.zoom})`,
            }}
          >
            <svg className="graph-forest-edges" aria-hidden="true">
              <defs>
                <marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" />
                </marker>
              </defs>
              {visibleEdges.map((edge) => (
                <ForestEdge key={edge.id} edge={edge} nodeById={layout.nodeById} />
              ))}
            </svg>
            {visibleNodes.map((node) => {
              const graphNode = graphNodeById.get(node.id)
              const pal = graphNode ? palsById.get(graphNode.palId) : undefined
              const selected = editor.state.selectedNodeIds.includes(node.id)
              return (
                <button
                  type="button"
                  key={node.id}
                  className={`graph-forest-node${selected ? ' is-selected' : ''}`}
                  style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
                  aria-pressed={selected}
                  aria-label={pal ? `帕鲁节点 ${pal.name.zhHans}${pal.paldexNo ? ` #${pal.paldexNo}` : ''}` : `帕鲁节点 ${graphNode?.palId ?? node.id}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleNodeClick(node.id)
                  }}
                  onDragStart={(event) => event.preventDefault()}
                >
                  {pal ? (
                    <div className="graph-flow-node-content">
                      <LocalPalImage pal={pal} size="tree" />
                      <span>
                        <strong>{pal.name.zhHans}</strong>
                        <small>{pal.paldexNo ? `#${pal.paldexNo}` : '无编号'}</small>
                      </span>
                    </div>
                  ) : graphNode?.palId}
                </button>
              )
            })}
          </div>
          {layout.nodes.length === 0 && (
            <div className="graph-canvas-empty graph-canvas-empty--overlay">
              <span aria-hidden="true">◇</span>
              <h2>空画布</h2>
              <p>从“加入帕鲁”侧栏拖入帕鲁，或使用加入按钮。</p>
            </div>
          )}
        </div>
        {(editor.state.error || editor.state.statusMessage) && (
          <p className={editor.state.error ? 'graph-inline-error' : 'graph-status-message'} role={editor.state.error ? 'alert' : 'status'}>
            {editor.state.error || editor.state.statusMessage}
          </p>
        )}
      </section>

      <button type="button" className="graph-relations-toggle quiet-button" aria-expanded={relationsOpen} onClick={() => {
        if (!relationsOpen && !rightPanelInitializedRef.current) {
          setRightPanelTab(markedRecipes.length > 0 ? 'marked' : 'relations')
          rightPanelInitializedRef.current = true
        }
        setRelationsOpen((open) => !open)
      }}>
        {relationsOpen
          ? '收起配方与关系列表'
          : `配方 ${markedRecipes.length} · 关系 ${plan?.relations.length ?? 0}`}
      </button>
      {relationsOpen && (
        <section className="graph-relation-list" aria-label="配方与关系列表">
          <div className="graph-side-tabs" role="tablist" aria-label="右侧栏内容">
            <button
              type="button"
              role="tab"
              aria-selected={rightPanelTab === 'marked'}
              className={rightPanelTab === 'marked' ? 'is-active' : ''}
              onClick={() => setRightPanelTab('marked')}
            >
              已标记配方 {markedRecipes.length}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={rightPanelTab === 'relations'}
              className={rightPanelTab === 'relations' ? 'is-active' : ''}
              onClick={() => setRightPanelTab('relations')}
            >
              当前方案关系 {plan?.relations.length ?? 0}
            </button>
          </div>
          {rightPanelTab === 'marked' ? (
            <div className="graph-marked-recipes" role="tabpanel" aria-label="已标记配方">
              {markedRecipes.length === 0 ? (
                <p className="preset-empty">尚未标记配方</p>
              ) : (
                markedRecipes.map((recipe) => (
                  <FormulaCard
                    key={recipe.recipeIndex}
                    recipe={recipe}
                    palsById={palsById}
                    compact
                    marked
                    onToggleMark={(match) =>
                      onToggleRecipeMark(match.recipeIndex)
                    }
                  />
                ))
              )}
            </div>
          ) : (
            <div role="tabpanel" aria-label="当前方案关系">
              {!plan || plan.relations.length === 0 ? <p className="preset-empty">尚未创建配种关系</p> : (
                <ol>{plan.relations.map((relation) => {
                  const parentA = plan.nodes.find((node) => node.id === relation.parentANodeId)
                  const parentB = plan.nodes.find((node) => node.id === relation.parentBNodeId)
                  const child = plan.nodes.find((node) => node.id === relation.childNodeId)
                  return <li key={relation.id}><span>{palName(parentA?.palId, palsById)} + {palName(parentB?.palId, palsById)} → {palName(child?.palId, palsById)}</span><button type="button" className="quiet-button graph-danger-button" onClick={() => editor.actions.deleteRelation(relation.id)} aria-label={`删除关系 ${palName(parentA?.palId, palsById)} 加 ${palName(parentB?.palId, palsById)} 得到 ${palName(child?.palId, palsById)}`}>删除关系</button></li>
                })}</ol>
              )}
            </div>
          )}
        </section>
      )}

      {editor.state.recipeChoices.length > 0 && <RecipeChoiceDialog choices={editor.state.recipeChoices} palsById={palsById} onChoose={editor.actions.chooseChild} onCancel={editor.actions.cancelChildChoice} />}
      {confirmDelete && <DeleteNodesDialog editor={editor} onClose={() => setConfirmDelete(false)} />}
    </div>
  )
}

function ForestEdge({ edge, nodeById }: { edge: ForestLayoutEdge; nodeById: ReadonlyMap<string, ForestLayoutNode> }) {
  const source = nodeById.get(edge.sourceNodeId)
  const target = nodeById.get(edge.targetNodeId)
  if (!source || !target) return null
  const sourceX = source.x + source.width / 2
  const sourceY = source.y + source.height
  const targetX = target.x + target.width / 2
  const targetY = target.y
  const middleY = (sourceY + targetY) / 2
  return <path className="graph-forest-edge" d={`M ${sourceX} ${sourceY} C ${sourceX} ${middleY}, ${targetX} ${middleY}, ${targetX} ${targetY}`} markerEnd="url(#graph-arrow)" />
}

function RecipeChoiceDialog({ choices, palsById, onChoose, onCancel }: { choices: BreedingRecipeMatch[]; palsById: ReadonlyMap<string, PalRecord>; onChoose: (match: BreedingRecipeMatch) => void; onCancel: () => void }) {
  return <div className="graph-modal-backdrop"><div className="graph-modal" role="dialog" aria-modal="true" aria-labelledby="recipe-choice-title" onKeyDown={(event) => { if (event.key === 'Escape') onCancel() }}><h2 id="recipe-choice-title">选择子代配方</h2><div className="graph-recipe-choices">{choices.map((choice, index) => <button type="button" className="quiet-button" key={choice.recipeIndex} autoFocus={index === 0} onClick={() => onChoose(choice)}>{palName(choice.childId, palsById)}</button>)}</div><div className="graph-modal-actions"><button type="button" className="quiet-button" onClick={onCancel}>取消</button></div></div></div>
}

function DeleteNodesDialog({ editor, onClose }: { editor: ReturnType<typeof useBreedingPlanEditor>; onClose: () => void }) {
  return <div className="graph-modal-backdrop"><div className="graph-modal" role="dialog" aria-modal="true" aria-labelledby="delete-nodes-title" onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}><h2 id="delete-nodes-title">删除选中节点</h2><p>将删除 {editor.state.selectedNodeIds.length} 个节点，并移除 {affectedRelationCount(editor.state.plan, editor.state.selectedNodeIds)} 条直接关系。</p><div className="graph-modal-actions"><button type="button" className="primary-button" autoFocus onClick={() => { editor.actions.deleteSelected(); onClose() }}>删除</button><button type="button" className="quiet-button" onClick={onClose}>取消</button></div></div></div>
}

function palName(palId: string | undefined, palsById: ReadonlyMap<string, PalRecord>): string {
  if (!palId) return '未知节点'
  return palsById.get(palId)?.name.zhHans ?? palId
}

function affectedRelationCount(plan: ReturnType<typeof useBreedingPlanEditor>['state']['plan'], nodeIds: string[]): number {
  const selected = new Set(nodeIds)
  return (plan?.relations ?? []).filter((relation) => selected.has(relation.parentANodeId) || selected.has(relation.parentBNodeId) || selected.has(relation.childNodeId)).length
}

function emptyPlan() {
  const now = new Date(0).toISOString()
  return { id: '', schemaVersion: 1 as const, name: '', nodes: [], relations: [], viewport: { x: 0, y: 0, zoom: 1 }, createdAt: now, updatedAt: now }
}
