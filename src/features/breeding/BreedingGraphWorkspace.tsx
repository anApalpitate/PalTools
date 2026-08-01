import { useMemo, useRef, useState } from 'react'
import { LocalPalImage } from '../../components/pal-ui'
import {
  MAX_BREEDING_PLAN_FILE_BYTES,
  breedingPlanFileName,
  parseBreedingPlanImport,
  serializeBreedingPlan,
  type ImportedBreedingPlan,
} from '../../domain/breeding-plan-portability'
import { matchesPalIdentityQuery } from '../../domain/search'
import type { BreedingIndexPayload, PalRecord } from '../../domain/types'
import type {
  BreedingGraphWorkspaceActions,
  BreedingGraphWorkspaceState,
} from '../../hooks/useBreedingGraphWorkspace'
import type { useBreedingPlanEditor } from '../../hooks/useBreedingPlanEditor'
import { BreedingGraphCanvas, PAL_DRAG_MIME } from './BreedingGraphCanvas'

interface BreedingGraphWorkspaceProps {
  pals: PalRecord[]
  state: BreedingGraphWorkspaceState
  actions: BreedingGraphWorkspaceActions
  editor: ReturnType<typeof useBreedingPlanEditor>
  breedingIndex: BreedingIndexPayload
  datasetVersion: string
  onQueryPal?: (palId: string) => void
}

