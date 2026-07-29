import { useMemo, useState } from 'react'
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/base.css'
import { LocalPalImage } from '../../components/pal-ui'
import { PalPicker } from '../../components/PalPicker'
import { decodeRecipe } from '../../domain/pals'
import type { BreedingTreeNode } from '../../domain/breeding-path'
import type {
  BreedingIndexPayload,
  BreedingRecipe,
  PalRecord,
} from '../../domain/types'

export function FormulaCard({
  recipe,
  palsById,
  displayParents,
}: {
  recipe: BreedingRecipe
  palsById: ReadonlyMap<string, PalRecord>
  displayParents?: [string, string]
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
        <FormulaPal pal={parentA} role="亲本 A" />
        <span className="formula-operator" aria-hidden="true">+</span>
        <FormulaPal pal={parentB} role="亲本 B" />
        <span
          className="formula-operator formula-operator--arrow"
          aria-hidden="true"
        >
          →
        </span>
        <FormulaPal pal={child} role="子代" />
      </div>
    </article>
  )
}

function FormulaPal({ pal, role }: { pal: PalRecord; role: string }) {
  return (
    <div className="formula-pal">
      <LocalPalImage pal={pal} size="formula" />
      <strong>{pal.name.zhHans}</strong>
      <small>{role}</small>
    </div>
  )
}

