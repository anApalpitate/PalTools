import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/base.css'
import {
  decodeRecipe,
  filterPals,
  recipesForChild,
  recipesForParents,
  type PalSortKey,
} from './domain/pals'
import {
  ADMIN_CONFIG_STORAGE_KEY,
  DEFAULT_APP_CONFIG,
  DEFAULT_MAX_EXACT_GENERATION,
  HARD_MAX_EXACT_GENERATION,
  OWNED_PALS_STORAGE_KEY,
  parseAppConfig,
  parseOwnedPalIds,
  serializeOwnedPalIds,
} from './domain/config'
import type {
  BreedingTreeNode,
  PathPlanResult,
} from './domain/breeding-path'
import type {
  ActiveSkillRecord,
  AppConfig,
  BreedingIndexPayload,
  BreedingRecipe,
  DatasetManifest,
  ElementId,
  ElementRecord,
  ElementsPayload,
  ItemRecord,
  ItemsPayload,
  PalRecord,
  PalStatKey,
  PalsPayload,
  SkillsPayload,
  WorkSuitabilitiesPayload,
  WorkSuitabilityRecord,
} from './domain/types'

type Tool = 'paldex' | 'breeding' | 'admin'
type BreedingMode = 'forward' | 'reverse' | 'path'
type PathMode = 'minimum' | 'exact'
type StartSource = 'owned' | 'temporary'
type ElementMap = ReadonlyMap<ElementId, ElementRecord>

const statDefinitions: Array<{
  key: PalStatKey
  label: string
  group: '战斗与生产' | '移动能力'
  note?: string
}> = [
  { key: 'hp', label: 'HP', group: '战斗与生产' },
  { key: 'attack', label: '攻击', group: '战斗与生产' },
  { key: 'defense', label: '防御', group: '战斗与生产' },
  { key: 'workSpeed', label: '工作速度', group: '战斗与生产' },
  { key: 'foodAmount', label: '进食量', group: '战斗与生产' },
  { key: 'walkSpeed', label: '行走速度', group: '移动能力' },
  { key: 'runSpeed', label: '奔跑速度', group: '移动能力' },
  { key: 'swimSpeed', label: '游泳速度', group: '移动能力' },
  {
    key: 'rideSprintSpeed',
    label: '骑乘冲刺速度',
    group: '移动能力',
    note: '这是游戏内部速度参数，不代表该帕鲁一定可以骑乘。',
  },
  { key: 'transportSpeed', label: '搬运速度', group: '移动能力' },
  { key: 'stamina', label: '耐力', group: '移动能力' },
]

function localAssetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`
}

function useScrollActivity() {
  const [isActive, setIsActive] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    },
    [],
  )

  const handleScroll = () => {
    setIsActive(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setIsActive(false), 800)
  }

  return { isActive, handleScroll }
}

function palOptionLabel(pal: PalRecord): string {
  return `${pal.name.zhHans} · ${pal.name.en} · ${
    pal.paldexNo ? `#${pal.paldexNo}` : '无编号'
  }`
}

function palSearchText(pal: PalRecord): string {
  return [
    pal.name.zhHans,
    pal.name.en,
    pal.internalId,
    pal.paldbId,
    pal.paldexNo ?? '',
  ]
    .join(' ')
    .toLocaleLowerCase('zh-CN')
}

function LocalPalImage({
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
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-label={`${pal.name.zhHans}图片不可用`} role="img">◈</span>
      )}
    </div>
  )
}

function ItemImage({ item }: { item: ItemRecord }) {
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

function WorkSuitabilityIcon({
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

function ElementBadge({
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

function PalPicker({
  id,
  label,
  pals,
  selectedId,
  onSelect,
}: {
  id: string
  label: string
  pals: PalRecord[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  const selected = pals.find((pal) => pal.internalId === selectedId)
  const [inputValue, setInputValue] = useState('')
  const [queryValue, setQueryValue] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const options = useMemo(
    () => new Map(pals.map((pal) => [palOptionLabel(pal), pal.internalId])),
    [pals],
  )
  const filtered = useMemo(() => {
    const query = queryValue.trim().toLocaleLowerCase('zh-CN')
    return query
      ? pals.filter((pal) => palSearchText(pal).includes(query))
      : pals
  }, [pals, queryValue])
  useEffect(() => {
    setInputValue(selected ? palOptionLabel(selected) : '')
  }, [selected])
  useEffect(() => {
    setActiveIndex((current) =>
      Math.max(0, Math.min(filtered.length - 1, current)),
    )
  }, [filtered.length])
  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as globalThis.Node)) {
        setOpen(false)
        setQueryValue('')
        setInputValue(selected ? palOptionLabel(selected) : '')
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open, selected])
  useEffect(() => {
    if (!open) return
    const activeOption = rootRef.current?.querySelector<HTMLElement>(
      `[data-option-index="${activeIndex}"]`,
    )
    activeOption?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, open])
  const choose = (pal: PalRecord) => {
    setInputValue(palOptionLabel(pal))
    setQueryValue('')
    onSelect(pal.internalId)
    setOpen(false)
    inputRef.current?.focus()
  }
  const openAll = () => {
    const selectedIndex = selected
      ? pals.findIndex((pal) => pal.internalId === selected.internalId)
      : 0
    setQueryValue('')
    setActiveIndex(Math.max(0, selectedIndex))
    setOpen(true)
    if (selected) requestAnimationFrame(() => inputRef.current?.select())
  }
  return (
    <div className="field pal-picker" ref={rootRef}>
      <label htmlFor={`${id}-input`}>{label}</label>
      <input
        id={`${id}-input`}
        ref={inputRef}
        value={inputValue}
        placeholder="输入中文名、英文名或编号"
        aria-label={label}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-activedescendant={
          open && filtered[activeIndex]
            ? `${id}-option-${filtered[activeIndex].internalId}`
            : undefined
        }
        onFocus={openAll}
        onClick={() => {
          const showingSelectedValue =
            selected && inputValue === palOptionLabel(selected)
          if (!open || showingSelectedValue) openAll()
        }}
        onChange={(event) => {
          const value = event.target.value
          setInputValue(value)
          setQueryValue(value)
          setActiveIndex(0)
          setOpen(true)
          const exactId = options.get(value)
          if (exactId) onSelect(exactId)
          else if (!value) onSelect('')
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) {
              setOpen(true)
              return
            }
            const delta = event.key === 'ArrowDown' ? 1 : -1
            setActiveIndex((current) =>
              Math.max(0, Math.min(filtered.length - 1, current + delta)),
            )
          } else if (event.key === 'Home' && open) {
            event.preventDefault()
            setActiveIndex(0)
          } else if (event.key === 'End' && open) {
            event.preventDefault()
            setActiveIndex(Math.max(0, filtered.length - 1))
          } else if (event.key === 'Enter' && open && filtered[activeIndex]) {
            event.preventDefault()
            choose(filtered[activeIndex])
          } else if (event.key === 'Escape') {
            setOpen(false)
            setQueryValue('')
            setInputValue(selected ? palOptionLabel(selected) : '')
          }
        }}
      />
      {open && (
        <div
          className="pal-picker-options themed-scrollbar"
          id={`${id}-options`}
          role="listbox"
        >
          {filtered.length === 0 ? (
            <span className="pal-picker-empty">没有匹配的帕鲁</span>
          ) : filtered.map((pal, index) => (
            <button
              type="button"
              id={`${id}-option-${pal.internalId}`}
              role="option"
              aria-selected={pal.internalId === selectedId}
              className={index === activeIndex ? 'is-active' : ''}
              data-option-index={index}
              key={pal.internalId}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(pal)}
            >
              <LocalPalImage pal={pal} size="tree" />
              <span><strong>{pal.name.zhHans}</strong><small>{pal.name.en} · {pal.paldexNo ? `#${pal.paldexNo}` : '无编号'}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
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

function FormulaCard({
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
        <span className="formula-operator formula-operator--arrow" aria-hidden="true">→</span>
        <FormulaPal pal={child} role="子代" />
      </div>
    </article>
  )
}

