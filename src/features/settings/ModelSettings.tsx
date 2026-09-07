import { useEffect, useMemo, useState } from 'react'
import { catalogModel } from '../../domain/provider-catalog'
import { createProviderProfile, PROVIDER_PRESETS, type JsonValue, type ProviderAuthMode, type ProviderModelConfigV2, type ProviderPreset, type ProviderProfile, type ProviderTransport } from '../../domain/agent'
import type { ProviderProfilesController } from '../../hooks/useProviderProfiles'

interface ModelSettingsProps { controller: ProviderProfilesController }

function parseRecord(raw: string, label: string): Record<string, JsonValue> {
  if (!raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    return parsed as Record<string, JsonValue>
  } catch { throw new Error(`${label}必须是 JSON 对象`) }
}

function bodyTextsFor(profile: ProviderProfile): Record<string, string> {
  return Object.fromEntries(profile.models.map((model) => [model.modelId, JSON.stringify(model.extraBody, null, 2)]))
}

function modelBadge(model: ProviderModelConfigV2): string[] {
  return [
    ...(model.capabilities?.includes('vision') ? ['视觉'] : []),
    ...(model.status === 'preview' ? ['预览'] : []),
    ...(model.status === 'experimental' ? ['实验'] : []),
  ]
}

export function ModelSettings({ controller }: ModelSettingsProps) {
  const [selectedId, setSelectedId] = useState('')
  const selected = controller.snapshot.profiles.find((profile) => profile.id === selectedId)
  const [draft, setDraft] = useState<ProviderProfile>(() => createProviderProfile('openai'))
  const [modelEditorId, setModelEditorId] = useState(draft.defaultModelId)
  const [customModelId, setCustomModelId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [headersText, setHeadersText] = useState('{}')
  const [bodyTexts, setBodyTexts] = useState<Record<string, string>>(() => bodyTextsFor(draft))
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [clearStoredApiKey, setClearStoredApiKey] = useState(false)
  const selectedManaged = Boolean(selected && controller.snapshot.managedProfileIds.includes(selected.id))
  const knownPreset = useMemo(() => PROVIDER_PRESETS.find((item) => item.id === draft.presetId), [draft.presetId])
  const preset = useMemo<ProviderPreset>(() => knownPreset ?? {
    id: draft.presetId,
    label: `旧模板配置（${draft.presetId}）`,
    transport: draft.transport,
    baseUrl: draft.baseUrl,
    authMode: draft.authMode,
    modelPlaceholder: '例如原模型 ID…',
    docsUrl: '',
    note: '这是已保存的旧模板配置。当前字段会保持不变，只有主动选择其他模板才会替换。',
  }, [draft.authMode, draft.baseUrl, draft.presetId, draft.transport, knownPreset])
  const editedModel = draft.models.find((model) => model.modelId === modelEditorId) ?? draft.models[0]

  const loadDraft = (profile: ProviderProfile) => {
    setDraft(profile)
    setModelEditorId(profile.defaultModelId)
    setHeadersText(JSON.stringify(profile.extraHeaders, null, 2))
    setBodyTexts(bodyTextsFor(profile))
    setApiKey('')
    setCustomModelId('')
    setClearStoredApiKey(false)
  }

  useEffect(() => {
    const next = selectedId ? selected : controller.snapshot.profiles.find((profile) => profile.id === controller.snapshot.defaultProfileId) ?? controller.snapshot.profiles[0]
    if (!next) return
    if (!selectedId) setSelectedId(next.id)
    loadDraft(next)
  }, [controller.snapshot.profiles, selected, selectedId])

  const update = <K extends keyof ProviderProfile>(key: K, value: ProviderProfile[K]) => {
    const crossesCredentialBoundary = key === 'baseUrl' || key === 'transport' || key === 'authMode'
    if (crossesCredentialBoundary && draft[key] !== value) {
      setApiKey('')
      setClearStoredApiKey(true)
      setStatus(key === 'authMode' && value === 'none' ? '此认证方式无需 API Key；保存后会清除原密钥。' : '服务地址或协议已变更；请重新填写 API Key。')
    }
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const updateModel = <K extends keyof ProviderModelConfigV2>(modelId: string, key: K, value: ProviderModelConfigV2[K]) => {
    setDraft((current) => ({ ...current, models: current.models.map((model) => model.modelId === modelId ? { ...model, [key]: value } : model) }))
  }

  const choosePreset = (presetId: string) => {
    const template = createProviderProfile(presetId)
    const next = { ...template, id: draft.id }
    setDraft(next); setModelEditorId(next.defaultModelId); setHeadersText('{}'); setBodyTexts(bodyTextsFor(next)); setApiKey(''); setCustomModelId(''); setClearStoredApiKey(true)
    setStatus(template.authMode === 'none' ? '此模板无需 API Key；保存后会清除原密钥。' : '切换厂商后需要重新填写 API Key。')
  }

  const makeNew = () => {
    const next = createProviderProfile('openai')
    setSelectedId(next.id); loadDraft(next); setStatus('新服务尚未保存。')
  }

  const setCustomStarterModel = (modelId: string) => {
    const previous = draft.models[0]?.modelId ?? ''
    setDraft((current) => ({ ...current, defaultModelId: modelId, models: [{ ...current.models[0], modelId, enabled: true }] }))
    setModelEditorId(modelId)
    setBodyTexts((current) => ({ ...current, [modelId]: current[previous] ?? '{}' }))
  }

  const addCustomModel = () => {
    const modelId = customModelId.trim()
    if (!modelId) { setStatus('请先填写要添加的模型 ID。'); return }
    if (draft.models.some((model) => model.modelId === modelId)) { setStatus('这个模型已经在当前服务中。'); return }
    const model: ProviderModelConfigV2 = { modelId, enabled: true, label: modelId, status: 'stable', capabilities: ['text', 'tools'], contextTurns: 12, capabilityMode: 'auto', extraBody: {} }
    setDraft((current) => ({ ...current, models: [...current.models, model] })); setBodyTexts((current) => ({ ...current, [modelId]: '{}' })); setModelEditorId(modelId); setCustomModelId(''); setStatus('已添加自定义模型，保存服务后生效。')
  }

  const removeCustomModel = (modelId: string) => {
    if (catalogModel(draft.presetId, modelId) || modelId === draft.defaultModelId) return
    const remaining = draft.models.filter((model) => model.modelId !== modelId)
    setDraft((current) => ({ ...current, models: remaining })); setModelEditorId(draft.defaultModelId)
  }

  const materializeDraft = (): ProviderProfile => ({
    ...draft,
    extraHeaders: parseRecord(headersText, '额外请求头') as Record<string, string>,
    models: draft.models.map((model) => ({ ...model, extraBody: parseRecord(bodyTexts[model.modelId] ?? JSON.stringify(model.extraBody), `${model.modelId} 的额外参数`) })),
  })

  const save = async () => {
    if (selectedManaged) return
    setBusy(true); setStatus('')
    try {
      const next = materializeDraft()
      await controller.save(next, apiKey === '' ? (clearStoredApiKey ? '' : undefined) : apiKey)
      setSelectedId(next.id); loadDraft(next); setStatus('模型服务已保存。')
    } catch (error) { setStatus(error instanceof Error ? error.message : '模型服务保存失败') }
    finally { setBusy(false) }
  }

  const test = async () => {
    if (!window.confirm(`连接测试会向 ${draft.defaultModelId || '所选模型'} 发送一个极小请求，可能产生少量费用。继续吗？`)) return
    setBusy(true); setStatus(`正在测试 ${draft.defaultModelId}…`)
    try {
      const next = materializeDraft()
      if (!selectedManaged) {
        await controller.save(next, apiKey === '' ? (clearStoredApiKey ? '' : undefined) : apiKey)
        setSelectedId(next.id); loadDraft(next)
      }
      const result = await controller.service.test(next, next.defaultModelId)
      setStatus(`${next.defaultModelId} 连接成功${result.text ? `：${result.text.slice(0, 80)}` : ''}`)
    } catch (error) { setStatus(error instanceof Error ? error.message : '连接测试失败') }
    finally { setBusy(false) }
  }

  const duplicate = () => {
    const next = { ...draft, id: crypto.randomUUID(), displayName: `${draft.displayName} 副本`, hasApiKey: false }
    setSelectedId(next.id); loadDraft(next); setStatus('副本尚未保存，请填写 API Key。')
  }

  const remove = async () => {
    if (!selected || !window.confirm(`删除模型服务“${selected.displayName}”？API Key 也会一并移除。`)) return
    setBusy(true); try { await controller.remove(selected.id); setSelectedId(''); makeNew() } finally { setBusy(false) }
  }

  const enabledModels = draft.models.filter((model) => model.enabled && model.modelId)

  return (
    <section className="settings-card model-settings" id="model-services">
      <div className="settings-card-heading">
        <div><p className="eyebrow">MODEL SERVICES</p><h2>模型服务</h2></div>
        <button type="button" className="secondary-button" onClick={makeNew}>新建服务</button>
      </div>
      <p>一家服务商只需配置一次密钥，随后可在助手中切换已启用的模型。</p>

      {controller.error && <p className="settings-inline-error" role="alert">{controller.error}</p>}
      {controller.snapshot.developmentProfileError && <p className="settings-inline-error" role="alert">{controller.snapshot.developmentProfileError}</p>}
      <div className="model-profile-strip" aria-label="已保存的模型服务">
        {controller.snapshot.profiles.map((profile) => (
          <button key={profile.id} type="button" className={profile.id === selectedId ? 'is-active' : ''} aria-pressed={profile.id === selectedId} onClick={() => { setSelectedId(profile.id); loadDraft(profile); setStatus('') }}>
            <span>{profile.displayName}</span><small>{profile.defaultModelId}{controller.snapshot.managedProfileIds.includes(profile.id) ? ' · 开发托管' : ''}{controller.snapshot.defaultProfileId === profile.id ? controller.snapshot.sessionDefaultProfileId === profile.id ? ' · 本次默认' : ' · 默认' : ''}</small>
          </button>
        ))}
        {!controller.loading && controller.snapshot.profiles.length === 0 && <span className="model-empty-note">还没有保存的服务</span>}
      </div>

      {selectedManaged && <p className="model-managed-note">此服务从本机开发者文件载入，仅用于未打包桌面开发版；密钥只保留在主进程内存中，发布包不会包含该文件或配置。此服务只开放文件指定的模型。</p>}
      <fieldset className="model-managed-fields" disabled={selectedManaged}>
        <div className="model-form-grid model-basic-grid">
          <label><span>服务商</span><select name="provider-preset" autoComplete="off" value={draft.presetId} onChange={(event) => choosePreset(event.target.value)}>{!knownPreset && <option value={draft.presetId}>{preset.label}</option>}{PROVIDER_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label><span>配置名称</span><input name="provider-name" autoComplete="off" value={draft.displayName} maxLength={80} onChange={(event) => update('displayName', event.target.value)} /></label>
          {draft.presetId === 'custom' && draft.models.length === 1 && !draft.models[0].modelId
            ? <label><span>默认模型</span><input name="provider-default-model" autoComplete="off" value={draft.models[0].modelId} placeholder="填写模型 ID…" onChange={(event) => setCustomStarterModel(event.target.value)} spellCheck={false} /></label>
            : <label><span>默认模型</span><select name="provider-default-model" autoComplete="off" value={draft.defaultModelId} onChange={(event) => { update('defaultModelId', event.target.value); updateModel(event.target.value, 'enabled', true); setModelEditorId(event.target.value) }}>{enabledModels.map((model) => <option key={model.modelId} value={model.modelId}>{model.label || model.modelId}</option>)}</select></label>}
          <label><span>API Key</span><input name="provider-api-key" type="password" value={apiKey} placeholder={draft.authMode === 'none' ? '此服务无需密钥…' : clearStoredApiKey ? '原密钥将清除；请填写新密钥…' : draft.hasApiKey ? '已安全保存；留空保持不变…' : '仅在保存时提交…'} onChange={(event) => setApiKey(event.target.value)} autoComplete="new-password" spellCheck={false} /></label>
          {draft.presetId === 'custom' && <label className="model-form-wide"><span>API Base URL</span><input name="provider-url" autoComplete="url" type="url" value={draft.baseUrl} onChange={(event) => update('baseUrl', event.target.value)} spellCheck={false} /></label>}
        </div>

        <details className="model-manager" open>
          <summary>管理模型 <small>{enabledModels.length} 个已显示</small></summary>
          <div className="model-manager-body">
            <div className="model-list" aria-label="模型显示设置">
              {draft.models.filter((model) => model.modelId).map((model) => {
                const badges = modelBadge(model)
                const isCustom = !catalogModel(draft.presetId, model.modelId)
                return <div className={`model-list-row${model.modelId === modelEditorId ? ' is-editing' : ''}`} key={model.modelId}>
                  <label className="model-visibility"><input type="checkbox" checked={model.enabled} disabled={model.modelId === draft.defaultModelId} onChange={(event) => updateModel(model.modelId, 'enabled', event.target.checked)} /><span>在助手中显示</span></label>
                  <button type="button" className="model-identity" onClick={() => setModelEditorId(model.modelId)} aria-pressed={model.modelId === modelEditorId}>
                    <strong>{model.label || model.modelId}</strong><code translate="no">{model.modelId}</code>
                  </button>
                  <span className="model-badges">{model.modelId === draft.defaultModelId && <em>默认</em>}{badges.map((badge) => <em key={badge}>{badge}</em>)}</span>
                  {isCustom && model.modelId !== draft.defaultModelId && <button type="button" className="model-remove" aria-label={`移除模型 ${model.modelId}`} onClick={() => removeCustomModel(model.modelId)}>移除</button>}
                </div>
              })}
            </div>
            <div className="model-add-row">
              <label><span>添加自定义模型 ID</span><input name="provider-custom-model" autoComplete="off" value={customModelId} placeholder={preset.modelPlaceholder} onChange={(event) => setCustomModelId(event.target.value)} spellCheck={false} /></label>
              <button type="button" className="secondary-button" onClick={addCustomModel}>添加模型</button>
            </div>
            {editedModel && <details className="model-parameters">
              <summary>{editedModel.label || editedModel.modelId} 的参数</summary>
              <div className="model-form-grid">
                <label><span>温度（可留空）</span><input name="provider-temperature" autoComplete="off" inputMode="decimal" type="number" min="0" max="2" step="0.1" value={editedModel.temperature ?? ''} onChange={(event) => updateModel(editedModel.modelId, 'temperature', event.target.value === '' ? undefined : Number(event.target.value))} /></label>
                <label><span>Top P（可留空）</span><input name="provider-top-p" autoComplete="off" inputMode="decimal" type="number" min="0" max="1" step="0.05" value={editedModel.topP ?? ''} onChange={(event) => updateModel(editedModel.modelId, 'topP', event.target.value === '' ? undefined : Number(event.target.value))} /></label>
                <label><span>输出上限（token）</span><input name="provider-max-tokens" autoComplete="off" inputMode="numeric" type="number" min="1" max="128000" value={editedModel.maxOutputTokens ?? ''} onChange={(event) => updateModel(editedModel.modelId, 'maxOutputTokens', event.target.value === '' ? undefined : Number(event.target.value))} /></label>
                <label><span>携带上下文（轮）</span><input name="provider-context-turns" autoComplete="off" inputMode="numeric" type="number" min="1" max="30" value={editedModel.contextTurns} onChange={(event) => updateModel(editedModel.modelId, 'contextTurns', Number(event.target.value))} /></label>
                <label><span>工具能力</span><select name="provider-capability" autoComplete="off" value={editedModel.capabilityMode} onChange={(event) => updateModel(editedModel.modelId, 'capabilityMode', event.target.value as ProviderModelConfigV2['capabilityMode'])}><option value="auto">自动：预检索＋工具</option><option value="tools">要求工具调用</option><option value="retrieval-only">仅预检索证据</option></select></label>
                <label className="model-form-wide"><span>额外请求参数 JSON</span><textarea name="provider-extra-body" autoComplete="off" value={bodyTexts[editedModel.modelId] ?? '{}'} rows={5} spellCheck={false} onChange={(event) => setBodyTexts((current) => ({ ...current, [editedModel.modelId]: event.target.value }))} /></label>
              </div>
              {editedModel.capabilities?.includes('vision') && <p className="model-capability-note">此型号支持视觉输入；PalTools 当前仅发送文字和本地资料。</p>}
            </details>}
          </div>
        </details>

        <details className="model-advanced">
          <summary>高级连接设置</summary>
          <div className="model-form-grid">
            {draft.presetId !== 'custom' && <label className="model-form-wide"><span>API Base URL</span><input name="provider-url" autoComplete="url" type="url" value={draft.baseUrl} onChange={(event) => update('baseUrl', event.target.value)} spellCheck={false} /></label>}
            <label><span>协议</span><select name="provider-transport" autoComplete="off" value={draft.transport} onChange={(event) => update('transport', event.target.value as ProviderTransport)}><option value="openai-responses">OpenAI Responses</option><option value="openai-chat">OpenAI Chat Completions</option><option value="anthropic-messages">Anthropic Messages</option><option value="gemini-generate-content">Gemini generateContent</option></select></label>
            <label><span>认证方式</span><select name="provider-auth" autoComplete="off" value={draft.authMode} onChange={(event) => update('authMode', event.target.value as ProviderAuthMode)}><option value="bearer">Bearer</option><option value="x-api-key">x-api-key</option><option value="api-key">api-key</option><option value="none">无认证</option></select></label>
            <label><span>超时（秒）</span><input name="provider-timeout" autoComplete="off" inputMode="numeric" type="number" min="5" max="180" value={draft.timeoutMs / 1000} onChange={(event) => update('timeoutMs', Number(event.target.value) * 1000)} /></label>
            <label className="model-form-wide"><span>额外请求头 JSON</span><textarea name="provider-extra-headers" autoComplete="off" value={headersText} rows={4} spellCheck={false} onChange={(event) => setHeadersText(event.target.value)} /></label>
          </div>
        </details>
      </fieldset>

      <div className="model-template-note"><span>{preset.note}</span>{preset.docsUrl && <a href={preset.docsUrl} target="_blank" rel="noreferrer">查看官方 API 文档</a>}</div>
      {controller.snapshot.platform === 'web' && <p className="model-platform-note">Web 兼容模式：密钥刷新即清除，部分服务可能阻止浏览器跨域请求。</p>}
      {controller.snapshot.platform === 'electron' && !controller.snapshot.encryptionAvailable && <p className="settings-inline-error">当前系统加密不可用，密钥只会保留到本次启动结束。</p>}
      <div className="model-form-actions">
        <button type="button" className="primary-button" disabled={busy || selectedManaged} onClick={() => void save()}>保存配置</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void test()}>测试连接</button>
        <button type="button" className="secondary-button" disabled={busy || !selected} onClick={duplicate}>复制</button>
        <button type="button" className="secondary-button" disabled={busy || !selected || controller.snapshot.defaultProfileId === selected.id} onClick={() => selected && void controller.setDefault(selected.id)}>设为默认</button>
        <button type="button" className="danger-button" disabled={busy || !selected || selectedManaged} onClick={() => void remove()}>删除</button>
      </div>
      <p className="model-status" role="status" aria-live="polite">{status}</p>
    </section>
  )
}
