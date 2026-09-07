// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProviderProfile, providerProfileSchema, type ProviderProfile, type ProviderProfileV1 } from '../../domain/agent'
import type { ProviderProfilesController } from '../../hooks/useProviderProfiles'
import { ModelSettings } from './ModelSettings'

afterEach(cleanup)

const legacyProfile: ProviderProfileV1 = {
  schemaVersion: 1,
  id: 'legacy-azure',
  presetId: 'azure-openai',
  displayName: 'Azure 企业配置',
  transport: 'openai-responses',
  baseUrl: 'https://example.openai.azure.com/openai/v1',
  model: 'paltools-deployment',
  authMode: 'api-key',
  timeoutMs: 45000,
  contextTurns: 8,
  capabilityMode: 'tools',
  extraHeaders: { 'x-client': 'paltools' },
  extraBody: { seed: 7 },
  hasApiKey: true,
}

function createController(profile: ProviderProfileV1 | ProviderProfile) {
  const normalizedProfile = providerProfileSchema.parse(profile)
  const save = vi.fn().mockResolvedValue(undefined)
  const controller = {
    service: { test: vi.fn() },
    snapshot: {
      profiles: [normalizedProfile],
      defaultProfileId: normalizedProfile.id,
      encryptionAvailable: true,
      managedProfileIds: [],
      platform: 'electron',
    },
    loading: false,
    error: '',
    save,
    remove: vi.fn(),
    setDefault: vi.fn(),
    refresh: vi.fn(),
  } as unknown as ProviderProfilesController
  return { controller, save }
}

