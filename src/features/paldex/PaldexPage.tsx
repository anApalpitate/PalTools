import { useMemo, useState } from 'react'
import {
  ElementBadge,
  LocalPalImage,
  WorkSuitabilityIcon,
  type ElementMap,
} from '../../components/pal-ui'
import { ResetIcon } from '../../components/ui-icons'
import {
  filterPals,
  workSuitabilityTotal,
  type PalSortKey,
} from '../../domain/pals'
import type {
  ActiveSkillRecord,
  BreedingIndexPayload,
  ElementId,
  ElementRecord,
  ItemRecord,
  PalRecord,
  WorkSuitabilityRecord,
} from '../../domain/types'
import { PalDetailDialog, palStatDefinitions } from './PalDetailDialog'

interface PaldexPageProps {
  pals: PalRecord[]
  elementRecords: ElementRecord[]
  skills: ActiveSkillRecord[]
  items: ItemRecord[]
  workSuitabilityRecords: WorkSuitabilityRecord[]
  selectedPalId?: string
  breedingIndex?: BreedingIndexPayload | null
  breedingIndexError?: string
  onOpenDetail?: (palId: string) => void
  onCloseDetail?: () => void
  onNavigateToBreeding?: (palId: string) => void
}

export function PaldexPage({
  pals,
  elementRecords,
  skills,
  items,
  workSuitabilityRecords,
  selectedPalId,
  breedingIndex = null,
  breedingIndexError = '',
  onOpenDetail = () => {},
  onCloseDetail = () => {},
  onNavigateToBreeding = () => {},
}: PaldexPageProps) {
  const [query, setQuery] = useState('')
  const [element, setElement] = useState<ElementId | ''>('')
  const [workTypes, setWorkTypes] = useState<string[]>([])
  const [sortKey, setSortKey] = useState<PalSortKey>('paldexNo')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const selectedPal = useMemo(
    () => pals.find((pal) => pal.internalId === selectedPalId) ?? null,
    [pals, selectedPalId],
  )
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
              name="paldex-search"
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名称、技能、掉落物、编号或内部 ID…"
              aria-label="搜索帕鲁"
              spellCheck={false}
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
              <option value="workSuitabilityTotal">工作适性等级</option>
              {palStatDefinitions.map((item) => (
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
          <button
            className="quiet-button reset-filter-button"
            aria-label="重置全部筛选"
            data-tooltip="重置全部筛选"
            onClick={resetFilters}
          >
            <ResetIcon />
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
          <div className="loading-grid" aria-label="图鉴加载中" role="status">
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
                onClick={() => onOpenDetail(pal.internalId)}
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
                        {sortKey === 'workSuitabilityTotal'
                          ? '工作适性等级'
                          : palStatDefinitions.find((item) => item.key === sortKey)?.label}
                      </small>
                      <strong>{sortKey === 'workSuitabilityTotal'
                        ? workSuitabilityTotal(pal)
                        : pal.stats[sortKey] ?? '—'}</strong>
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
          breedingState={!breedingIndex
            ? { available: false, label: breedingIndexError || '正在检查配种数据…' }
            : breedingIndex.palIds.includes(selectedPal.internalId)
              ? { available: true, label: '前往配种' }
              : { available: false, label: '暂无配种数据' }}
          onNavigateToBreeding={() => onNavigateToBreeding(selectedPal.internalId)}
          onClose={onCloseDetail}
        />
      )}
    </>
  )
}
