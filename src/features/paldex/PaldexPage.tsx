import { useEffect, useMemo, useState } from 'react'
import {
  ElementBadge,
  ItemImage,
  LocalPalImage,
  RarityStars,
  WorkSuitabilityIcon,
  type ElementMap,
} from '../../components/pal-ui'
import { filterPals, type PalSortKey } from '../../domain/pals'
import type {
  ActiveSkillRecord,
  ElementId,
  ElementRecord,
  ItemRecord,
  PalRecord,
  PalStatKey,
  WorkSuitabilityRecord,
} from '../../domain/types'
import { useScrollActivity } from '../../hooks/useScrollActivity'

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

interface PaldexPageProps {
  pals: PalRecord[]
  elementRecords: ElementRecord[]
  skills: ActiveSkillRecord[]
  items: ItemRecord[]
  workSuitabilityRecords: WorkSuitabilityRecord[]
}

export function PaldexPage({
  pals,
  elementRecords,
  skills,
  items,
  workSuitabilityRecords,
}: PaldexPageProps) {
  const [query, setQuery] = useState('')
  const [element, setElement] = useState<ElementId | ''>('')
  const [workTypes, setWorkTypes] = useState<string[]>([])
  const [sortKey, setSortKey] = useState<PalSortKey>('paldexNo')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [selectedPal, setSelectedPal] = useState<PalRecord | null>(null)
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
  const availableWorkTypes = useMemo(
    () =>
      [...new Set(pals.flatMap((pal) => Object.keys(pal.workSuitabilities)))].sort(),
    [pals],
  )
  const filteredPals = useMemo(
    () =>
      filterPals(
        pals,
        { query, element, workTypes, sortKey, sortDirection },
        { skills: skillsById, items: itemsById },
      ),
    [
      pals,
      query,
      element,
      workTypes,
      sortKey,
      sortDirection,
      skillsById,
      itemsById,
    ],
  )

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

  const resetFilters = () => {
    setQuery('')
    setElement('')
    setWorkTypes([])
    setSortKey('paldexNo')
    setSortDirection('asc')
  }

  return (
    <>
      <main>
        <section className="page-heading">
          <div>
            <p className="eyebrow">PALDEX / SCHEMA V4</p>
            <h1>帕鲁图鉴</h1>
            <p>检索帕鲁、伙伴技能、主动/被动技能、掉落物和详细数值。</p>
          </div>
          <div className="count-block">
            <strong>{filteredPals.length}</strong>
            <span>/ {pals.length || 300} 个帕鲁</span>
          </div>
        </section>

        <section className="filter-panel" aria-label="图鉴筛选">
          <label className="search-field">
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名称、技能、掉落物、编号或内部 ID"
              aria-label="搜索帕鲁"
            />
          </label>
          <label className="field field--inline stat-field">
            <span>排序依据</span>
            <select
              aria-label="排序依据"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as PalSortKey)}
            >
              <option value="paldexNo">图鉴编号</option>
              {statDefinitions.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="field field--inline">
            <span>排列方式</span>
            <select
              aria-label="排列方式"
              value={sortDirection}
              onChange={(event) =>
                setSortDirection(event.target.value as 'asc' | 'desc')
              }
            >
              <option value="asc">从低到高</option>
              <option value="desc">从高到低</option>
            </select>
          </label>
          <button className="quiet-button reset-filter-button" onClick={resetFilters}>
            重置
          </button>
          <div className="element-filter" role="group" aria-label="属性筛选">
            <button
              className={element === '' ? 'is-active' : ''}
              aria-pressed={element === ''}
              onClick={() => setElement('')}
            >
              全部属性
            </button>
            {elementRecords.map((item) => (
              <button
                key={item.id}
                className={element === item.id ? 'is-active' : ''}
                aria-label={`筛选${item.name.zhHans}`}
                aria-pressed={element === item.id}
                onClick={() => setElement(item.id)}
              >
                <ElementBadge id={item.id} elements={elementsById} compact />
                <span>{item.name.zhHans}</span>
              </button>
            ))}
          </div>
          <div className="work-filter" role="group" aria-label="工作适应性筛选">
            <span className="filter-row-label">工作适应性（多选）</span>
            <button
              className={workTypes.length === 0 ? 'is-active' : ''}
              aria-pressed={workTypes.length === 0}
              onClick={() => setWorkTypes([])}
            >
              全部适性
            </button>
            {availableWorkTypes.map((item) => {
              const active = workTypes.includes(item)
              return (
                <button
                  key={item}
                  className={active ? 'is-active' : ''}
                  aria-pressed={active}
                  onClick={() =>
                    setWorkTypes((current) =>
                      active
                        ? current.filter((value) => value !== item)
                        : [...current, item],
                    )
                  }
                >
                  <WorkSuitabilityIcon
                    item={workSuitabilitiesByName.get(item)}
                    compact
                  />
                  <span>{item}</span>
                </button>
              )
            })}
          </div>
        </section>

        {pals.length === 0 ? (
          <div className="loading-grid" aria-label="图鉴加载中">
            {Array.from({ length: 8 }, (_, index) => <span key={index} />)}
          </div>
        ) : filteredPals.length === 0 ? (
          <section className="empty-state">
            <h2>没有找到匹配的帕鲁</h2>
            <p>调整筛选后重试。</p>
            <button onClick={resetFilters}>清空筛选</button>
          </section>
        ) : (
          <section className="pal-grid" aria-label="帕鲁列表">
            {filteredPals.map((pal) => (
              <button
                className="pal-card"
                key={pal.internalId}
                onClick={() => setSelectedPal(pal)}
              >
                <span className="paldex-number">
                  {pal.paldexNo ? `#${pal.paldexNo}` : '无编号'}
                </span>
                <LocalPalImage pal={pal} />
                <span className="pal-card-copy">
                  <strong>{pal.name.zhHans}</strong>
                  <small>{pal.name.en}</small>
                  <span className="element-row">
                    {pal.elements.map((item) => (
                      <ElementBadge key={item} id={item} elements={elementsById} />
                    ))}
                  </span>
                  {sortKey !== 'paldexNo' && (
                    <span className="pal-sort-value">
                      <small>
                        {statDefinitions.find((item) => item.key === sortKey)?.label}
                      </small>
                      <strong>{pal.stats[sortKey] ?? '—'}</strong>
                    </span>
                  )}
                </span>
                <span className="work-row">
                  {Object.entries(pal.workSuitabilities).map(([work, level]) => (
                    <span
                      className={workTypes.includes(work) ? 'is-filter-match' : ''}
                      key={work}
                    >
                      <WorkSuitabilityIcon
                        item={workSuitabilitiesByName.get(work)}
                        compact
                      />
                      {work} <b>{level}</b>
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </section>
        )}
      </main>

      {selectedPal && (
        <PalDetailDialog
          pal={selectedPal}
          elements={elementsById}
          skills={skillsById}
          items={itemsById}
          workSuitabilities={workSuitabilitiesByName}
          onClose={() => setSelectedPal(null)}
        />
      )}
    </>
  )
}

function PalDetailDialog({
  pal,
  elements,
  skills,
  items,
  workSuitabilities,
  onClose,
}: {
  pal: PalRecord
  elements: ElementMap
  skills: ReadonlyMap<string, ActiveSkillRecord>
  items: ReadonlyMap<string, ItemRecord>
  workSuitabilities: ReadonlyMap<string, WorkSuitabilityRecord>
  onClose: () => void
}) {
  const detailScroll = useScrollActivity()
  const skillScroll = useScrollActivity()

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="detail-dialog detail-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
      >
        <button className="dialog-close" aria-label="关闭详情" onClick={onClose}>
          ×
        </button>
        <div className="detail-layout">
          <div
            className={`detail-main-scroll themed-scrollbar ${
              detailScroll.isActive ? 'is-scrollbar-active' : ''
            }`}
            aria-label="帕鲁详情"
            role="region"
            tabIndex={0}
            dir="rtl"
            onScroll={detailScroll.handleScroll}
          >
            <div className="detail-main" dir="ltr">
              <LocalPalImage pal={pal} size="detail" />
              <div className="detail-heading">
                <span>{pal.paldexNo ? `#${pal.paldexNo}` : '无图鉴编号'}</span>
                <h2 id="detail-title">{pal.name.zhHans}</h2>
                <p>{pal.name.en} · {pal.internalId}</p>
              </div>
              <div className="detail-facts">
                <div>
                  <span>属性</span>
                  <strong className="detail-elements">
                    {pal.elements.map((item) => (
                      <ElementBadge key={item} id={item} elements={elements} />
                    ))}
                  </strong>
                </div>
                <div>
                  <span>稀有度</span>
                  <strong><RarityStars rarity={pal.rarity} /></strong>
                </div>
                <div>
                  <span>伙伴技能</span>
                  <strong>{pal.partnerSkill?.name ?? '名称调查中'}</strong>
                  <p>{pal.partnerSkill?.description ?? '暂无直接来源数据'}</p>
                </div>
              </div>
              {(['战斗与生产', '移动能力'] as const).map((group) => (
                <section className="detail-stat-group" key={group}>
                  <h3>{group}</h3>
                  <div className="stat-grid">
                    {statDefinitions
                      .filter((item) => item.group === group)
                      .map((item) => {
                        const value = pal.stats[item.key]
                        const source = pal.statSources[item.key]
                        return (
                          <div key={item.key} title={item.note}>
                            <span>{item.label}{item.note ? ' ⓘ' : ''}</span>
                            <strong>{value ?? '暂无数据'}</strong>
                            {source && <small>{source === 'paldb' ? 'paldb' : 'PalCalc'}</small>}
                          </div>
                        )
                      })}
                  </div>
                </section>
              ))}
              <section className="detail-section detail-work">
                <h3>工作适性</h3>
                <div>
                  {Object.entries(pal.workSuitabilities).length ? (
                    Object.entries(pal.workSuitabilities).map(([work, level]) => (
                      <span key={work}>
                        <WorkSuitabilityIcon item={workSuitabilities.get(work)} />
                        {work} <b>Lv.{level}</b>
                      </span>
                    ))
                  ) : <span>暂无数据</span>}
                </div>
              </section>
              {pal.passiveSkills && pal.passiveSkills.length > 0 && (
                <section className="detail-section detail-passives">
                  <h3>固有词条</h3>
                  <div className="passive-list">
                    {pal.passiveSkills.map((skill, index) => (
                      <article key={`${skill.name}-${index}`}>
                        <header>
                          <strong>{skill.name}</strong>
                          {skill.rank && <span>Rank {skill.rank}</span>}
                        </header>
                        <p>{skill.description}</p>
                      </article>
                    ))}
                  </div>
                </section>
              )}
              <section className="detail-section detail-drops">
                <h3>掉落物品</h3>
                {pal.drops === null ? (
                  <p className="muted">暂无直接来源数据</p>
                ) : (
                  <div className="drop-table" role="table">
                    <div className="drop-row drop-head" role="row">
                      <span>物品</span><span>数量</span><span>概率</span>
                    </div>
                    {pal.drops.map((drop, index) => {
                      const item = items.get(drop.itemId)
                      return (
                        <div className="drop-row" role="row" key={`${drop.itemId}-${index}`}>
                          <span>{item && <ItemImage item={item} />}<b>{item?.name ?? drop.itemId}</b></span>
                          <span>{drop.quantityMin === drop.quantityMax ? drop.quantityMin : `${drop.quantityMin}–${drop.quantityMax}`}</span>
                          <span>{drop.requiredLevel !== null && `Lv.${drop.requiredLevel} `}{drop.probabilityPercent}%</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
              <a className="source-link" href={pal.sourceUrl} target="_blank" rel="noreferrer">
                查看 paldb 来源页面 ↗
              </a>
            </div>
          </div>
          <aside
            className={`active-skills-panel themed-scrollbar ${
              skillScroll.isActive ? 'is-scrollbar-active' : ''
            }`}
            aria-label="主动技能"
            tabIndex={0}
            onScroll={skillScroll.handleScroll}
          >
            <h3>主动技能</h3>
            {pal.activeSkills === null ? (
              <p className="muted">暂无直接来源数据</p>
            ) : pal.activeSkills.length === 0 ? (
              <p className="muted">该页面未列出主动技能</p>
            ) : pal.activeSkills.map((ref) => {
              const skill = skills.get(ref.skillId)
              const attackRange = ref.attackRangeOverride ?? skill?.attackRange
              return skill ? (
                <article className="active-skill-card" key={`${ref.skillId}-${ref.unlockLevel}`}>
                  <header><h4>{ref.nameOverride ?? skill.name}</h4><ElementBadge id={skill.element} elements={elements} /></header>
                  <div className="skill-badges"><span>{skill.attackType === 'melee' ? '近战' : '远程'}</span><span>Lv.{ref.unlockLevel}</span></div>
                  <div className="skill-numbers"><strong>威力：{skill.power ?? '—'}</strong><span>冷却：{skill.cooldownSeconds ?? '—'}s</span></div>
                  {skill.effects.length > 0 && <div className="skill-effects">{skill.effects.map((effect) => <span key={effect}>{effect}</span>)}</div>}
                  {attackRange && <small>攻击范围：{attackRange}</small>}
                  <p>{skill.description}</p>
                </article>
              ) : null
            })}
          </aside>
        </div>
      </section>
    </div>
  )
}
