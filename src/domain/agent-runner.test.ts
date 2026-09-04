import { describe, expect, it, vi } from 'vitest'
import type { PalRecord } from './types'
import { createProviderProfile } from './agent'
import { runPalAgent } from './agent-runner'
import { LocalKnowledgeService } from './knowledge'

const pal: PalRecord = { internalId: 'SheepBall', paldbId: 'Lamball', paldexNo: '001', name: { zhHans: '棉悠悠', en: 'Lamball' }, elements: ['neutral'], rarity: 1, workSuitabilities: { 手工作业: 1 }, partnerSkill: null, stats: { hp: 70, attack: 70, defense: 70, workSpeed: 100, walkSpeed: 40, runSpeed: 400, swimSpeed: 120, rideSprintSpeed: 550, transportSpeed: 160, stamina: 100, foodAmount: 3 }, statSources: {}, activeSkills: [], passiveSkills: [], drops: [], image: { localPath: '/pal.webp', sourceUrl: 'https://example.com', sha256: 'a'.repeat(64) }, sourceUrl: 'https://example.com' }

describe('Pal agent runner', () => {
  it('sends local evidence and completes a validated tool loop', async () => {
    const knowledge = new LocalKnowledgeService({ pals: [pal], skills: [], items: [], breedingIndex: null, datasetVersion: 'v1' })
    const complete = vi.fn()
      .mockResolvedValueOnce({ text: '', toolCalls: [{ id: 'call-1', name: 'get_pal_profile', arguments: { pal: '棉悠悠' } }] })
      .mockResolvedValueOnce({ text: '棉悠悠有手工作业 Lv.1。', toolCalls: [] })
    const result = await runPalAgent({ question: '棉悠悠适合做什么？', history: [], profile: { ...createProviderProfile('openai'), model: 'm' }, knowledge, complete })
    expect(result.text).toContain('手工作业')
    expect(result.traces.some((trace) => trace.tool === 'get_pal_profile')).toBe(true)
    expect(result.evidence.some((item) => item.id === 'pal:SheepBall')).toBe(true)
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('does not call a model when local knowledge has no evidence', async () => {
    const knowledge = new LocalKnowledgeService({ pals: [pal], skills: [], items: [], breedingIndex: null, datasetVersion: 'v1' })
    const complete = vi.fn()
    const result = await runPalAgent({ question: '完全不存在的资料', history: [], profile: { ...createProviderProfile('openai'), model: 'm' }, knowledge, complete })
    expect(result.text).toContain('没有足够依据')
    expect(complete).not.toHaveBeenCalled()
  })
})