export function MultiPalSelector({
  pals,
  selectedIds,
  onChange,
  label,
  saveAction,
}: {
  pals: PalRecord[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  label: string
  saveAction?: {
    dirty: boolean
    saved: boolean
    onSave: () => void
  }
}) {
  const [candidate, setCandidate] = useState('')
  const selectedSet = new Set(selectedIds)
  const available = pals.filter((pal) => !selectedSet.has(pal.internalId))

  return (
    <section className="multi-pal-selector">
      <PalPicker
        id={`multi-${label}`}
        label={label}
        pals={available}
        selectedId={candidate}
        onSelect={setCandidate}
      />
      <button
        className="primary-button"
        disabled={!candidate}
        onClick={() => {
          if (!candidate) return
          onChange([...selectedIds, candidate])
          setCandidate('')
        }}
      >
        加入起点
      </button>
      <div className="selected-pal-tags" aria-label={`${label}已选列表`}>
        {selectedIds.length === 0 ? (
          <span className="muted">尚未选择帕鲁</span>
        ) : selectedIds.map((id) => {
          const pal = pals.find((item) => item.internalId === id)
          return pal ? (
            <span
              className="selected-pal-tag"
              key={id}
              title={`${pal.name.en} · ${
                pal.paldexNo ? `#${pal.paldexNo}` : '无图鉴编号'
              }`}
            >
              <LocalPalImage pal={pal} size="tree" />
              <strong>{pal.name.zhHans}</strong>
              <button
                type="button"
                aria-label={`移除${pal.name.zhHans}`}
                onClick={() =>
                  onChange(selectedIds.filter((item) => item !== id))
                }
              >
                ×
              </button>
            </span>
          ) : null
        })}
      </div>
      {saveAction && (
        <div className="owned-save-row">
          <span className={saveAction.dirty ? 'is-dirty' : ''}>
            {saveAction.dirty
              ? '有未保存更改'
              : saveAction.saved
                ? '已保存到本机'
                : '当前内容已保存'}
          </span>
          <button
            className="quiet-button"
            disabled={!saveAction.dirty}
            onClick={saveAction.onSave}
          >
            保存到本机
          </button>
        </div>
      )}
    </section>
  )
}

function flattenTree(node: BreedingTreeNode | null): BreedingTreeNode[] {
  if (!node) return []
  return [
    node,
    ...flattenTree(node.parentA ?? null),
    ...flattenTree(node.parentB ?? null),
  ]
}

function treeFlow(
  tree: BreedingTreeNode,
  palsById: ReadonlyMap<string, PalRecord>,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let leaf = 0

  function visit(node: BreedingTreeNode): number {
    const childXs = [node.parentA, node.parentB]
      .filter((item): item is BreedingTreeNode => Boolean(item))
      .map(visit)
    const x =
      childXs.length > 0
        ? childXs.reduce((sum, value) => sum + value, 0) / childXs.length
        : leaf++ * 210
    const pal = palsById.get(node.palId)
    nodes.push({
      id: node.nodeId,
      position: { x, y: (tree.generation - node.generation) * 155 },
      data: {
        label: pal ? (
          <div className="tree-node-label">
            <LocalPalImage pal={pal} size="tree" />
            <strong>{pal.name.zhHans}</strong>
            <small>
              第 {node.generation} 代 ·{' '}
              {node.recipeIndex === null ? '起点' : '配种获得'}
            </small>
          </div>
        ) : node.palId,
      },
      className: node.recipeIndex === null ? 'tree-node is-source' : 'tree-node',
      draggable: false,
      selectable: node.recipeIndex !== null,
      ariaLabel: pal
        ? `${pal.name.zhHans}，第 ${node.generation} 代`
        : node.palId,
    })
    for (const [role, parent] of [
      ['A', node.parentA],
      ['B', node.parentB],
    ] as const) {
      if (!parent) continue
      edges.push({
        id: `${node.nodeId}-${parent.nodeId}`,
        source: node.nodeId,
        target: parent.nodeId,
        label: role,
        ariaLabel: `亲本 ${role}`,
      })
    }
    return x
  }

  visit(tree)
  return { nodes, edges }
}

export function BreedingTreeView({
  tree,
  palsById,
  index,
  selectedNodeId,
  onSelectNode,
  onChooseAlternative,
}: {
  tree: BreedingTreeNode
  palsById: ReadonlyMap<string, PalRecord>
  index: BreedingIndexPayload
  selectedNodeId: string
  onSelectNode: (nodeId: string) => void
  onChooseAlternative: (nodeId: string, recipeIndex: number) => void
}) {
  const flow = useMemo(() => treeFlow(tree, palsById), [tree, palsById])
  const flat = useMemo(() => flattenTree(tree), [tree])
  const selected = flat.find((node) => node.nodeId === selectedNodeId)

  return (
    <section className="tree-result">
      <div className="tree-canvas" aria-label="配种树交互画布">
        <ReactFlow
          nodes={flow.nodes}
          edges={flow.edges}
          fitView
          nodesConnectable={false}
          elementsSelectable
          onNodeClick={(_, node) => onSelectNode(node.id)}
          proOptions={{ hideAttribution: true }}
          ariaLabelConfig={{
            'controls.ariaLabel': '配种树控制',
            'controls.zoomIn.ariaLabel': '放大',
            'controls.zoomOut.ariaLabel': '缩小',
            'controls.fitView.ariaLabel': '适应画布',
          }}
        >
          <Background color="var(--theme-grid-color)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <aside className="tree-alternatives">
        <h3>节点替代配方</h3>
        {!selected ? (
          <p>选择一个“配种获得”节点以查看同代替代方案。</p>
        ) : (
          <>
            <p>
              {palsById.get(selected.palId)?.name.zhHans} · 第{' '}
              {selected.generation} 代
            </p>
            <div>
              {selected.alternativeRecipeIndexes.map((recipeIndex) => {
                const recipe = decodeRecipe(index, recipeIndex)
                if (!recipe) return null
                return (
                  <button
                    key={recipeIndex}
                    className={
                      recipeIndex === selected.recipeIndex ? 'is-active' : ''
                    }
                    onClick={() =>
                      onChooseAlternative(selected.nodeId, recipeIndex)
                    }
                  >
                    {palsById.get(recipe.parentAId)?.name.zhHans} +{' '}
                    {palsById.get(recipe.parentBId)?.name.zhHans}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </aside>
      <details className="tree-steps" open>
        <summary>文本配种步骤</summary>
        <ol>
          {flat
            .filter((node) => node.recipeIndex !== null)
            .sort((left, right) => left.generation - right.generation)
            .map((node) => {
              const recipe = decodeRecipe(index, node.recipeIndex as number)
              return recipe ? (
                <li key={node.nodeId}>
                  第 {node.generation} 代：
                  {palsById.get(recipe.parentAId)?.name.zhHans} +{' '}
                  {palsById.get(recipe.parentBId)?.name.zhHans} →{' '}
                  {palsById.get(recipe.childId)?.name.zhHans}
                </li>
              ) : null
            })}
        </ol>
      </details>
    </section>
  )
}
