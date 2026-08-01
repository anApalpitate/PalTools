import { useCallback, useMemo, useRef, useState } from 'react'
import {
  MAX_BREEDING_PLAN_FILE_BYTES,
  breedingPlanFileName,
  parseBreedingPlanImport,
  serializeBreedingPlan,
  type ImportedBreedingPlan,
} from '../../domain/breeding-plan-portability'
import type { BreedingIndexPayload, PalRecord } from '../../domain/types'
import type {
  BreedingGraphWorkspaceActions,
  BreedingGraphWorkspaceState,
} from '../../hooks/useBreedingGraphWorkspace'
import type { useBreedingPlanEditor } from '../../hooks/useBreedingPlanEditor'
import { AddPalPanel } from './AddPalPanel'
import { BreedingGraphCanvas } from './BreedingGraphCanvas'

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
  const [panelOpen, setPanelOpen] = useState(true)
  const [editingPlan, setEditingPlan] = useState(false)
  const [planNameDraft, setPlanNameDraft] = useState('')
  const [resourceError, setResourceError] = useState('')
  const [deletePlanId, setDeletePlanId] = useState<string | null>(null)
  const [portabilityMessage, setPortabilityMessage] = useState('')
  const [portabilityError, setPortabilityError] = useState('')
  const [pendingImport, setPendingImport] = useState<ImportedBreedingPlan | null>(
    null,
  )
  const importInputRef = useRef<HTMLInputElement>(null)
  const addAtCanvasCenterRef = useRef<(palId: string) => void>(
    editor.actions.addManualNode,
  )
  const registerAddAtCanvasCenter = useCallback(
    (handler: (palId: string) => void) => {
      addAtCanvasCenterRef.current = handler
    },
    [],
  )
  const currentPlan = state.plans.find(
    (plan) => plan.id === state.currentPlanId,
  )
  const palsById = useMemo(
    () => new Map(pals.map((pal) => [pal.internalId, pal])),
    [pals],
  )

  async function changePlan(planId: string) {
    if (planId === state.currentPlanId) return
    if (await editor.actions.flush()) actions.selectPlan(planId)
  }

  async function createPlan() {
    if (await editor.actions.flush()) actions.createPlan()
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

  async function exportCurrentPlan() {
    const plan = editor.state.plan ?? currentPlan
    if (!plan || !datasetVersion) {
      setPortabilityError('当前方案或数据集版本尚未就绪。')
      return
    }
    if (!(await editor.actions.flush())) return
    try {
      downloadTextFile(
        serializeBreedingPlan(plan, datasetVersion),
        breedingPlanFileName(plan.name),
      )
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
    if (!(await editor.actions.flush())) return
    if (!(await actions.importPlan(candidate.plan))) return
    setPendingImport(null)
    setPortabilityError('')
    setPortabilityMessage(`已导入方案“${candidate.plan.name}”。`)
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
      <header className="graph-plan-bar" aria-label="配种图方案管理">
        <label className="graph-plan-selector">
          <span>当前方案</span>
          <select
            value={state.currentPlanId}
            onChange={(event) => void changePlan(event.target.value)}
          >
            {state.plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>
        <div className="graph-plan-actions">
          <button type="button" className="quiet-button" onClick={() => void createPlan()}>
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
            onClick={() => importInputRef.current?.click()}
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
        <span className="graph-plan-save-state" aria-live="polite">
          {saveStateText(editor.state.saveState)}
        </span>
      </header>

      {(portabilityMessage || portabilityError || state.planSaveError) && (
        <p
          className={
            portabilityError || state.planSaveError
              ? 'graph-inline-error'
              : 'graph-status-message'
          }
          role={portabilityError || state.planSaveError ? 'alert' : 'status'}
        >
          {portabilityError || state.planSaveError || portabilityMessage}
        </p>
      )}

      <div className={panelOpen ? 'graph-workspace-grid is-panel-open' : 'graph-workspace-grid'}>
        <AddPalPanel
          pals={pals}
          open={panelOpen}
          onToggle={() => setPanelOpen((open) => !open)}
          onAdd={(palId) => addAtCanvasCenterRef.current(palId)}
        />
        <div className="graph-main-column">
          <BreedingGraphCanvas
            palsById={palsById}
            editor={editor}
            onQueryPal={onQueryPal}
            onRegisterAddAtCenter={registerAddAtCanvasCenter}
          />
        </div>
      </div>

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

      {deletePlanId && (
        <ConfirmDialog
          title="删除方案"
          message="删除后无法恢复，但不会影响其他方案。"
          onCancel={() => setDeletePlanId(null)}
          onConfirm={() => {
            actions.deletePlan(deletePlanId)
            setDeletePlanId(null)
          }}
        />
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
  onValueChange(value: string): void
  onCancel(): void
  onSubmit(): void
}) {
  return (
    <div className="graph-modal-backdrop">
      <div
        className="graph-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resource-name-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
        }}
      >
        <h2 id="resource-name-title">{title}</h2>
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
        {error && (
          <p className="graph-modal-error" role="alert">
            {error}
          </p>
        )}
        <div className="graph-modal-actions">
          <button type="button" className="primary-button" onClick={onSubmit}>
            保存
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
  onCancel(): void
  onConfirm(): void
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
          <button
            type="button"
            className="primary-button"
            autoFocus
            onClick={onConfirm}
          >
            确认
          </button>
          <button type="button" className="quiet-button" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

function saveStateText(state: 'saved' | 'dirty' | 'saving' | 'error'): string {
  if (state === 'dirty') return '待保存'
  if (state === 'saving') return '保存中…'
  if (state === 'error') return '保存失败'
  return '已保存'
}

function downloadTextFile(text: string, fileName: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json;charset=utf-8' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
