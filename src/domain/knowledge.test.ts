import { describe, expect, it } from 'vitest'
import type { ActiveSkillRecord, BreedingIndexPayload, ItemRecord, PalRecord } from './types'
import { LocalKnowledgeService } from './knowledge'

const baseStats = { hp: 70, attack: 70, defense: 70, workSpeed: 100, walkSpeed: 40, runSpeed: 400, swimSpeed: 120, rideSprintSpeed: 550, transportSpeed: 160, stamina: 100, foodAmount: 3 }
function pal(id: string, no: string, zh: string, en: string): PalRecord { return { internalId: id, paldbId: en, paldexNo: no, name: { zhHans: zh, en }, elements: ['neutral'], rarity: 1, workSuitabilities: { 手工作业: 1 }, partnerSkill: null, stats: baseStats, statSources: {}, activeSkills: [], passiveSkills: [], drops: [], image: { localPath: `/generated/${id}.webp`, sourceUrl: 'https://example.com/image', sha256: 'a'.repeat(64) }, sourceUrl: 'https://example.com/pal' } }
const lamball = { ...pal('SheepBall', '001', '棉悠悠', 'Lamball'), activeSkills: [{ skillId: 'Roly', unlockLevel: 1 }], passiveSkills: [{ name: '温顺', description: '更容易相处。', rank: 1 }], drops: [{ itemId: 'Wool', quantityMin: 1, quantityMax: 2, probabilityPercent: 100, requiredLevel: null }] }
const cattiva = pal('PinkCat', '002', '捣蛋猫', 'Cattiva')
const depresso = pal('NegativeKoala', '003', '寐魔', 'Depresso')
const skills: ActiveSkillRecord[] = [{ id: 'Roly', name: '滚滚毛球', element: 'neutral', attackType: 'melee', power: 40, cooldownSeconds: 2, attackRange: '0-1000', effects: [], description: '滚动追击敌人。', sourceUrl: 'https://example.com/skill' }]
const items: ItemRecord[] = [{ id: 'Wool', name: '羊毛', icon: { localPath: '/generated/wool.webp', sourceUrl: 'https://example.com/wool', sha256: 'b'.repeat(64) } }]
const breedingIndex: BreedingIndexPayload = { schemaVersion: 4, palIds: ['SheepBall', 'PinkCat', 'NegativeKoala'], recipes: [[0, 1, 2]], recipesByPair: { '0|1': [0] }, parentsByChild: { '2': [0] } }
function service() { return new LocalKnowledgeService({ pals: [lamball, cattiva, depresso], skills, items, breedingIndex, datasetVersion: 'test-v1' }) }

describe('local knowledge service', () => {
  it('searches identity, pinyin, skills, passives and items with source metadata', () => {
    expect(service().search('mianyouyou')[0]).toMatchObject({ id: 'pal:SheepBall', title: '棉悠悠', route: '#/paldex/SheepBall' })
    expect(service().search('Lamball')[0].id).toBe('pal:SheepBall')
    expect(service().search('001')[0].id).toBe('pal:SheepBall')
    expect(service().search('滚滚毛球').some((item) => item.id === 'skill:Roly')).toBe(true)
    expect(service().search('温顺').some((item) => item.kind === 'passive')).toBe(true)
    expect(service().search('羊毛').some((item) => item.id === 'item:Wool')).toBe(true)
  })

  it('executes all structured profile and inverse lookup tools', async () => {
    const knowledge = service()
    expect((await knowledge.execute('get_pal_profile', { pal: '001' })).content).toMatchObject({ id: 'SheepBall' })
    expect((await knowledge.execute('compare_pals', { pals: ['棉悠悠', '捣蛋猫'] })).evidence).toHaveLength(2)
    expect((await knowledge.execute('find_drop_sources', { item: '羊毛' })).evidence[0].id).toBe('pal:SheepBall')
    expect((await knowledge.execute('find_skill_owners', { skill: '滚滚毛球' })).evidence[0].id).toBe('pal:SheepBall')
    expect((await knowledge.execute('find_child_by_parents', { parentA: '棉悠悠', parentB: '捣蛋猫' })).content).toMatchObject([{ child: { id: 'NegativeKoala' } }])
    const children = await knowledge.execute('find_children_for_parent', { parent: '棉悠悠', limit: 1, offset: 0 })
    expect(children.content).toMatchObject({ total: 1 })
    expect(children.trace.resultCount).toBe(1)
    const parents = await knowledge.execute('find_parents_for_child', { child: '寐魔', sort: 'paldexNo', direction: 'desc', limit: 1, offset: 0 })
    expect(parents.content).toMatchObject({ total: 1 })
    expect(parents.trace.resultCount).toBe(1)
    await expect(knowledge.execute('compare_pals', { pals: ['棉悠悠'] })).rejects.toThrow()
    await expect(knowledge.execute('get_pal_profile', { pal: '棉悠悠', injected: true })).rejects.toThrow()
    expect((await knowledge.execute('get_pal_profile', { pal: '不存在' })).trace.resultCount).toBe(0)
  })
})
