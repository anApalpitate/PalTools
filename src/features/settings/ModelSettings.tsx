import { useEffect, useMemo, useState } from 'react'
import { createProviderProfile, PROVIDER_PRESETS, type JsonValue, type ProviderPreset, type ProviderProfileV1, type ProviderTransport, type ProviderAuthMode } from '../../domain/agent'
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

export function ModelSettings({ controller }: ModelSettingsProps) {
  const [selectedId, setSelectedId] = useState('')
  const selected = controller.snapshot.profiles.find((profile) => profile.id === selectedId)
  const [draft, setDraft] = useState<ProviderProfileV1>(() => createProviderProfile('openai'))
  const [apiKey, setApiKey] = useState('')
  const [headersText, setHeadersText] = useState('{}')
  const [bodyText, setBodyText] = useState('{}')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [clearStoredApiKey, setClearStoredApiKey] = useState(false)
  const knownPreset = useMemo(() => PROVIDER_PRESETS.find((item) => item.id === draft.presetId), [draft.presetId])
  const preset = useMemo<ProviderPreset>(() => knownPreset ?? {
    id: draft.presetId,
    label: `旧模板配置（${draft.presetId}）`,
    transport: draft.transport,
    baseUrl: draft.baseUrl,
    authMode: draft.authMode,
    modelPlaceholder: '保留原模型 ID',
    docsUrl: '',
    note: '这是已保存的旧模板配置。当前字段会保持不变，只有主动选择其他模板才会替换。',
  }, [draft.authMode, draft.baseUrl, draft.presetId, draft.transport, knownPreset])

  useEffect(() => {
    const next = selectedId ? selected : controller.snapshot.profiles[0]
    if (!next) return
    if (!selectedId) setSelectedId(next.id)
    setDraft(next); setHeadersText(JSON.stringify(next.extraHeaders, null, 2)); setBodyText(JSON.stringify(next.extraBody, null, 2)); setApiKey(''); setClearStoredApiKey(false)
  }, [controller.snapshot.profiles, selected, selectedId])

  const update = <K extends keyof ProviderProfileV1>(key: K, value: ProviderProfileV1[K]) => {
    const crossesCredentialBoundary = key === 'baseUrl' || key === 'transport' || key === 'authMode'
    if (crossesCredentialBoundary && draft[key] !== value) {
      setApiKey('')
      setClearStoredApiKey(true)
      setStatus(key === 'authMode' && value === 'none'
        ? '此认证方式无需 API Key；保存后会清除原密钥。'
        : '服务地址或协议已变更；请重新填写 API Key。')
    }
    setDraft((current) => ({ ...current, [key]: value }))
  }
  const choosePreset = (presetId: string) => {
    const template = createProviderProfile(presetId)
    setDraft((current) => ({ ...template, id: current.id, displayName: template.displayName })); setHeadersText('{}'); setBodyText('{}'); setApiKey(''); setClearStoredApiKey(true); setStatus(template.authMode === 'none' ? '此模板无需 API Key；保存后会清除原密钥。' : '切换厂商后需要重新填写 API Key。')
  }
  const makeNew = () => { const next = createProviderProfile('openai'); setSelectedId(next.id); setDraft(next); setHeadersText('{}'); setBodyText('{}'); setApiKey(''); setClearStoredApiKey(false); setStatus('新配置尚未保存。') }
  const materializeDraft = (): ProviderProfileV1 => ({ ...draft, extraHeaders: parseRecord(headersText, '额外请求头') as Record<string, string>, extraBody: parseRecord(bodyText, '额外参数') })
  const save = async () => {
    setBusy(true); setStatus('')
    try {
      const next = materializeDraft()
      await controller.save(next, apiKey === '' ? (clearStoredApiKey ? '' : undefined) : apiKey)
      setSelectedId(next.id); setDraft(next); setApiKey(''); setClearStoredApiKey(false); setStatus('模型配置已保存。')
    } catch (error) { setStatus(error instanceof Error ? error.message : '模型配置保存失败') }
    finally { setBusy(false) }
  }
  const test = async () => {
    if (!window.confirm('连接测试会向所选服务发送一个极小请求，可能产生少量费用。继续吗？')) return
    setBusy(true); setStatus('正在发送少量 token 进行连接测试…')
    try {
      const next = materializeDraft()
      await controller.save(next, apiKey === '' ? (clearStoredApiKey ? '' : undefined) : apiKey)
      setSelectedId(next.id); setDraft(next); setApiKey(''); setClearStoredApiKey(false)
      const result = await controller.service.test(next)
      setStatus(`连接成功${result.text ? `：${result.text.slice(0, 80)}` : ''}`)
    }
    catch (error) { setStatus(error instanceof Error ? error.message : '连接测试失败') }
    finally { setBusy(false) }
  }
  const duplicate = () => { const next = { ...draft, id: crypto.randomUUID(), displayName: `${draft.displayName} 副本`, hasApiKey: false }; setSelectedId(next.id); setDraft(next); setApiKey(''); setClearStoredApiKey(false); setStatus('副本尚未保存，请填写 API Key。') }
  const remove = async () => {
    if (!selected || !window.confirm(`删除模型配置“${selected.displayName}”？API Key 也会一并移除。`)) return
    setBusy(true); try { await controller.remove(selected.id); setSelectedId(''); makeNew() } finally { setBusy(false) }
  }

  return (
    <section className="settings-card model-settings" id="model-services">
      <div className="settings-card-heading">
        <div><p className="eyebrow">MODEL SERVICES</p><h2>模型服务</h2></div>
        <button type="button" className="secondary-button" onClick={makeNew}>新建配置</button>
      </div>
      <p>密钥由你提供。桌面版使用系统加密存储；Web 版只在当前页面内存中保留。</p>

      {controller.error && <p className="settings-inline-error" role="alert">{controller.error}</p>}
      <div className="model-profile-strip" aria-label="已保存的模型配置">
        {controller.snapshot.profiles.map((profile) => (
          <button key={profile.id} type="button" className={profile.id === selectedId ? 'is-active' : ''} aria-pressed={profile.id === selectedId} onClick={() => { setSelectedId(profile.id); setDraft(profile); setHeadersText(JSON.stringify(profile.extraHeaders, null, 2)); setBodyText(JSON.stringify(profile.extraBody, null, 2)); setApiKey(''); setClearStoredApiKey(false); setStatus('') }}>
            <span>{profile.displayName}</span><small>{profile.model || '未填写模型'}{controller.snapshot.defaultProfileId === profile.id ? ' · 默认' : ''}</small>
          </button>
        ))}
        {!controller.loading && controller.snapshot.profiles.length === 0 && <span className="model-empty-note">还没有保存的配置</span>}
      </div>

      <div className="model-form-grid">
        <label><span>厂商模板</span><select name="provider-preset" autoComplete="off" value={draft.presetId} onChange={(event) => choosePreset(event.target.value)}>{!knownPreset && <option value={draft.presetId}>{preset.label}</option>}{PROVIDER_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label><span>配置名称</span><input name="provider-name" autoComplete="off" value={draft.displayName} maxLength={80} onChange={(event) => update('displayName', event.target.value)} /></label>
        <label className="model-form-wide"><span>API Base URL</span><input name="provider-url" autoComplete="url" type="url" value={draft.baseUrl} onChange={(event) => update('baseUrl', event.target.value)} spellCheck={false} /></label>
        <label><span>模型 ID / 部署名称</span><input name="provider-model" autoComplete="off" value={draft.model} placeholder={`${preset.modelPlaceholder}…`} onChange={(event) => update('model', event.target.value)} spellCheck={false} /></label>
        <label><span>API Key</span><input name="provider-api-key" type="password" value={apiKey} placeholder={draft.authMode === 'none' ? '此模板无需密钥…' : clearStoredApiKey ? '原密钥将清除；请填写新密钥…' : draft.hasApiKey ? '已安全保存；留空保持不变…' : '仅在保存时提交…'} onChange={(event) => setApiKey(event.target.value)} autoComplete="new-password" /></label>
        <label><span>温度（可留空）</span><input name="provider-temperature" autoComplete="off" inputMode="decimal" type="number" min="0" max="2" step="0.1" value={draft.temperature ?? ''} onChange={(event) => update('temperature', event.target.value === '' ? undefined : Number(event.target.value))} /></label>
        <label><span>输出上限（token）</span><input name="provider-max-tokens" autoComplete="off" inputMode="numeric" type="number" min="1" max="128000" value={draft.maxOutputTokens ?? ''} onChange={(event) => update('maxOutputTokens', event.target.value === '' ? undefined : Number(event.target.value))} /></label>
        <label><span>超时（秒）</span><input name="provider-timeout" autoComplete="off" inputMode="numeric" type="number" min="5" max="180" value={draft.timeoutMs / 1000} onChange={(event) => update('timeoutMs', Number(event.target.value) * 1000)} /></label>
        <label><span>携带上下文（轮）</span><input name="provider-context-turns" autoComplete="off" inputMode="numeric" type="number" min="1" max="30" value={draft.contextTurns} onChange={(event) => update('contextTurns', Number(event.target.value))} /></label>
      </div>

      <details className="model-advanced">
        <summary>高级协议与参数</summary>
        <div className="model-form-grid">
          <label><span>协议</span><select name="provider-transport" autoComplete="off" value={draft.transport} onChange={(event) => update('transport', event.target.value as ProviderTransport)}><option value="openai-responses">OpenAI Responses</option><option value="openai-chat">OpenAI Chat Completions</option><option value="anthropic-messages">Anthropic Messages</option><option value="gemini-generate-content">Gemini generateContent</option></select></label>
          <label><span>认证方式</span><select name="provider-auth" autoComplete="off" value={draft.authMode} onChange={(event) => update('authMode', event.target.value as ProviderAuthMode)}><option value="bearer">Bearer</option><option value="x-api-key">x-api-key</option><option value="api-key">api-key</option><option value="none">无认证</option></select></label>
          <label><span>工具能力</span><select name="provider-capability" autoComplete="off" value={draft.capabilityMode} onChange={(event) => update('capabilityMode', event.target.value as ProviderProfileV1['capabilityMode'])}><option value="auto">自动：预检索＋工具</option><option value="tools">要求工具调用</option><option value="retrieval-only">仅预检索证据</option></select></label>
          <label><span>Top P（可留空）</span><input name="provider-top-p" autoComplete="off" inputMode="decimal" type="number" min="0" max="1" step="0.05" value={draft.topP ?? ''} onChange={(event) => update('topP', event.target.value === '' ? undefined : Number(event.target.value))} /></label>
          <label className="model-form-wide"><span>额外请求头 JSON</span><textarea name="provider-extra-headers" autoComplete="off" value={headersText} rows={4} spellCheck={false} onChange={(event) => setHeadersText(event.target.value)} /></label>
          <label className="model-form-wide"><span>额外请求参数 JSON</span><textarea name="provider-extra-body" autoComplete="off" value={bodyText} rows={5} spellCheck={false} onChange={(event) => setBodyText(event.target.value)} /></label>
        </div>
      </details>

      <div className="model-template-note"><span>{preset.note}</span>{preset.docsUrl && <a href={preset.docsUrl} target="_blank" rel="noreferrer">查看官方 API 文档</a>}</div>
      {controller.snapshot.platform === 'web' && <p className="model-platform-note">Web 兼容模式：密钥刷新即清除，部分服务可能阻止浏览器跨域请求。</p>}
      {controller.snapshot.platform === 'electron' && !controller.snapshot.encryptionAvailable && <p className="settings-inline-error">当前系统加密不可用，密钥只会保留到本次启动结束。</p>}
      <div className="model-form-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={() => void save()}>保存配置</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void test()}>测试连接</button>
        <button type="button" className="secondary-button" disabled={busy || !selected} onClick={duplicate}>复制</button>
        <button type="button" className="secondary-button" disabled={busy || !selected || controller.snapshot.defaultProfileId === selected.id} onClick={() => selected && void controller.setDefault(selected.id)}>设为默认</button>
        <button type="button" className="danger-button" disabled={busy || !selected} onClick={() => void remove()}>删除</button>
      </div>
      <p className="model-status" role="status" aria-live="polite">{status}</p>
    </section>
  )
}