function MultiPalSelector({
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
      >加入起点</button>
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
                onClick={() => onChange(selectedIds.filter((item) => item !== id))}
              >×</button>
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
          >保存到本机</button>
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
            <small>第 {node.generation} 代 · {node.recipeIndex === null ? '起点' : '配种获得'}</small>
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

function BreedingTreeView({
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
          <Background color="rgba(102,230,170,.12)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <aside className="tree-alternatives">
        <h3>节点替代配方</h3>
        {!selected ? (
          <p>选择一个“配种获得”节点以查看同代替代方案。</p>
        ) : (
          <>
            <p>{palsById.get(selected.palId)?.name.zhHans} · 第 {selected.generation} 代</p>
            <div>
              {selected.alternativeRecipeIndexes.map((recipeIndex) => {
                const recipe = decodeRecipe(index, recipeIndex)
                if (!recipe) return null
                return (
                  <button
                    key={recipeIndex}
                    className={recipeIndex === selected.recipeIndex ? 'is-active' : ''}
                    onClick={() => onChooseAlternative(selected.nodeId, recipeIndex)}
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
            .sort((a, b) => a.generation - b.generation)
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

export function App() {
  const configState = useMemo(
    () => parseAppConfig(localStorage.getItem(ADMIN_CONFIG_STORAGE_KEY)),
    [],
  )
  const [tool, setTool] = useState<Tool>('paldex')
  const [breedingMode, setBreedingMode] = useState<BreedingMode>('forward')
  const [pals, setPals] = useState<PalRecord[]>([])
  const [elementRecords, setElementRecords] = useState<ElementRecord[]>([])
  const [skills, setSkills] = useState<ActiveSkillRecord[]>([])
  const [items, setItems] = useState<ItemRecord[]>([])
  const [workSuitabilityRecords, setWorkSuitabilityRecords] = useState<
    WorkSuitabilityRecord[]
  >([])
  const [manifest, setManifest] = useState<DatasetManifest | null>(null)
  const [breedingIndex, setBreedingIndex] = useState<BreedingIndexPayload | null>(null)
  const [loadingError, setLoadingError] = useState('')
  const [query, setQuery] = useState('')
  const [element, setElement] = useState<ElementId | ''>('')
  const [workTypes, setWorkTypes] = useState<string[]>([])
  const [sortKey, setSortKey] = useState<PalSortKey>('paldexNo')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [selectedPal, setSelectedPal] = useState<PalRecord | null>(null)
  const [parentA, setParentA] = useState('')
  const [parentB, setParentB] = useState('')
  const [reverseTarget, setReverseTarget] = useState('')
  const [reverseQuery, setReverseQuery] = useState('')
  const [reversePage, setReversePage] = useState(1)
  const [appConfig, setAppConfig] = useState<AppConfig>(configState.config)
  const [configRecovered, setConfigRecovered] = useState(configState.recovered)
  const [configDraft, setConfigDraft] = useState(
    String(configState.config.pathPlanner.maxExactGeneration),
  )
  const [ownedIds, setOwnedIds] = useState<string[]>([])
  const [persistedOwnedIds, setPersistedOwnedIds] = useState<string[]>([])
  const [ownedSavedFeedback, setOwnedSavedFeedback] = useState(false)
  const [temporaryIds, setTemporaryIds] = useState<string[]>([])
  const [startSource, setStartSource] = useState<StartSource>('owned')
  const [pathTarget, setPathTarget] = useState('')
  const [pathMode, setPathMode] = useState<PathMode>('minimum')
  const [exactGeneration, setExactGeneration] = useState(1)
  const [pathResult, setPathResult] = useState<PathPlanResult | null>(null)
  const [pathPending, setPathPending] = useState(false)
  const [selectedTreeNode, setSelectedTreeNode] = useState('')
  const [preferredRecipes, setPreferredRecipes] = useState<Record<string, number>>({})
  const requestId = useRef(0)
  const detailScroll = useScrollActivity()
  const skillScroll = useScrollActivity()

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetch(localAssetUrl('/data/pals.json'), { signal: controller.signal }).then((r) => {
        if (!r.ok) throw new Error('图鉴数据加载失败')
        return r.json() as Promise<PalsPayload>
      }),
      fetch(localAssetUrl('/data/elements.json'), { signal: controller.signal }).then((r) => {
        if (!r.ok) throw new Error('属性素材数据加载失败')
        return r.json() as Promise<ElementsPayload>
      }),
      fetch(localAssetUrl('/data/skills.json'), { signal: controller.signal }).then((r) => {
        if (!r.ok) throw new Error('主动技能数据加载失败')
        return r.json() as Promise<SkillsPayload>
      }),
      fetch(localAssetUrl('/data/items.json'), { signal: controller.signal }).then((r) => {
        if (!r.ok) throw new Error('掉落物数据加载失败')
        return r.json() as Promise<ItemsPayload>
      }),
      fetch(localAssetUrl('/data/work-suitabilities.json'), { signal: controller.signal }).then((r) => {
        if (!r.ok) throw new Error('工作适应性素材数据加载失败')
        return r.json() as Promise<WorkSuitabilitiesPayload>
      }),
      fetch(localAssetUrl('/data/manifest.json'), { signal: controller.signal }).then((r) => {
        if (!r.ok) throw new Error('数据清单加载失败')
        return r.json() as Promise<DatasetManifest>
      }),
    ])
      .then(([palData, elementData, skillData, itemData, workData, manifestData]) => {
        setPals(palData.pals)
        setElementRecords(elementData.elements)
        setSkills(skillData.skills)
        setItems(itemData.items)
        setWorkSuitabilityRecords(workData.workSuitabilities)
        setManifest(manifestData)
        const validIds = new Set(palData.pals.map((pal) => pal.internalId))
        const savedOwnedIds = parseOwnedPalIds(
          localStorage.getItem(OWNED_PALS_STORAGE_KEY),
          validIds,
        )
        setOwnedIds(savedOwnedIds)
        setPersistedOwnedIds(savedOwnedIds)
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== 'AbortError') {
          setLoadingError(error.message)
        }
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (tool !== 'breeding' || breedingIndex) return
    fetch(localAssetUrl('/data/breeding-index.json'))
      .then((response) => {
        if (!response.ok) throw new Error('配种数据加载失败')
        return response.json() as Promise<BreedingIndexPayload>
      })
      .then(setBreedingIndex)
      .catch((error: unknown) =>
        setLoadingError(error instanceof Error ? error.message : '配种数据加载失败'),
      )
  }, [tool, breedingIndex])

  const activeStartIds = startSource === 'owned' ? ownedIds : temporaryIds
  useEffect(() => {
    if (
      tool !== 'breeding' ||
      breedingMode !== 'path' ||
      !breedingIndex ||
      !pathTarget
    ) {
      setPathResult(null)
      return
    }
    const currentRequest = ++requestId.current
    const worker = new Worker(
      new URL('./workers/breeding-path.worker.ts', import.meta.url),
      { type: 'module' },
    )
    setPathPending(true)
    worker.onmessage = (event: MessageEvent<{ requestId: number; result: PathPlanResult }>) => {
      if (event.data.requestId !== requestId.current) return
      setPathResult(event.data.result)
      setPathPending(false)
    }
    worker.onerror = () => {
      if (currentRequest === requestId.current) {
        setPathPending(false)
        setPathResult({
          status: 'unreachable',
          minGeneration: null,
          tree: null,
          message: '路径计算器发生错误。',
        })
      }
    }
    worker.postMessage({
      requestId: currentRequest,
      payload: {
        index: breedingIndex,
        startIds: activeStartIds,
        targetId: pathTarget,
        mode: pathMode,
        exactGeneration,
        maxDisplayGeneration: appConfig.pathPlanner.maxExactGeneration,
        preferredRecipes,
      },
    })
    return () => worker.terminate()
  }, [
    tool,
    breedingMode,
    breedingIndex,
    pathTarget,
    pathMode,
    exactGeneration,
    activeStartIds,
    appConfig,
    preferredRecipes,
  ])

  const elementsById = useMemo<ElementMap>(
    () => new Map(elementRecords.map((item) => [item.id, item])),
    [elementRecords],
  )
  const skillsById = useMemo(
    () => new Map(skills.map((skill) => [skill.id, skill])),
    [skills],
  )
  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  )
  const workSuitabilitiesByName = useMemo(
    () => new Map(workSuitabilityRecords.map((item) => [item.name, item])),
    [workSuitabilityRecords],
  )
  const palsById = useMemo(
    () => new Map(pals.map((pal) => [pal.internalId, pal])),
    [pals],
  )
  const availableWorkTypes = useMemo(
    () => [...new Set(pals.flatMap((pal) => Object.keys(pal.workSuitabilities)))].sort(),
    [pals],
  )
  const filteredPals = useMemo(
    () =>
      filterPals(
        pals,
        {
          query,
          element,
          workTypes,
          sortKey,
          sortDirection,
        },
        { skills: skillsById, items: itemsById },
      ),
    [pals, query, element, workTypes, sortKey, sortDirection, skillsById, itemsById],
  )
  const breedingPals = useMemo(
    () =>
      breedingIndex
        ? pals.filter((pal) => breedingIndex.palIds.includes(pal.internalId))
        : pals.filter((pal) => pal.internalId !== 'WorldTreeDragon'),
    [pals, breedingIndex],
  )
  const forwardRecipes = useMemo(
    () =>
      breedingIndex && parentA && parentB
        ? recipesForParents(breedingIndex, parentA, parentB)
        : [],
    [breedingIndex, parentA, parentB],
  )
  const reverseRecipes = useMemo(() => {
    if (!breedingIndex || !reverseTarget) return []
    const queryText = reverseQuery.trim().toLocaleLowerCase('zh-CN')
    return recipesForChild(breedingIndex, reverseTarget)
      .filter((recipe) => {
        if (!queryText) return true
        const a = palsById.get(recipe.parentAId)
        const b = palsById.get(recipe.parentBId)
        return [a, b].some((pal) => pal && palSearchText(pal).includes(queryText))
      })
      .sort((left, right) => {
        const leftA = palsById.get(left.parentAId)
        const rightA = palsById.get(right.parentAId)
        return (
          (leftA?.paldexNo ?? '9999').localeCompare(
            rightA?.paldexNo ?? '9999',
            undefined,
            { numeric: true },
          ) || left.parentBId.localeCompare(right.parentBId)
        )
      })
  }, [breedingIndex, reverseTarget, reverseQuery, palsById])
  const reversePages = Math.max(1, Math.ceil(reverseRecipes.length / 50))
  const reversePageItems = reverseRecipes.slice((reversePage - 1) * 50, reversePage * 50)

  useEffect(() => {
    setReversePage(1)
  }, [reverseTarget, reverseQuery])
  useEffect(() => {
    const max = appConfig.pathPlanner.maxExactGeneration
    if (exactGeneration > max) {
      setExactGeneration(max)
      setPreferredRecipes({})
      setPathResult(null)
    }
  }, [appConfig, exactGeneration])

  const resetFilters = () => {
    setQuery('')
    setElement('')
    setWorkTypes([])
    setSortKey('paldexNo')
    setSortDirection('asc')
  }

  const ownedIdsDirty =
    serializeOwnedPalIds(ownedIds) !== serializeOwnedPalIds(persistedOwnedIds)
  const confirmLeaveOwnedChanges = () =>
    !ownedIdsDirty ||
    window.confirm('已拥有帕鲁有未保存更改，确定要离开吗？')
  const navigateToTool = (nextTool: Tool) => {
    if (nextTool === tool) return
    if (
      tool === 'breeding' &&
      breedingMode === 'path' &&
      !confirmLeaveOwnedChanges()
    ) {
      return
    }
    setTool(nextTool)
  }
  const navigateToBreedingMode = (nextMode: BreedingMode) => {
    if (nextMode === breedingMode) return
    if (breedingMode === 'path' && !confirmLeaveOwnedChanges()) return
    setBreedingMode(nextMode)
  }
  const saveOwnedIds = () => {
    localStorage.setItem(
      OWNED_PALS_STORAGE_KEY,
      serializeOwnedPalIds(ownedIds),
    )
    setPersistedOwnedIds(ownedIds)
    setOwnedSavedFeedback(true)
  }

  useEffect(() => {
    if (!ownedIdsDirty) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [ownedIdsDirty])

  useEffect(() => {
    if (!ownedSavedFeedback) return
    const timer = window.setTimeout(() => setOwnedSavedFeedback(false), 2200)
    return () => window.clearTimeout(timer)
  }, [ownedSavedFeedback])

  useEffect(() => {
    if (!selectedPal) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedPal(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedPal])

  const saveConfig = () => {
    const value = Number(configDraft)
    if (!Number.isInteger(value) || value < 1 || value > HARD_MAX_EXACT_GENERATION) {
      setConfigRecovered(true)
      return
    }
    const next: AppConfig = {
      schemaVersion: 1,
      pathPlanner: { maxExactGeneration: value },
    }
    localStorage.setItem(ADMIN_CONFIG_STORAGE_KEY, JSON.stringify(next))
    setAppConfig(next)
    setConfigRecovered(false)
  }
  const resetConfig = () => {
    localStorage.setItem(
      ADMIN_CONFIG_STORAGE_KEY,
      JSON.stringify(DEFAULT_APP_CONFIG),
    )
    setAppConfig(DEFAULT_APP_CONFIG)
    setConfigDraft(String(DEFAULT_MAX_EXACT_GENERATION))
    setConfigRecovered(false)
  }

  return (
    <div className="app-frame">
      <header className="topbar">
        <button className="brand brand-button" onClick={() => navigateToTool('paldex')}>
          <span className="brand-mark" aria-hidden="true">
            <img src={localAssetUrl('/app-icon-96.png')} alt="" />
          </span>
          <span><strong>PalTools</strong><small>本地帕鲁助手</small></span>
        </button>
        <nav className="tool-tabs" aria-label="工具导航">
          <button className={tool === 'paldex' ? 'is-active' : ''} onClick={() => navigateToTool('paldex')}>图鉴</button>
          <button className={tool === 'breeding' ? 'is-active' : ''} onClick={() => navigateToTool('breeding')}>配种</button>
          <button className={tool === 'admin' ? 'is-active' : ''} onClick={() => navigateToTool('admin')}>管理员配置</button>
        </nav>
        <div className="version-chip">
          <span className="online-dot" aria-hidden="true" />
          {manifest ? `数据 ${manifest.datasetVersion}` : '正在载入本地数据'}
        </div>
      </header>

      {loadingError ? (
        <main className="error-state">
          <span>!</span><h1>本地数据未就绪</h1><p>{loadingError}</p>
          <code>npm run data:sync</code>
        </main>
      ) : tool === 'paldex' ? (
        <main>
          <section className="page-heading">
            <div>
              <p className="eyebrow">PALDEX / SCHEMA V4</p>
              <h1>帕鲁图鉴</h1>
              <p>检索帕鲁、伙伴技能、主动/被动技能、掉落物和详细数值。</p>
            </div>
            <div className="count-block"><strong>{filteredPals.length}</strong><span>/ {pals.length || 300} 个帕鲁</span></div>
          </section>
          <section className="filter-panel" aria-label="图鉴筛选">
            <label className="search-field">
              <span aria-hidden="true">⌕</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索名称、技能、掉落物、编号或内部 ID" aria-label="搜索帕鲁" />
            </label>
            <label className="field field--inline stat-field"><span>排序依据</span><select aria-label="排序依据" value={sortKey} onChange={(e) => setSortKey(e.target.value as PalSortKey)}><option value="paldexNo">图鉴编号（默认）</option>{statDefinitions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
            <label className="field field--inline"><span>排列方式</span><select aria-label="排列方式" value={sortDirection} onChange={(e) => setSortDirection(e.target.value as 'asc' | 'desc')}><option value="asc">从低到高</option><option value="desc">从高到低</option></select></label>
            <button className="quiet-button reset-filter-button" onClick={resetFilters}>重置</button>
            <div className="element-filter" role="group" aria-label="属性筛选">
              <button className={element === '' ? 'is-active' : ''} aria-pressed={element === ''} onClick={() => setElement('')}>全部属性</button>
              {elementRecords.map((item) => <button key={item.id} className={element === item.id ? 'is-active' : ''} aria-label={`筛选${item.name.zhHans}`} aria-pressed={element === item.id} onClick={() => setElement(item.id)}><ElementBadge id={item.id} elements={elementsById} compact /><span>{item.name.zhHans}</span></button>)}
            </div>
            <div className="work-filter" role="group" aria-label="工作适应性筛选">
              <span className="filter-row-label">工作适应性（多选）</span>
              <button className={workTypes.length === 0 ? 'is-active' : ''} aria-pressed={workTypes.length === 0} onClick={() => setWorkTypes([])}>全部适性</button>
              {availableWorkTypes.map((item) => {
                const active = workTypes.includes(item)
                return <button key={item} className={active ? 'is-active' : ''} aria-pressed={active} onClick={() => setWorkTypes((current) => active ? current.filter((value) => value !== item) : [...current, item])}><WorkSuitabilityIcon item={workSuitabilitiesByName.get(item)} compact /><span>{item}</span></button>
              })}
            </div>
          </section>
          {pals.length === 0 ? (
            <div className="loading-grid" aria-label="图鉴加载中">{Array.from({ length: 8 }, (_, i) => <span key={i} />)}</div>
          ) : filteredPals.length === 0 ? (
            <section className="empty-state"><h2>没有找到匹配的帕鲁</h2><p>调整筛选后重试。</p><button onClick={resetFilters}>清空筛选</button></section>
          ) : (
            <section className="pal-grid" aria-label="帕鲁列表">
              {filteredPals.map((pal) => <button className="pal-card" key={pal.internalId} onClick={() => setSelectedPal(pal)}><span className="paldex-number">{pal.paldexNo ? `#${pal.paldexNo}` : '无编号'}</span><LocalPalImage pal={pal} /><span className="pal-card-copy"><strong>{pal.name.zhHans}</strong><small>{pal.name.en}</small><span className="element-row">{pal.elements.map((item) => <ElementBadge key={item} id={item} elements={elementsById} />)}</span>{sortKey !== 'paldexNo' && <span className="pal-sort-value"><small>{statDefinitions.find((item) => item.key === sortKey)?.label}</small><strong>{pal.stats[sortKey] ?? '—'}</strong></span>}</span><span className="work-row">{Object.entries(pal.workSuitabilities).map(([work, level]) => <span className={workTypes.includes(work) ? 'is-filter-match' : ''} key={work}><WorkSuitabilityIcon item={workSuitabilitiesByName.get(work)} compact />{work} <b>{level}</b></span>)}</span></button>)}
            </section>
          )}
        </main>
      ) : tool === 'admin' ? (
        <main className="admin-page">
          <section className="page-heading"><div><p className="eyebrow">LOCAL ADMINISTRATION</p><h1>管理员配置</h1><p>仅影响本机，不需要账号或口令。</p></div></section>
          <section className="admin-card">
            <h2>配种树安全上限</h2>
            <p>指定 N 代模式默认最多展示 6 代。管理员可在 1–12 之间调整；最短路径超过上限时只报告代数，不展开画布。</p>
            {configRecovered && <p className="config-warning" role="alert">检测到无效配置，已使用默认值 6。请输入 1–12 的整数。</p>}
            <label className="field"><span>指定代数上限</span><input aria-label="指定代数上限" type="number" min="1" max="12" value={configDraft} onChange={(e) => setConfigDraft(e.target.value)} /></label>
            <div className="admin-actions"><button className="primary-button" onClick={saveConfig}>保存配置</button><button className="quiet-button" onClick={resetConfig}>恢复默认值 6</button></div>
            <dl><div><dt>当前生效值</dt><dd>{appConfig.pathPlanner.maxExactGeneration} 代</dd></div><div><dt>硬性安全上限</dt><dd>{HARD_MAX_EXACT_GENERATION} 代</dd></div><div><dt>存储位置</dt><dd>本机 localStorage</dd></div></dl>
          </section>
        </main>
      ) : (
        <main>
          <section className="page-heading page-heading--breeding">
            <div><p className="eyebrow">BREEDING / 44,851 条无性别公式</p><h1>配种工具</h1><p>正向查询、目标反查与六代路径规划均在本机完成。</p></div>
          </section>
          <nav className="breeding-mode-tabs" aria-label="配种功能">
            {([['forward','双亲查子代'],['reverse','子代反查亲本'],['path','路径规划']] as const).map(([mode,label]) => <button key={mode} className={breedingMode === mode ? 'is-active' : ''} onClick={() => navigateToBreedingMode(mode)}>{label}</button>)}
          </nav>
          {!breedingIndex ? (
            <section className="breeding-workspace result-placeholder"><h2>正在载入配方索引…</h2></section>
          ) : breedingMode === 'forward' ? (
            <section className="breeding-workspace">
              <div className="parent-panel"><div className="parent-column"><span className="parent-label">亲本 A</span><PalPicker id="parent-a" label="选择第一只帕鲁" pals={breedingPals} selectedId={parentA} onSelect={setParentA} /></div><button className="swap-button" aria-label="交换两只亲本" onClick={() => { setParentA(parentB); setParentB(parentA) }}>⇄</button><div className="parent-column"><span className="parent-label">亲本 B</span><PalPicker id="parent-b" label="选择第二只帕鲁" pals={breedingPals} selectedId={parentB} onSelect={setParentB} /></div></div>
              <div className="result-panel"><p className="result-label">配种结果</p>{!parentA || !parentB ? <div className="result-placeholder"><span>◇</span><h2>等待选择两只亲本</h2></div> : forwardRecipes.length === 0 ? <div className="result-placeholder"><h2>当前组合没有结果</h2></div> : <div className="result-list">{forwardRecipes.map((recipe) => <FormulaCard key={recipe.childId} recipe={recipe} palsById={palsById} displayParents={[parentA,parentB]} />)}</div>}</div>
            </section>
          ) : breedingMode === 'reverse' ? (
            <section className="breeding-workspace reverse-workspace">
              <div className="reverse-controls"><PalPicker id="reverse-target" label="选择目标子代" pals={breedingPals} selectedId={reverseTarget} onSelect={setReverseTarget} /><label className="search-field"><span aria-hidden="true">⌕</span><input aria-label="筛选反查亲本" value={reverseQuery} onChange={(e) => setReverseQuery(e.target.value)} placeholder="在全部亲本中搜索" /></label></div>
              {!reverseTarget ? <div className="result-placeholder"><h2>请选择目标子代</h2></div> : <><div className="reverse-summary"><strong>{reverseRecipes.length}</strong><span> 条亲本公式 · 第 {reversePage}/{reversePages} 页</span></div><div className="result-list reverse-list">{reversePageItems.map((recipe, index) => <FormulaCard key={`${recipe.parentAId}-${recipe.parentBId}-${index}`} recipe={recipe} palsById={palsById} />)}</div><div className="pagination"><button disabled={reversePage <= 1} onClick={() => setReversePage((page) => page - 1)}>上一页</button><span>{reversePage} / {reversePages}</span><button disabled={reversePage >= reversePages} onClick={() => setReversePage((page) => page + 1)}>下一页</button></div></>}
            </section>
          ) : (
            <section className="breeding-workspace path-workspace">
              <div className="path-controls">
                <div className="segmented-control" role="group" aria-label="起点集合来源"><button className={startSource === 'owned' ? 'is-active' : ''} onClick={() => setStartSource('owned')}>已拥有（本机保存）</button><button className={startSource === 'temporary' ? 'is-active' : ''} onClick={() => setStartSource('temporary')}>临时起点</button></div>
                <MultiPalSelector pals={breedingPals} selectedIds={activeStartIds} onChange={startSource === 'owned' ? setOwnedIds : setTemporaryIds} label={startSource === 'owned' ? '添加已拥有帕鲁' : '添加临时起点'} saveAction={startSource === 'owned' ? { dirty: ownedIdsDirty, saved: ownedSavedFeedback, onSave: saveOwnedIds } : undefined} />
                <div className={`path-query-grid ${pathMode === 'minimum' ? 'path-query-grid--minimum' : ''}`}><PalPicker id="path-target" label="目标子代" pals={breedingPals} selectedId={pathTarget} onSelect={(id) => { setPathTarget(id); setPreferredRecipes({}); setSelectedTreeNode('') }} /><label className="field"><span>规划方式</span><select aria-label="规划方式" value={pathMode} onChange={(e) => { setPathMode(e.target.value as PathMode); setPreferredRecipes({}) }}><option value="minimum">最少代数</option><option value="exact">指定 N 代</option></select></label>{pathMode === 'exact' && <label className="field"><span>指定代数（上限 {appConfig.pathPlanner.maxExactGeneration}）</span><input aria-label="指定代数" type="number" min="1" max={appConfig.pathPlanner.maxExactGeneration} value={exactGeneration} onChange={(e) => { const next = Math.max(1, Math.min(appConfig.pathPlanner.maxExactGeneration, Number(e.target.value) || 1)); setExactGeneration(next); setPreferredRecipes({}) }} /></label>}</div>
                <p className="path-limit-note">当前可视化上限：{appConfig.pathPlanner.maxExactGeneration} 代。<button onClick={() => navigateToTool('admin')}>前往管理员配置</button></p>
              </div>
              <div className="path-result">
                {!pathTarget ? <div className="result-placeholder"><h2>请选择目标和第 0 代集合</h2></div> : pathPending ? <div className="result-placeholder"><h2>正在计算配种路径…</h2></div> : pathResult ? <><div className={`path-status path-status--${pathResult.status}`}><strong>{pathResult.minGeneration === null ? '—' : `${pathResult.minGeneration} 代`}</strong><span>{pathResult.message}</span></div>{pathResult.tree && <BreedingTreeView tree={pathResult.tree} palsById={palsById} index={breedingIndex} selectedNodeId={selectedTreeNode} onSelectNode={setSelectedTreeNode} onChooseAlternative={(nodeId, recipeIndex) => { if (pathMode === 'minimum' && pathResult.minGeneration !== null) { setPathMode('exact'); setExactGeneration(pathResult.minGeneration) } setPreferredRecipes((current) => ({ ...current, [nodeId]: recipeIndex })) }} />}</> : null}
              </div>
            </section>
          )}
        </main>
      )}

      <footer className="app-footer"><span>离线可用 · 默认零遥测</span><span>正式版 {manifest?.gameReleaseLine ?? '1.0'} · Steam build {manifest?.gameBuildId ?? '24181527'}</span><span>非官方粉丝工具</span></footer>

      {selectedPal && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedPal(null) }}>
          <section className="detail-dialog detail-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="detail-title">
            <button className="dialog-close" aria-label="关闭详情" onClick={() => setSelectedPal(null)}>×</button>
            <div className="detail-layout">
              <div
                className={`detail-main-scroll themed-scrollbar ${detailScroll.isActive ? 'is-scrollbar-active' : ''}`}
                aria-label="帕鲁详情"
                role="region"
                tabIndex={0}
                dir="rtl"
                onScroll={detailScroll.handleScroll}
              >
                <div className="detail-main" dir="ltr">
                  <LocalPalImage pal={selectedPal} size="detail" />
                  <div className="detail-heading"><span>{selectedPal.paldexNo ? `#${selectedPal.paldexNo}` : '无图鉴编号'}</span><h2 id="detail-title">{selectedPal.name.zhHans}</h2><p>{selectedPal.name.en} · {selectedPal.internalId}</p></div>
                  <div className="detail-facts"><div><span>属性</span><strong className="detail-elements">{selectedPal.elements.map((item) => <ElementBadge key={item} id={item} elements={elementsById} />)}</strong></div><div><span>稀有度</span><strong>{selectedPal.rarity ?? '暂无数据'}</strong></div><div><span>伙伴技能</span><strong>{selectedPal.partnerSkill?.name ?? '名称调查中'}</strong><p>{selectedPal.partnerSkill?.description ?? '暂无直接来源数据'}</p></div></div>
                  {(['战斗与生产','移动能力'] as const).map((group) => <section className="detail-stat-group" key={group}><h3>{group}</h3><div className="stat-grid">{statDefinitions.filter((item) => item.group === group).map((item) => { const value = selectedPal.stats[item.key]; const source = selectedPal.statSources[item.key]; return <div key={item.key} title={item.note}><span>{item.label}{item.note ? ' ⓘ' : ''}</span><strong>{value ?? '暂无数据'}</strong>{source && <small>{source === 'paldb' ? 'paldb' : 'PalCalc'}</small>}</div> })}</div></section>)}
                  <section className="detail-section detail-work"><h3>工作适性</h3><div>{Object.entries(selectedPal.workSuitabilities).length ? Object.entries(selectedPal.workSuitabilities).map(([work,level]) => <span key={work}><WorkSuitabilityIcon item={workSuitabilitiesByName.get(work)} />{work} <b>Lv.{level}</b></span>) : <span>暂无数据</span>}</div></section>
                  <section className="detail-section detail-passives"><h3>固有被动技能</h3>{selectedPal.passiveSkills === null ? <p className="muted">暂无直接来源数据</p> : selectedPal.passiveSkills.length === 0 ? <p className="muted">该页面未列出固有被动技能</p> : <div className="passive-list">{selectedPal.passiveSkills.map((skill,index) => <article key={`${skill.name}-${index}`}><header><strong>{skill.name}</strong>{skill.rank && <span>Rank {skill.rank}</span>}</header><p>{skill.description}</p></article>)}</div>}</section>
                  <section className="detail-section detail-drops"><h3>掉落物品</h3>{selectedPal.drops === null ? <p className="muted">暂无直接来源数据</p> : <div className="drop-table" role="table"><div className="drop-row drop-head" role="row"><span>物品</span><span>数量</span><span>概率</span></div>{selectedPal.drops.map((drop,index) => { const item = itemsById.get(drop.itemId); return <div className="drop-row" role="row" key={`${drop.itemId}-${index}`}><span>{item && <ItemImage item={item} />}<b>{item?.name ?? drop.itemId}</b></span><span>{drop.quantityMin === drop.quantityMax ? drop.quantityMin : `${drop.quantityMin}–${drop.quantityMax}`}</span><span>{drop.requiredLevel !== null && `Lv.${drop.requiredLevel} `}{drop.probabilityPercent}%</span></div> })}</div>}</section>
                  <a className="source-link" href={selectedPal.sourceUrl} target="_blank" rel="noreferrer">查看 paldb 来源页面 ↗</a>
                </div>
              </div>
              <aside
                className={`active-skills-panel themed-scrollbar ${skillScroll.isActive ? 'is-scrollbar-active' : ''}`}
                aria-label="主动技能"
                tabIndex={0}
                onScroll={skillScroll.handleScroll}
              ><h3>主动技能</h3>{selectedPal.activeSkills === null ? <p className="muted">暂无直接来源数据</p> : selectedPal.activeSkills.length === 0 ? <p className="muted">该页面未列出主动技能</p> : selectedPal.activeSkills.map((ref) => { const skill = skillsById.get(ref.skillId); const attackRange = ref.attackRangeOverride ?? skill?.attackRange; return skill ? <article className="active-skill-card" key={`${ref.skillId}-${ref.unlockLevel}`}><header><h4>{ref.nameOverride ?? skill.name}</h4><ElementBadge id={skill.element} elements={elementsById} /></header><div className="skill-badges"><span>{skill.attackType === 'melee' ? '近战' : '远程'}</span><span>Lv.{ref.unlockLevel}</span></div><div className="skill-numbers"><strong>威力：{skill.power ?? '—'}</strong><span>冷却：{skill.cooldownSeconds ?? '—'}s</span></div>{skill.effects.length > 0 && <div className="skill-effects">{skill.effects.map((effect) => <span key={effect}>{effect}</span>)}</div>}{attackRange && <small>攻击范围：{attackRange}</small>}<p>{skill.description}</p></article> : null })}</aside>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
