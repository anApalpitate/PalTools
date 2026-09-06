// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProviderProfileV1 } from '../../domain/agent'
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

function createController(profile: ProviderProfileV1) {
  const save = vi.fn().mockResolvedValue(undefined)
  const controller = {
    service: { test: vi.fn() },
    snapshot: {
      profiles: [profile],
      defaultProfileId: profile.id,
      encryptionAvailable: true,
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

    const presetSelect = await screen.findByRole('combobox', { name: '厂商模板' })
    expect(presetSelect).toHaveValue('azure-openai')
    expect(within(presetSelect).getAllByRole('option')).toHaveLength(10)
    expect(within(presetSelect).getByRole('option', { name: '旧模板配置（azure-openai）' })).toBeInTheDocument()
    expect(screen.getByDisplayValue(legacyProfile.baseUrl)).toBeInTheDocument()
    expect(screen.getByDisplayValue(legacyProfile.model)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))

    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
      presetId: 'azure-openai',
      transport: legacyProfile.transport,
      baseUrl: legacyProfile.baseUrl,
      model: legacyProfile.model,
      authMode: legacyProfile.authMode,
      extraHeaders: legacyProfile.extraHeaders,
      extraBody: legacyProfile.extraBody,
    }), undefined))
  })

  it('replaces a legacy template only after the user actively selects a current preset and clears the old key', async () => {
    const { controller, save } = createController(legacyProfile)
    render(<ModelSettings controller={controller} />)

    const presetSelect = await screen.findByRole('combobox', { name: '厂商模板' })
    fireEvent.change(presetSelect, { target: { value: 'custom' } })

    expect(presetSelect).toHaveValue('custom')
    expect(screen.getByLabelText('配置名称')).toHaveValue('自定义兼容接口')
    expect(screen.getByDisplayValue('https://')).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '旧模板配置（azure-openai）' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('需要重新填写 API Key')

    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ presetId: 'custom' }), ''))
    expect(save.mock.calls[0]?.[0]).not.toHaveProperty('hasApiKey')
  })

  it('explains that Ollama needs no key while still clearing the previous provider key', async () => {
    const { controller, save } = createController(legacyProfile)
    render(<ModelSettings controller={controller} />)

    fireEvent.change(await screen.findByRole('combobox', { name: '厂商模板' }), { target: { value: 'ollama' } })

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
})
