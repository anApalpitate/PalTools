import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useMemo, useState } from 'react'
import { LocalPalImage } from '../../components/pal-ui'
import type { BreedingRecipeMatch, PalRecord } from '../../domain/types'
import type { useBreedingPlanEditor } from '../../hooks/useBreedingPlanEditor'

export const PAL_DRAG_MIME = 'application/x-paltools-pal-id'

export function BreedingGraphCanvas({
  palsById,
  editor,
  onQueryPal,
  onAddPalToPreset,
}: {
  palsById: ReadonlyMap<string, PalRecord>
  editor: ReturnType<typeof useBreedingPlanEditor>
  onQueryPal: (palId: string) => void
  onAddPalToPreset: (palId: string) => void
}) {
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null)
  const [tool, setTool] = useState<'select' | 'pan' | 'query'>('select')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const plan = editor.state.plan
  const selected = new Set(editor.state.selectedNodeIds)
  const nodes = useMemo<Node[]>(
    () =>
      (plan?.nodes ?? []).map((node) => {
        const pal = palsById.get(node.palId)
        return {
          id: node.id,
          position: node.position,
          selected: selected.has(node.id),
          ariaLabel: pal
            ? `帕鲁节点 ${pal.name.zhHans}${pal.paldexNo ? ` #${pal.paldexNo}` : ''}`
            : `帕鲁节点 ${node.palId}`,
          data: {
            label: pal ? (
              <div className="graph-flow-node-content">
                <LocalPalImage pal={pal} size="tree" />
                <span>
                  <strong>{pal.name.zhHans}</strong>
                  <small>{pal.paldexNo ? `#${pal.paldexNo}` : '无编号'}</small>
                </span>
              </div>
            ) : (
              node.palId
            ),
          },
          className: 'graph-flow-node',
        }
      }),
    [palsById, plan?.nodes, editor.state.selectedNodeIds],
  )
  const edges = useMemo<Edge[]>(
    () =>
      (plan?.relations ?? []).flatMap((relation) => [
        {
          id: `${relation.id}-a`,
          source: relation.parentANodeId,
          target: relation.childNodeId,
          markerEnd: { type: MarkerType.ArrowClosed },
          className: 'graph-flow-edge',
        },
        {
          id: `${relation.id}-b`,
          source: relation.parentBNodeId,
          target: relation.childNodeId,
          markerEnd: { type: MarkerType.ArrowClosed },
          className: 'graph-flow-edge',
        },
      ]),
    [plan?.relations],
  )

  function handleNodeClick(nodeId: string) {
    if (tool === 'query') {
      const palId = plan?.nodes.find((node) => node.id === nodeId)?.palId
      if (palId) onQueryPal(palId)
      return
    }
    const next = editor.state.selectedNodeIds.includes(nodeId)
      ? editor.state.selectedNodeIds.filter((id) => id !== nodeId)
      : [...editor.state.selectedNodeIds, nodeId].slice(-2)
    editor.actions.setSelectedNodeIds(next)
  }

  function handleMoveEnd(viewport: Viewport) {
    editor.actions.setViewport(viewport)
  }

  return (
    <>
      <section className="graph-canvas-area" aria-label="配种图画布">
        <div className="graph-canvas-toolbar" role="toolbar" aria-label="配种图基础工具">
          <button
            type="button"
            className={tool === 'select' ? 'quiet-button is-active' : 'quiet-button'}
            aria-pressed={tool === 'select'}
            onClick={() => setTool('select')}
          >
            选择/移动
          </button>
          <button
            type="button"
            className={tool === 'pan' ? 'quiet-button is-active' : 'quiet-button'}
            aria-pressed={tool === 'pan'}
            onClick={() => setTool('pan')}
          >
            平移
          </button>
          <button
            type="button"
            className={tool === 'query' ? 'quiet-button is-active' : 'quiet-button'}
            aria-pressed={tool === 'query'}
            onClick={() => setTool('query')}
          >
            查询获取方式
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={editor.state.selectedNodeIds.length !== 2}
            onClick={editor.actions.createChild}
          >
            创建子代
          </button>
          <button
            type="button"
            className="quiet-button"
            disabled={editor.state.selectedNodeIds.length !== 2}
            onClick={editor.actions.mergeSelected}
          >
            合并节点
          </button>
          <button
            type="button"
            className="quiet-button graph-danger-button"
            disabled={editor.state.selectedNodeIds.length === 0}
            onClick={() => setConfirmDelete(true)}
          >
            删除
          </button>
          <button
            type="button"
            className="quiet-button"
            disabled={!editor.state.canUndo}
            onClick={editor.actions.undo}
          >
            撤销
          </button>
          <button
            type="button"
            className="quiet-button"
            disabled={!editor.state.canRedo}
            onClick={editor.actions.redo}
          >
            重做
          </button>
          <button
            type="button"
            className="quiet-button"
            disabled={!plan || plan.nodes.length === 0}
            onClick={editor.actions.autoLayout}
          >
            自动整理
          </button>
          <button
            type="button"
            className="quiet-button"
            disabled={!instance || nodes.length === 0}
            onClick={() => void instance?.fitView({ duration: 180 })}
          >
            适应画布
          </button>
          <button
            type="button"
            className="quiet-button"
            disabled={!instance}
            onClick={() => void instance?.zoomIn({ duration: 120 })}
            aria-label="放大画布"
          >
            放大
          </button>
          <button
            type="button"
            className="quiet-button"
            disabled={!instance}
            onClick={() => void instance?.zoomOut({ duration: 120 })}
            aria-label="缩小画布"
          >
            缩小
          </button>
          <button
            type="button"
            className="quiet-button"
            disabled={editor.state.selectedNodeIds.length !== 1}
            onClick={() => {
              const selectedNode = plan?.nodes.find(
                (node) => node.id === editor.state.selectedNodeIds[0],
              )
              if (selectedNode) onAddPalToPreset(selectedNode.palId)
            }}
          >
            加入当前预设
          </button>
          <span className="graph-plan-save-state" aria-live="polite">
            {saveStateText(editor.state.saveState)}
          </span>
        </div>
        <div
          className="graph-flow-surface"
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes(PAL_DRAG_MIME)) {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
            }
          }}
          onDrop={(event) => {
            const palId = event.dataTransfer.getData(PAL_DRAG_MIME)
            if (!palId || !instance) return
            event.preventDefault()
            editor.actions.addPresetNode(
              palId,
              instance.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
            )
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            viewport={plan?.viewport ?? { x: 0, y: 0, zoom: 1 }}
            onInit={setInstance}
            onNodeClick={(_event, node) => handleNodeClick(node.id)}
            onNodeDragStop={(_event, node) =>
              editor.actions.updatePositions(
                new Map([[node.id, { x: node.position.x, y: node.position.y }]]),
              )
            }
            onMoveEnd={(_event, viewport) => handleMoveEnd(viewport)}
            panOnDrag={tool === 'pan'}
            nodesDraggable={tool === 'select'}
            minZoom={0.2}
            maxZoom={2}
            nodesConnectable={false}
            deleteKeyCode={null}
            fitView={nodes.length > 0}
            aria-label="可编辑帕鲁配种森林"
          >
            <Background gap={24} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
          {nodes.length === 0 && (
            <div className="graph-canvas-empty graph-canvas-empty--overlay">
              <span aria-hidden="true">◇</span>
              <h2>空画布</h2>
              <p>从当前预设队列拖入帕鲁，或使用“添加到画布”。</p>
            </div>
          )}
        </div>
        {(editor.state.error || editor.state.statusMessage) && (
          <p
            className={editor.state.error ? 'graph-inline-error' : 'graph-status-message'}
            role={editor.state.error ? 'alert' : 'status'}
          >
            {editor.state.error || editor.state.statusMessage}
          </p>
        )}
      </section>

      <section className="graph-relation-list" aria-label="配种关系列表">
        <div className="preset-queue-heading">
          <h2>文本关系列表</h2>
          <span>{plan?.relations.length ?? 0} 条</span>
        </div>
        {!plan || plan.relations.length === 0 ? (
          <p className="preset-empty">尚未创建配种关系</p>
        ) : (
          <ol>
            {plan.relations.map((relation) => {
              const parentA = plan.nodes.find((node) => node.id === relation.parentANodeId)
              const parentB = plan.nodes.find((node) => node.id === relation.parentBNodeId)
              const child = plan.nodes.find((node) => node.id === relation.childNodeId)
              return (
                <li key={relation.id}>
                  <span>
                    {palName(parentA?.palId, palsById)} +{' '}
                    {palName(parentB?.palId, palsById)} →{' '}
                    {palName(child?.palId, palsById)}
                  </span>
                  <button
                    type="button"
                    className="quiet-button graph-danger-button"
                    onClick={() => editor.actions.deleteRelation(relation.id)}
                    aria-label={`删除关系 ${palName(parentA?.palId, palsById)} 加 ${palName(parentB?.palId, palsById)} 得到 ${palName(child?.palId, palsById)}`}
                  >
                    删除关系
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {editor.state.recipeChoices.length > 0 && (
        <RecipeChoiceDialog
          choices={editor.state.recipeChoices}
          palsById={palsById}
          onChoose={editor.actions.chooseChild}
          onCancel={editor.actions.cancelChildChoice}
        />
      )}
      {confirmDelete && (
        <div className="graph-modal-backdrop">
          <div className="graph-modal" role="dialog" aria-modal="true" aria-labelledby="delete-nodes-title">
            <h2 id="delete-nodes-title">删除选中节点</h2>
            <p>
              将删除 {editor.state.selectedNodeIds.length} 个节点，并移除{' '}
              {affectedRelationCount(plan, editor.state.selectedNodeIds)} 条直接关系。
            </p>
            <div className="graph-modal-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  editor.actions.deleteSelected()
                  setConfirmDelete(false)
                }}
              >
                删除
              </button>
              <button type="button" className="quiet-button" onClick={() => setConfirmDelete(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function RecipeChoiceDialog({
  choices,
  palsById,
  onChoose,
  onCancel,
}: {
  choices: BreedingRecipeMatch[]
  palsById: ReadonlyMap<string, PalRecord>
  onChoose: (match: BreedingRecipeMatch) => void
  onCancel: () => void
}) {
  return (
    <div className="graph-modal-backdrop">
      <div className="graph-modal" role="dialog" aria-modal="true" aria-labelledby="recipe-choice-title">
        <h2 id="recipe-choice-title">选择子代配方</h2>
        <div className="graph-recipe-choices">
          {choices.map((choice) => (
            <button
              type="button"
              className="quiet-button"
              key={choice.recipeIndex}
              onClick={() => onChoose(choice)}
            >
              {palName(choice.childId, palsById)}
            </button>
          ))}
        </div>
        <div className="graph-modal-actions">
          <button type="button" className="quiet-button" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

function palName(
  palId: string | undefined,
  palsById: ReadonlyMap<string, PalRecord>,
): string {
  if (!palId) return '未知节点'
  return palsById.get(palId)?.name.zhHans ?? palId
}

function saveStateText(state: ReturnType<typeof useBreedingPlanEditor>['state']['saveState']) {
  if (state === 'saving') return '正在保存方案…'
  if (state === 'dirty') return '方案有未保存更改'
  if (state === 'error') return '方案保存失败'
  return '方案已保存'
}

function affectedRelationCount(
  plan: ReturnType<typeof useBreedingPlanEditor>['state']['plan'],
  nodeIds: string[],
): number {
  const selected = new Set(nodeIds)
  return (plan?.relations ?? []).filter(
    (relation) =>
      selected.has(relation.parentANodeId) ||
      selected.has(relation.parentBNodeId) ||
      selected.has(relation.childNodeId),
  ).length
}
