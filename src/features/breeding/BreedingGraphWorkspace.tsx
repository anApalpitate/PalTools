import { useMemo, useState } from 'react'
import { LocalPalImage } from '../../components/pal-ui'
import { matchesPalIdentityQuery } from '../../domain/search'
import type { PalRecord } from '../../domain/types'
import type {
  BreedingGraphWorkspaceActions,
  BreedingGraphWorkspaceState,
} from '../../hooks/useBreedingGraphWorkspace'

interface BreedingGraphWorkspaceProps {
  pals: PalRecord[]
  state: BreedingGraphWorkspaceState
  actions: BreedingGraphWorkspaceActions
}

export function BreedingGraphWorkspace({
  pals,
  state,
  actions,
}: BreedingGraphWorkspaceProps) {
  const [presetQuery, setPresetQuery] = useState('')
  const [queueQuery, setQueueQuery] = useState('')
  const [editingPreset, setEditingPreset] = useState(false)
  const [editingPlan, setEditingPlan] = useState(false)
  const [presetNameDraft, setPresetNameDraft] = useState('')
  const [planNameDraft, setPlanNameDraft] = useState('')
  const [resourceError, setResourceError] = useState('')
  const [deletePresetId, setDeletePresetId] = useState<string | null>(null)
  const [deletePlanId, setDeletePlanId] = useState<string | null>(null)
  const [pendingPresetId, setPendingPresetId] = useState<string | null>(null)

  const visiblePals = useMemo(() => {
    const query = presetQuery.trim().toLocaleLowerCase('zh-CN')
    return [...pals]
      .filter((pal) => matchesPalIdentityQuery(pal, query))
      .sort((left, right) => {
        if (left.paldexNo === null && right.paldexNo === null) {
          return left.internalId.localeCompare(right.internalId)
        }
        if (left.paldexNo === null) return 1
        if (right.paldexNo === null) return -1
        return (
          left.paldexNo.localeCompare(right.paldexNo, undefined, {
            numeric: true,
          }) || left.internalId.localeCompare(right.internalId)
        )
      })
  }, [pals, presetQuery])

  const queuePals = useMemo(() => {
    const query = queueQuery.trim().toLocaleLowerCase('zh-CN')
    const selected = new Set(state.presetDraftPalIds)
    return pals.filter((pal) => {
      if (!selected.has(pal.internalId)) return false
      return matchesPalIdentityQuery(pal, query)
    })
  }, [pals, queueQuery, state.presetDraftPalIds])

  const currentPreset = state.presets.find(
    (preset) => preset.id === state.currentPresetId,
  )
  const currentPlan = state.plans.find((plan) => plan.id === state.currentPlanId)

  function openPresetRename() {
    setPresetNameDraft(currentPreset?.name ?? '')
    setResourceError('')
    setEditingPreset(true)
  }

  function submitPresetRename() {
    const name = presetNameDraft.trim()
    if (!currentPreset) return
    if (name.length < 1 || name.length > 30) {
      setResourceError('预设名称需为 1–30 个字符。')
      return
    }
    if (
      state.presets.some(
        (preset) => preset.id !== currentPreset.id && preset.name === name,
      )
    ) {
      setResourceError('预设名称已存在。')
      return
    }
    actions.renamePreset(name)
    setEditingPreset(false)
  }

  function openPlanRename() {
    setPlanNameDraft(currentPlan?.name ?? '')
    setResourceError('')
    setEditingPlan(true)
  }

  function submitPlanRename() {
    const name = planNameDraft.trim()
    if (!currentPlan) return
    if (name.length < 1 || name.length > 40) {
      setResourceError('方案名称需为 1–40 个字符。')
      return
    }
    if (
      state.plans.some(
        (plan) => plan.id !== currentPlan.id && plan.name === name,
      )
    ) {
      setResourceError('方案名称已存在。')
      return
    }
    actions.renamePlan(name)
    setEditingPlan(false)
  }

  function handlePresetChange(presetId: string) {
    if (presetId === state.currentPresetId) return
    if (state.presetDirty) {
      setPendingPresetId(presetId)
      return
    }
    actions.selectPreset(presetId)
  }

  async function savePresetAndContinue() {
    if (!pendingPresetId) return
    await actions.savePreset()
    actions.selectPreset(pendingPresetId)
    setPendingPresetId(null)
  }

  function discardPresetAndContinue() {
    if (!pendingPresetId) return
    actions.discardPresetChanges()
    actions.selectPreset(pendingPresetId)
    setPendingPresetId(null)
  }

  return (
    <section className="breeding-workspace graph-workspace">
      <div className="graph-resource-bar" aria-label="配种图资源管理">
        <div className="resource-selector">
          <label htmlFor="current-preset-select">当前预设</label>
          <div className="resource-selector-row">
            <select
              id="current-preset-select"
              value={state.currentPresetId}
              onChange={(event) => handlePresetChange(event.target.value)}
            >
              {state.presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="quiet-button"
              onClick={actions.createPreset}
            >
              新建
            </button>
            <button
              type="button"
              className="quiet-button"
              onClick={openPresetRename}
              disabled={!currentPreset}
            >
              重命名
            </button>
            <button
              type="button"
              className="quiet-button graph-danger-button"
              onClick={() => setDeletePresetId(state.currentPresetId)}
              disabled={!currentPreset}
            >
              删除
            </button>
          </div>
        </div>
        <div className="resource-selector">
          <label htmlFor="current-plan-select">当前方案</label>
          <div className="resource-selector-row">
            <select
              id="current-plan-select"
              value={state.currentPlanId}
              onChange={(event) => actions.selectPlan(event.target.value)}
            >
              {state.plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
            <button type="button" className="quiet-button" onClick={actions.createPlan}>
              新建
            </button>
            <button
              type="button"
              className="quiet-button"
              onClick={openPlanRename}
              disabled={!currentPlan}
            >
              重命名
            </button>
            <button
              type="button"
              className="quiet-button graph-danger-button"
              onClick={() => setDeletePlanId(state.currentPlanId)}
              disabled={!currentPlan}
            >
              删除
            </button>
          </div>
        </div>
      </div>

      <div className="graph-workspace-grid">
        <section className="preset-panel" aria-label="已有帕鲁预设">
          <div className="preset-panel-heading">
            <h2>已有帕鲁预设</h2>
            <span className="preset-save-state" aria-live="polite">
              {state.presetSaveState === 'error'
                ? state.presetSaveError
                : state.presetDirty
                  ? '有未保存更改'
                  : '已保存'}
            </span>
          </div>
          <label className="search-field">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="搜索预设帕鲁"
              value={presetQuery}
              onChange={(event) => setPresetQuery(event.target.value)}
              placeholder="搜索图鉴全部帕鲁"
              spellCheck={false}
            />
          </label>
          <div className="preset-bulk-actions">
            <button
              type="button"
              className="quiet-button"
              disabled={visiblePals.length === 0}
              onClick={() =>
                actions.addPresetPalIds(
                  visiblePals.map((pal) => pal.internalId),
                )
              }
            >
              全选结果
            </button>
            <button
              type="button"
              className="quiet-button"
              disabled={state.presetDraftPalIds.length === 0}
              onClick={actions.clearPresetDraft}
            >
              清空已选
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={!state.presetDirty}
              onClick={() => void actions.savePreset()}
            >
              保存预设
            </button>
          </div>
          <div
            className="preset-option-list themed-scrollbar"
            role="group"
            aria-label="预设可选帕鲁"
          >
            {visiblePals.length === 0 ? (
              <p className="preset-empty">没有匹配的帕鲁</p>
            ) : (
              visiblePals.map((pal) => {
                const selected = state.presetDraftPalIds.includes(pal.internalId)
                return (
                  <button
                    type="button"
                    key={pal.internalId}
                    className={selected ? 'preset-option is-selected' : 'preset-option'}
                    role="checkbox"
                    aria-checked={selected}
                    onClick={() => actions.togglePresetPal(pal.internalId)}
                  >
                    <span className="preset-avatar">
                      <LocalPalImage pal={pal} size="tree" />
                      {selected && (
                        <span className="preset-check" aria-hidden="true">
                          ✓
                        </span>
                      )}
                    </span>
                    <span className="preset-option-text">
                      <strong>{pal.name.zhHans}</strong>
                      <small>
                        {pal.paldexNo ? `#${pal.paldexNo}` : '无编号'}
                      </small>
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </section>

        <div className="graph-main-column">
          <section className="preset-queue" aria-label="当前预设队列">
            <div className="preset-queue-heading">
              <h2>当前预设队列</h2>
              <span>
                {state.presetDraftPalIds.length} 只帕鲁
              </span>
            </div>
            <label className="search-field queue-search">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="搜索当前预设队列"
                value={queueQuery}
                onChange={(event) => setQueueQuery(event.target.value)}
                placeholder="过滤当前预设"
                spellCheck={false}
              />
            </label>
            {queuePals.length === 0 ? (
              <p className="preset-empty">队列为空</p>
            ) : (
              <div className="preset-queue-list">
                {queuePals.map((pal) => (
                  <button
                    type="button"
                    key={pal.internalId}
                    className="queue-chip"
                    onClick={() => actions.togglePresetPal(pal.internalId)}
                    aria-label={`从预设移除 ${pal.name.zhHans}`}
                  >
                    <LocalPalImage pal={pal} size="tree" />
                    <span>
                      <strong>{pal.name.zhHans}</strong>
                      <small>
                        {pal.paldexNo ? `#${pal.paldexNo}` : '无编号'}
                      </small>
                    </span>
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="graph-canvas-area" aria-label="配种图画布">
            <div className="graph-canvas-empty">
              <span aria-hidden="true">◇</span>
              <h2>空画布</h2>
              <p>当前方案：{currentPlan?.name ?? '未选择'}</p>
              <p>画布编辑将在下一阶段开放。</p>
            </div>
          </section>
        </div>
      </div>

      {editingPreset && (
        <ResourceNameDialog
          title="重命名预设"
          value={presetNameDraft}
          error={resourceError}
          onValueChange={setPresetNameDraft}
          onCancel={() => setEditingPreset(false)}
          onSubmit={submitPresetRename}
        />
      )}

      {editingPlan && (
        <ResourceNameDialog
          title="重命名方案"
          value={planNameDraft}
          error={resourceError}
          onValueChange={setPlanNameDraft}
          onCancel={() => setEditingPlan(false)}
          onSubmit={submitPlanRename}
        />
      )}

      {deletePresetId && (
        <ConfirmDialog
          title="删除预设"
          message="删除后不会影响任何方案或画布节点。"
          onCancel={() => setDeletePresetId(null)}
          onConfirm={() => {
            actions.deletePreset(deletePresetId)
            setDeletePresetId(null)
          }}
        />
      )}

      {deletePlanId && (
        <ConfirmDialog
          title="删除方案"
          message="删除后不会影响任何预设。"
          onCancel={() => setDeletePlanId(null)}
          onConfirm={() => {
            actions.deletePlan(deletePlanId)
            setDeletePlanId(null)
          }}
        />
      )}

      {pendingPresetId && (
        <div className="graph-modal-backdrop">
          <div
            className="graph-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-preset-title"
          >
            <h2 id="unsaved-preset-title">预设有未保存更改</h2>
            <p>切换前请选择保存或放弃当前草稿。</p>
            <div className="graph-modal-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => void savePresetAndContinue()}
              >
                保存并继续
              </button>
              <button
                type="button"
                className="quiet-button"
                onClick={discardPresetAndContinue}
              >
                放弃更改
              </button>
              <button
                type="button"
                className="quiet-button"
                onClick={() => setPendingPresetId(null)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function ResourceNameDialog({
  title,
  value,
  error,
  onValueChange,
  onCancel,
  onSubmit,
}: {
  title: string
  value: string
  error: string
  onValueChange: (value: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div className="graph-modal-backdrop">
      <div
        className="graph-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resource-dialog-title"
      >
        <h2 id="resource-dialog-title">{title}</h2>
        <label className="field">
          <span>名称</span>
          <input
            autoFocus
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSubmit()
            }}
          />
        </label>
        {error && <p className="graph-modal-error">{error}</p>}
        <div className="graph-modal-actions">
          <button type="button" className="primary-button" onClick={onSubmit}>
            确定
          </button>
          <button type="button" className="quiet-button" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmDialog({
  title,
  message,
  onCancel,
  onConfirm,
}: {
  title: string
  message: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="graph-modal-backdrop">
      <div
        className="graph-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{message}</p>
        <div className="graph-modal-actions">
          <button type="button" className="primary-button" onClick={onConfirm}>
            删除
          </button>
          <button type="button" className="quiet-button" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}