describe('ModelSettings', () => {
  it('keeps a saved removed template selected and unchanged until another template is chosen', async () => {
    const { controller, save } = createController(legacyProfile)
    render(<ModelSettings controller={controller} />)

    const presetSelect = await screen.findByRole('combobox', { name: '服务商' })
    expect(presetSelect).toHaveValue('azure-openai')
    expect(within(presetSelect).getAllByRole('option')).toHaveLength(11)
    expect(within(presetSelect).getByRole('option', { name: '旧模板配置（azure-openai）' })).toBeInTheDocument()
    expect(screen.getByDisplayValue(legacyProfile.baseUrl)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '默认模型' })).toHaveValue(legacyProfile.model)

    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))

    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
      presetId: 'azure-openai',
      transport: legacyProfile.transport,
      baseUrl: legacyProfile.baseUrl,
      defaultModelId: legacyProfile.model,
      authMode: legacyProfile.authMode,
      extraHeaders: legacyProfile.extraHeaders,
      models: expect.arrayContaining([expect.objectContaining({ modelId: legacyProfile.model, extraBody: legacyProfile.extraBody })]),
    }), undefined))
  })

  it('replaces a legacy template only after the user actively selects a current preset and clears the old key', async () => {
    const { controller, save } = createController(legacyProfile)
    render(<ModelSettings controller={controller} />)

    const presetSelect = await screen.findByRole('combobox', { name: '服务商' })
    fireEvent.change(presetSelect, { target: { value: 'custom' } })

    expect(presetSelect).toHaveValue('custom')
    expect(screen.getByLabelText('配置名称')).toHaveValue('自定义兼容接口')
    expect(screen.getByDisplayValue('https://')).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '旧模板配置（azure-openai）' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('需要重新填写 API Key')

    fireEvent.change(screen.getByLabelText('默认模型'), { target: { value: 'custom-chat-model' } })
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ presetId: 'custom' }), ''))
    expect(save.mock.calls[0]?.[0]).not.toHaveProperty('hasApiKey')
  })

  it('explains that Ollama needs no key while still clearing the previous provider key', async () => {
    const { controller, save } = createController(legacyProfile)
    render(<ModelSettings controller={controller} />)

    fireEvent.change(await screen.findByRole('combobox', { name: '服务商' }), { target: { value: 'ollama' } })

    expect(screen.getByRole('status')).toHaveTextContent('无需 API Key')
    expect(screen.getByLabelText('API Key')).toHaveAttribute('placeholder', expect.stringContaining('无需密钥'))
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ presetId: 'ollama', authMode: 'none' }), ''))
  })

  it('never reuses a stored key after the endpoint is edited directly', async () => {
    const { controller, save } = createController(legacyProfile)
    render(<ModelSettings controller={controller} />)

    fireEvent.change(await screen.findByLabelText('API Base URL'), { target: { value: 'https://another-provider.example/v1' } })

    expect(screen.getByRole('status')).toHaveTextContent('请重新填写 API Key')
    expect(screen.getByLabelText('API Key')).toHaveAttribute('placeholder', expect.stringContaining('原密钥将清除'))
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: 'https://another-provider.example/v1' }), ''))
  })

  it('keeps a development-managed profile read-only while allowing a direct connection test', async () => {
    const managedProfile = { ...legacyProfile, id: 'paltools-managed-development-deepseek', presetId: 'deepseek', displayName: '开发者 DeepSeek（仅开发版）' }
    const { controller, save } = createController(managedProfile)
    controller.snapshot.managedProfileIds = [managedProfile.id]
    controller.snapshot.sessionDefaultProfileId = managedProfile.id
    controller.service.test = vi.fn().mockResolvedValue({ text: 'OK', toolCalls: [] })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<ModelSettings controller={controller} />)

    expect(await screen.findByText(/开发托管.*本次默认/)).toBeInTheDocument()
    expect(screen.getByText(/发布包不会包含.*只开放文件指定的模型/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存配置' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '删除' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: '默认模型' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '测试连接' }))

    await waitFor(() => expect(controller.service.test).toHaveBeenCalledWith(
      expect.objectContaining({ id: managedProfile.id }),
      managedProfile.model,
    ))
    expect(save).not.toHaveBeenCalled()
  })

  it('shows a sanitized development-provider warning without hiding saved profiles', async () => {
    const { controller } = createController(legacyProfile)
    controller.snapshot.developmentProfileError = '开发者 API 配置文件必须使用 UTF-8 编码'

    render(<ModelSettings controller={controller} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('开发者 API 配置文件必须使用 UTF-8 编码')
    expect(screen.getByRole('button', { name: /Azure 企业配置/ })).toBeInTheDocument()
  })

  it('manages visibility, custom ids and parameters independently for each model', async () => {
    const profile = createProviderProfile('deepseek')
    const { controller, save } = createController(profile)
    render(<ModelSettings controller={controller} />)

    const visibility = await screen.findAllByLabelText('在助手中显示')
    expect(visibility).toHaveLength(3)
    expect(visibility[0]).toBeChecked()
    expect(visibility[0]).toBeDisabled()
    expect(visibility[2]).not.toBeChecked()
    fireEvent.click(visibility[2])

    fireEvent.click(screen.getByRole('button', { name: /DeepSeek V4 Flash Vision/ }))
    expect(screen.getByText(/当前仅发送文字和本地资料/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('添加自定义模型 ID'), { target: { value: 'deepseek-private' } })
    fireEvent.click(screen.getByRole('button', { name: '添加模型' }))
    fireEvent.change(screen.getByLabelText('温度（可留空）'), { target: { value: '0.6' } })
    fireEvent.change(screen.getByLabelText('额外请求参数 JSON'), { target: { value: '{"seed":9}' } })
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))

    await waitFor(() => expect(save).toHaveBeenCalled())
    const saved = save.mock.calls[0]?.[0] as ProviderProfile
    expect(saved.models.find((model) => model.modelId === 'deepseek-v4-flash-vision-exp')?.enabled).toBe(true)
    expect(saved.models.find((model) => model.modelId === 'deepseek-private')).toMatchObject({
      enabled: true,
      temperature: 0.6,
      extraBody: { seed: 9 },
    })
    expect(saved.models.find((model) => model.modelId === profile.defaultModelId)?.temperature).toBeUndefined()
  })
})
