// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProviderProfile } from '../../domain/agent'
import type { PalRecord } from '../../domain/types'
import type { ProviderProfilesController } from '../../hooks/useProviderProfiles'
import { ProviderService } from '../../lib/provider-service'
import { AssistantPage } from './AssistantPage'

const pal: PalRecord = {
  internalId: 'SheepBall', paldbId: 'Lamball', paldexNo: '001', name: { zhHans: '棉悠悠', en: 'Lamball' }, elements: ['neutral'], rarity: 1,
  workSuitabilities: { 手工作业: 1 }, partnerSkill: { name: '茸茸盾牌', description: '化身为盾牌。' },
  stats: { hp: 70, attack: 70, defense: 70, workSpeed: 100, walkSpeed: 40, runSpeed: 400, swimSpeed: 120, rideSprintSpeed: 550, transportSpeed: 160, stamina: 100, foodAmount: 3 }, statSources: {},
  activeSkills: [], passiveSkills: [], drops: [], image: { localPath: '/generated/pals/Lamball.webp', sourceUrl: 'https://example.com/image', sha256: 'a'.repeat(64) }, sourceUrl: 'https://example.com/pal',
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
  localStorage.clear()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('AssistantPage', () => {
  it('runs a local-evidence-first question and saves the answer', async () => {
    const profile = { ...createProviderProfile('openai'), model: 'test-model', capabilityMode: 'retrieval-only' as const, hasApiKey: true }
    const service = new ProviderService()
    vi.spyOn(service, 'complete').mockResolvedValue({ text: '棉悠悠具有手工作业 Lv.1。', toolCalls: [] })
    const controller = {
      service,
      snapshot: { profiles: [profile], defaultProfileId: profile.id, encryptionAvailable: false, platform: 'web' as const },
      loading: false, error: '', save: vi.fn(), remove: vi.fn(), setDefault: vi.fn(), refresh: vi.fn(),
    } as unknown as ProviderProfilesController
    const user = userEvent.setup()
    render(<AssistantPage pals={[pal]} skills={[]} items={[]} breedingIndex={null} datasetVersion="test-v1" providerController={controller} onNavigateConversation={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '棉悠悠适合做什么？' }))
    await user.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByText('棉悠悠具有手工作业 Lv.1。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /依据 1 条本地记录/ })).toBeInTheDocument()
    await waitFor(() => expect(service.complete).toHaveBeenCalled())
  })
})