export function BreedingGraphWorkspace({
  pals,
  state,
  actions,
  editor,
  breedingIndex,
  datasetVersion,
  onQueryPal = () => undefined,
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
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null)
  const [portabilityMessage, setPortabilityMessage] = useState('')
  const [portabilityError, setPortabilityError] = useState('')
  const [pendingImport, setPendingImport] = useState<ImportedBreedingPlan | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const currentPreset = state.presets.find(
    (preset) => preset.id === state.currentPresetId,
  )
  const currentPlan = state.plans.find((plan) => plan.id === state.currentPlanId)
  const palsById = useMemo(
    () => new Map(pals.map((pal) => [pal.internalId, pal])),
    [pals],
  )

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
    const selected = new Set(currentPreset?.palIds ?? [])
    return pals.filter((pal) => {
      if (!selected.has(pal.internalId)) return false
      return matchesPalIdentityQuery(pal, query)
    })
  }, [currentPreset?.palIds, pals, queueQuery])

  const linkedPresets = state.links
    .filter((link) => link.planId === state.currentPlanId)
    .map((link) => state.presets.find((preset) => preset.id === link.presetId))
    .filter((preset): preset is NonNullable<typeof preset> => Boolean(preset))
  const currentPresetLinked = state.links.some(
    (link) =>
      link.planId === state.currentPlanId &&
      link.presetId === state.currentPresetId,
  )

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

  async function openPlanRename() {
    if (!(await editor.actions.flush())) return
    setPlanNameDraft(currentPlan?.name ?? '')
    setResourceError('')
    setEditingPlan(true)
  }

  async function submitPlanRename() {
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
    if (!(await editor.actions.flush())) return
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

  async function handlePlanChange(planId: string) {
    if (planId === state.currentPlanId) return
    if (state.presetDirty) {
      setPendingPlanId(planId)
      return
    }
    const saved = await editor.actions.flush()
    if (saved) actions.selectPlan(planId)
  }

  async function savePresetAndContinue() {
    if (!pendingPresetId && !pendingPlanId) return
    const saved = await actions.savePreset()
    if (!saved) return
    if (pendingPresetId) actions.selectPreset(pendingPresetId)
    if (pendingPlanId) {
      const planSaved = await editor.actions.flush()
      if (!planSaved) return
      actions.selectPlan(pendingPlanId)
    }
    setPendingPresetId(null)
    setPendingPlanId(null)
  }

  async function discardPresetAndContinue() {
    if (!pendingPresetId && !pendingPlanId) return
    actions.discardPresetChanges()
    if (pendingPresetId) actions.selectPreset(pendingPresetId)
    if (pendingPlanId) {
      const planSaved = await editor.actions.flush()
      if (!planSaved) return
      actions.selectPlan(pendingPlanId)
    }
    setPendingPresetId(null)
    setPendingPlanId(null)
  }

  async function exportCurrentPlan() {
    const plan = editor.state.plan ?? currentPlan
    if (!plan || !datasetVersion) {
      setPortabilityError('当前方案或数据集版本尚未就绪。')
      return
    }
    if (!(await editor.actions.flush())) return
    try {
      const text = serializeBreedingPlan(plan, datasetVersion)
      downloadTextFile(text, breedingPlanFileName(plan.name))
      setPortabilityError('')
      setPortabilityMessage(`已导出方案“${plan.name}”。`)
    } catch (error: unknown) {
      setPortabilityMessage('')
      setPortabilityError(
        error instanceof Error ? error.message : '方案导出失败。',
      )
    }
  }

  async function commitImportedPlan(candidate: ImportedBreedingPlan) {
    if (state.presetDirty) {
      setPortabilityError('导入前请先保存或放弃当前预设更改。')
      return
    }
    if (!(await editor.actions.flush())) return
    const imported = await actions.importPlan(candidate.plan)
    if (!imported) return
    setPendingImport(null)
    setPortabilityError('')
    setPortabilityMessage(`已导入方案“${candidate.plan.name}”，未关联任何预设。`)
  }

  async function handleImportFile(file: File) {
    setPortabilityMessage('')
    setPortabilityError('')
    try {
      if (file.size > MAX_BREEDING_PLAN_FILE_BYTES) {
        throw new Error('方案文件不得超过 5 MiB。')
      }
      const candidate = parseBreedingPlanImport(await file.text(), {
        currentDatasetVersion: datasetVersion,
        existingPlanNames: new Set(state.plans.map((plan) => plan.name)),
        validPalIds: new Set(pals.map((pal) => pal.internalId)),
        breedingIndex,
      })
      if (candidate.datasetVersionMismatch) {
        setPendingImport(candidate)
      } else {
        await commitImportedPlan(candidate)
      }
    } catch (error: unknown) {
      setPortabilityError(
        error instanceof Error ? error.message : '方案导入失败。',
      )
    } finally {
      if (importInputRef.current) importInputRef.current.value = ''
    }
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
        <div className="resource-selector resource-selector--plan">
          <label htmlFor="current-plan-select">当前方案</label>
          <div className="resource-selector-row">
            <select
              id="current-plan-select"
              value={state.currentPlanId}
              onChange={(event) => void handlePlanChange(event.target.value)}
            >
              {state.plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="quiet-button"
              onClick={() => {
                void editor.actions.flush().then((saved) => {
                  if (saved) actions.createPlan()
                })
              }}
            >
              新建
            </button>
            <button
              type="button"
              className="quiet-button"
              onClick={() => void openPlanRename()}
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
            <button
              type="button"
              className="quiet-button"
              onClick={() => void exportCurrentPlan()}
              disabled={!currentPlan || !datasetVersion}
            >
              导出
            </button>
            <button
              type="button"
              className="quiet-button"
              onClick={() => {
                if (state.presetDirty) {
                  setPortabilityError('导入前请先保存或放弃当前预设更改。')
                  return
                }
                importInputRef.current?.click()
              }}
              disabled={!breedingIndex || !datasetVersion}
            >
              导入
            </button>
            <input
              ref={importInputRef}
              className="sr-only"
              type="file"
              accept=".paltools-plan.json,application/json"
              aria-label="导入配种图方案文件"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void handleImportFile(file)
              }}
            />
          </div>
        </div>
      </div>

      {(portabilityMessage || portabilityError) && (
        <p
          className={portabilityError ? 'graph-inline-error' : 'graph-status-message'}
          role={portabilityError ? 'alert' : 'status'}
        >
          {portabilityError || portabilityMessage}
        </p>
      )}

      <section className="graph-link-bar" aria-label="当前方案关联预设">
        <div className="graph-link-heading">
          <strong>当前方案关联预设</strong>
          <span>{linkedPresets.length} 个</span>
        </div>
        <div className="graph-link-list">
          {linkedPresets.length === 0 ? (
            <span className="muted">尚未关联预设</span>
          ) : (
            linkedPresets.map((preset) => (
              <span className="graph-link-chip" key={preset.id}>
                {preset.name}
                <button
                  type="button"
                  aria-label={`解除关联 ${preset.name}`}
                  onClick={() =>
                    void editor.actions.flush().then((saved) => {
                      if (saved) {
                        void actions.unlinkPresetFromPlan(
                          preset.id,
                          state.currentPlanId,
                        )
                      }
                    })
                  }
                >
                  ×
                </button>
              </span>
            ))
          )}
          <button
            type="button"
            className="quiet-button"
            disabled={!currentPreset || !currentPlan || currentPresetLinked}
            onClick={() =>
              void editor.actions.flush().then((saved) => {
                if (saved) {
                  void actions.linkPresetToPlan(
                    state.currentPresetId,
                    state.currentPlanId,
                  )
                }
              })
            }
          >
            关联当前预设
          </button>
        </div>
        {state.planSaveState === 'error' && (
          <p className="graph-inline-error" role="alert">
            {state.planSaveError}
          </p>
        )}
      </section>

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
                  <div
                    key={pal.internalId}
                    className="queue-chip"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(PAL_DRAG_MIME, pal.internalId)
                      event.dataTransfer.effectAllowed = 'copy'
                    }}
                  >
                    <LocalPalImage pal={pal} size="tree" />
                    <span>
                      <strong>{pal.name.zhHans}</strong>
                      <small>
                        {pal.paldexNo ? `#${pal.paldexNo}` : '无编号'}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="queue-add-button"
                      onClick={() => editor.actions.addPresetNode(pal.internalId)}
                      aria-label={`添加到画布 ${pal.name.zhHans}`}
                    >
                      添加
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <BreedingGraphCanvas
            palsById={palsById}
            editor={editor}
            onQueryPal={onQueryPal}
            onAddPalToPreset={(palId) => actions.addPresetPalIds([palId])}
          />
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
          onSubmit={() => void submitPlanRename()}
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

      {(pendingPresetId || pendingPlanId) && (
        <div className="graph-modal-backdrop">
          <div
            className="graph-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-preset-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setPendingPresetId(null)
                setPendingPlanId(null)
              }
            }}
          >
            <h2 id="unsaved-preset-title">预设有未保存更改</h2>
            <p>切换前请选择保存或放弃当前草稿。</p>
            <div className="graph-modal-actions">
              <button
                type="button"
                className="primary-button"
                autoFocus
                onClick={() => void savePresetAndContinue()}
              >
                保存并继续
              </button>
              <button
                type="button"
                className="quiet-button"
                onClick={() => void discardPresetAndContinue()}
              >
                放弃更改
              </button>
              <button
                type="button"
                className="quiet-button"
                onClick={() => {
                  setPendingPresetId(null)
                  setPendingPlanId(null)
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingImport && (
        <div className="graph-modal-backdrop">
          <div
            className="graph-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dataset-warning-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setPendingImport(null)
            }}
          >
            <h2 id="dataset-warning-title">数据集版本不同</h2>
            <p>
              文件使用 {pendingImport.sourceDatasetVersion}，当前为 {datasetVersion}。
              所有关系已按当前配方索引重新校验，是否继续导入？
            </p>
            <div className="graph-modal-actions">
              <button
                type="button"
                className="primary-button"
                autoFocus
                onClick={() => void commitImportedPlan(pendingImport)}
              >
                继续导入
              </button>
              <button
                type="button"
                className="quiet-button"
                onClick={() => setPendingImport(null)}
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

function downloadTextFile(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
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
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
        }}
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
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
        }}
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{message}</p>
        <div className="graph-modal-actions">
          <button type="button" className="primary-button" autoFocus onClick={onConfirm}>
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
