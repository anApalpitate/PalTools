import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import {
  ElementBadge,
  ItemImage,
  LocalPalImage,
  RarityStars,
  WorkSuitabilityIcon,
  type ElementMap,
} from '../../components/pal-ui'
import {
  ArrowRightIcon,
  BreedingRouteIcon,
  CloseIcon,
  ExternalLinkIcon,
} from '../../components/ui-icons'
import type {
  ActiveSkillRecord,
  ItemRecord,
  PalRecord,
  PalStatKey,
  WorkSuitabilityRecord,
} from '../../domain/types'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useScrollActivity } from '../../hooks/useScrollActivity'

export const palStatDefinitions: Array<{
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

interface PalDetailDialogProps {
  pal: PalRecord
  elements: ElementMap
  skills: ReadonlyMap<string, ActiveSkillRecord>
  items: ReadonlyMap<string, ItemRecord>
  workSuitabilities: ReadonlyMap<string, WorkSuitabilityRecord>
  breedingState: { available: boolean; label: string }
  onNavigateToBreeding: () => void
  onClose: () => void
}

export function PalDetailDialog({
  pal,
  elements,
  skills,
  items,
  workSuitabilities,
  breedingState,
  onNavigateToBreeding,
  onClose,
}: PalDetailDialogProps) {
  const detailScroll = useScrollActivity()
  const skillScroll = useScrollActivity()
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const detailScrollRef = useRef<HTMLDivElement>(null)
  const [detailScrollState, setDetailScrollState] = useState({
    progress: 0,
    scrollable: false,
  })

  useBodyScrollLock()
  useFocusTrap(dialogRef, { initialFocusRef: closeButtonRef, onEscape: onClose })

  const syncDetailScroll = useCallback(() => {
    const element = detailScrollRef.current
    if (!element) return
    const scrollRange = element.scrollHeight - element.clientHeight
    const nextState = {
      progress: scrollRange > 0 ? element.scrollTop / scrollRange : 0,
      scrollable: scrollRange > 1,
    }
    setDetailScrollState((current) =>
      current.progress === nextState.progress && current.scrollable === nextState.scrollable
        ? current
        : nextState,
    )
  }, [])

  useLayoutEffect(() => {
    const element = detailScrollRef.current
    if (!element) return
    syncDetailScroll()
    window.addEventListener('resize', syncDetailScroll)
    if (typeof ResizeObserver === 'undefined') {
      return () => window.removeEventListener('resize', syncDetailScroll)
    }
    const observer = new ResizeObserver(syncDetailScroll)
    observer.observe(element)
    if (element.firstElementChild) observer.observe(element.firstElementChild)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', syncDetailScroll)
    }
  }, [pal.internalId, syncDetailScroll])

  const handleDetailScroll = () => {
    detailScroll.handleScroll()
    syncDetailScroll()
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        className="detail-dialog detail-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
      >
        <button ref={closeButtonRef} className="dialog-close" aria-label="关闭详情" title="关闭详情" onClick={onClose}>
          <CloseIcon />
        </button>
        <div className="detail-layout">
          <div className={`detail-main-column ${
            detailScroll.isActive ? 'is-scrollbar-active' : ''
          }`}>
            <div
              ref={detailScrollRef}
              className={`detail-main-scroll themed-scrollbar ${
              detailScroll.isActive ? 'is-scrollbar-active' : ''
            }`}
              aria-label="帕鲁详情"
              role="region"
              tabIndex={0}
              dir="rtl"
              onScroll={handleDetailScroll}
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
                    {palStatDefinitions
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
              <div className="detail-actions">
                <a
                  className="detail-source-action"
                  href={pal.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="查看 paldb 来源（在浏览器中打开）"
                  title="在浏览器中打开 paldb 来源页面"
                >
                  <ExternalLinkIcon />
                  <span>查看 paldb 来源</span>
                </a>
                <button
                  className="detail-breeding-action"
                  disabled={!breedingState.available}
                  aria-label={breedingState.label}
                  title={!breedingState.available ? breedingState.label : undefined}
                  onClick={onNavigateToBreeding}
                >
                  <span className="detail-breeding-mark"><BreedingRouteIcon /></span>
                  <span className="detail-breeding-copy">
                    <strong>{breedingState.available ? breedingState.label : '配种入口不可用'}</strong>
                    <small>{breedingState.available ? '以当前帕鲁反查亲本组合' : breedingState.label}</small>
                  </span>
                  <span className="detail-breeding-arrow"><ArrowRightIcon /></span>
                </button>
              </div>
              </div>
            </div>
            {detailScrollState.scrollable && (
              <span className="detail-scroll-cue" aria-hidden="true">
                <span
                  className="detail-scroll-cue-thumb"
                  style={{
                    top: `${detailScrollState.progress * 100}%`,
                    transform: `translateY(-${detailScrollState.progress * 100}%)`,
                  }}
                />
              </span>
            )}
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
