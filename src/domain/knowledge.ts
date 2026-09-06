import {
  filterAndSortBreedingRecipes,
  filterAndSortRecipesForParent,
  legendaryPalIds,
  recipeMatchesForChild,
  recipeMatchesForParent,
  recipeMatchesForParents,
} from './pals'
import {
  localToolResultSchema,
  parseLocalToolArguments,
  type KnowledgeEvidence,
  type KnowledgeKind,
  type LocalToolName,
  type LocalToolResult,
  type LocalToolTraceSource,
} from './knowledge-contract'
import { matchesPalIdentityQuery, normalizeSearchTerm, palIdentitySearchText, pinyinSearchAliases } from './search'
import type { ActiveSkillRecord, BreedingIndexPayload, ItemRecord, PalRecord } from './types'

export * from './knowledge-contract'

interface KnowledgeDocument extends KnowledgeEvidence {
  fields: Array<{ name: string; text: string; weight: number }>
}

export interface KnowledgeCatalog {
  pals: PalRecord[]
  skills: ActiveSkillRecord[]
  items: ItemRecord[]
  breedingIndex: BreedingIndexPayload | null
  datasetVersion: string
}

function tokenize(value: string): string[] {
  const normalized = normalizeSearchTerm(value).replace(/[^\p{L}\p{N}]+/gu, ' ')
  const tokens = normalized.split(/\s+/).filter(Boolean)
  for (const segment of normalized.match(/[\p{Script=Han}]+/gu) ?? []) {
    for (const char of segment) tokens.push(char)
    for (let index = 0; index < segment.length - 1; index += 1) tokens.push(segment.slice(index, index + 2))
  }
  return tokens
}

function summarizePal(pal: PalRecord, skills: ReadonlyMap<string, ActiveSkillRecord>, items: ReadonlyMap<string, ItemRecord>): string {
  const work = Object.entries(pal.workSuitabilities).map(([name, level]) => `${name} Lv.${level}`).join('、') || '无工作适性'
  const skillNames = (pal.activeSkills ?? []).slice(0, 4).map((ref) => ref.nameOverride ?? skills.get(ref.skillId)?.name ?? ref.skillId).join('、')
  const drops = (pal.drops ?? []).map((drop) => items.get(drop.itemId)?.name ?? drop.itemId).join('、')
  return `#${pal.paldexNo ?? '—'} · ${pal.name.en}；属性 ${pal.elements.join('/')}；${work}${skillNames ? `；技能 ${skillNames}` : ''}${drops ? `；掉落 ${drops}` : ''}`
}

function evidenceForPal(pal: PalRecord, datasetVersion: string, summary = `${pal.name.en} · 图鉴 #${pal.paldexNo ?? '—'}`): KnowledgeEvidence {
  return { id: `pal:${pal.internalId}`, kind: 'pal', title: pal.name.zhHans, summary, matchedFields: ['identity'], score: 1, route: `#/paldex/${encodeURIComponent(pal.internalId)}`, imagePath: pal.image.localPath, datasetVersion }
}

function recipeEvidence(title: string, summary: string, route: string, datasetVersion: string, index: number): KnowledgeEvidence {
  return { id: `recipe:${index}`, kind: 'recipe', title, summary, matchedFields: ['recipe'], score: 1, route, datasetVersion }
}

export class LocalKnowledgeService {
  private readonly palsById: Map<string, PalRecord>
  private readonly skillsById: Map<string, ActiveSkillRecord>
  private readonly itemsById: Map<string, ItemRecord>
  private readonly documents: KnowledgeDocument[]
  private readonly tokenizedFields: Map<string, Array<{ name: string; text: string; weight: number; tokens: string[] }>>
  private readonly documentFrequency: Map<string, number>
  private readonly averageFieldLength: number

  constructor(private readonly catalog: KnowledgeCatalog) {
    this.palsById = new Map(catalog.pals.map((pal) => [pal.internalId, pal]))
    this.skillsById = new Map(catalog.skills.map((skill) => [skill.id, skill]))
    this.itemsById = new Map(catalog.items.map((item) => [item.id, item]))
    this.documents = this.buildDocuments()
    this.tokenizedFields = new Map(this.documents.map((document) => [document.id, document.fields.map((field) => ({ ...field, text: normalizeSearchTerm(field.text), tokens: tokenize(field.text) }))]))
    this.documentFrequency = new Map()
    let totalTokens = 0
    let fieldCount = 0
    for (const fields of this.tokenizedFields.values()) {
      const documentTokens = new Set(fields.flatMap((field) => field.tokens))
      for (const token of documentTokens) this.documentFrequency.set(token, (this.documentFrequency.get(token) ?? 0) + 1)
      for (const field of fields) { totalTokens += field.tokens.length; fieldCount += 1 }
    }
    this.averageFieldLength = Math.max(1, totalTokens / Math.max(1, fieldCount))
  }

  search(query: string, kinds?: KnowledgeKind[], limit = 8): KnowledgeEvidence[] {
    const normalized = normalizeSearchTerm(query)
    if (!normalized) return []
    const queryTokens = tokenize(normalized)
    const scores = this.documents
      .filter((document) => !kinds?.length || kinds.includes(document.kind))
      .map((document) => {
        let score = 0
        const matchedFields = new Set<string>()
        for (const field of this.tokenizedFields.get(document.id) ?? []) {
          let fieldScore = 0
          if (field.text === normalized) fieldScore += 24 * field.weight
          else if (field.text.includes(normalized)) fieldScore += 9 * field.weight
          for (const token of queryTokens) {
            const frequency = field.tokens.filter((candidate) => candidate === token).length
            if (!frequency) continue
            const documentFrequency = this.documentFrequency.get(token) ?? 0
            const inverseDocumentFrequency = Math.log(1 + (this.documents.length - documentFrequency + 0.5) / (documentFrequency + 0.5))
            const normalizedFrequency = frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * field.tokens.length / this.averageFieldLength))
            fieldScore += inverseDocumentFrequency * normalizedFrequency * field.weight * (token.length > 1 ? 1 : 0.35)
          }
          if (fieldScore > 0) matchedFields.add(field.name)
          score += fieldScore
        }
        return { document, score, matchedFields: [...matchedFields] }
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.document.title.localeCompare(right.document.title, 'zh-CN') || left.document.id.localeCompare(right.document.id, 'en'))
    return scores.slice(0, Math.min(limit, 20)).map(({ document, score, matchedFields }) => {
      const { fields: _fields, ...evidence } = document
      return { ...evidence, score, matchedFields }
    })
  }

  preRetrieve(query: string): KnowledgeEvidence[] {
    return this.search(query, undefined, 8)
  }

  evidenceForEntity(entityType: 'pal' | 'skill' | 'item', id: string): KnowledgeEvidence | null {
    if (entityType === 'pal') {
      const pal = this.palsById.get(id)
      const evidence = pal ? evidenceForPal(pal, this.catalog.datasetVersion, summarizePal(pal, this.skillsById, this.itemsById)) : null
      return evidence ? { ...evidence, matchedFields: ['entity-reference'], score: 24 } : null
    }
    const document = this.documents.find((candidate) => candidate.id === `${entityType}:${id}`)
    if (!document) return null
    const { fields: _fields, ...evidence } = document
    return { ...evidence, matchedFields: ['entity-reference'], score: 24 }
  }

  async execute(name: LocalToolName, rawArguments: unknown, source?: LocalToolTraceSource): Promise<LocalToolResult> {
    const startedAt = performance.now()
    const args = parseLocalToolArguments(name, rawArguments)
    const finish = (content: unknown, evidence: KnowledgeEvidence[], label: string): LocalToolResult => {
      const record = content && typeof content === 'object' && !Array.isArray(content) ? content as Record<string, unknown> : null
      const resultCount = Array.isArray(content) ? content.length : typeof record?.total === 'number' ? record.total : record?.error ? 0 : content ? 1 : 0
      return localToolResultSchema.parse({ content, evidence: uniqueEvidence(evidence).slice(0, 20), trace: { tool: name, label, resultCount, durationMs: Math.round((performance.now() - startedAt) * 10) / 10, source } })
    }

    if (name === 'search_local_knowledge') {
      const evidence = this.search(String(args.query), args.kinds as KnowledgeKind[] | undefined, Number(args.limit))
      return finish(evidence.map(({ imagePath: _imagePath, ...item }) => item), evidence, `搜索“${args.query}”`)
    }
    if (name === 'get_pal_profile') {
      const pal = this.resolvePal(String(args.pal))
      return finish(pal ? this.serializePal(pal) : { error: '未找到唯一匹配的帕鲁' }, pal ? [evidenceForPal(pal, this.catalog.datasetVersion, summarizePal(pal, this.skillsById, this.itemsById))] : [], `读取帕鲁“${args.pal}”`)
    }
    if (name === 'compare_pals') {
      const pals = (args.pals as string[]).map((query) => this.resolvePal(query)).filter((pal): pal is PalRecord => Boolean(pal))
      return finish(pals.map((pal) => this.serializePal(pal)), pals.map((pal) => evidenceForPal(pal, this.catalog.datasetVersion, summarizePal(pal, this.skillsById, this.itemsById))), `比较 ${pals.length} 只帕鲁`)
    }
    if (name === 'find_drop_sources') {
      const itemQuery = normalizeSearchTerm(String(args.item))
      const exactItem = this.catalog.items.find((item) => normalizeSearchTerm(item.id) === itemQuery)
      const matchedItems = exactItem
        ? [exactItem]
        : this.catalog.items.filter((item) => normalizeSearchTerm(`${item.name} ${item.id}`).includes(itemQuery))
      const itemIds = new Set(matchedItems.map((item) => item.id))
      const pals = this.catalog.pals.filter((pal) => (pal.drops ?? []).some((drop) => itemIds.has(drop.itemId))).slice(0, Number(args.limit))
      return finish(pals.map((pal) => ({ pal: this.palIdentity(pal), drops: pal.drops?.filter((drop) => itemIds.has(drop.itemId)) })), pals.map((pal) => evidenceForPal(pal, this.catalog.datasetVersion, summarizePal(pal, this.skillsById, this.itemsById))), `反查掉落“${args.item}”`)
    }
    if (name === 'find_skill_owners') {
      const skillQuery = normalizeSearchTerm(String(args.skill))
      const exactSkill = this.catalog.skills.find((skill) => normalizeSearchTerm(skill.id) === skillQuery)
      const matchedSkills = exactSkill
        ? [exactSkill]
        : this.catalog.skills.filter((skill) => normalizeSearchTerm(`${skill.name} ${skill.id} ${skill.description}`).includes(skillQuery))
      const skillIds = new Set(matchedSkills.map((skill) => skill.id))
      const pals = this.catalog.pals.filter((pal) => (pal.activeSkills ?? []).some((ref) => (
        skillIds.has(ref.skillId) || (!exactSkill && normalizeSearchTerm(ref.nameOverride ?? '').includes(skillQuery))
      ))).slice(0, Number(args.limit))
      return finish(pals.map((pal) => ({ pal: this.palIdentity(pal), skills: pal.activeSkills?.filter((ref) => skillIds.has(ref.skillId)) })), pals.map((pal) => evidenceForPal(pal, this.catalog.datasetVersion, summarizePal(pal, this.skillsById, this.itemsById))), `反查技能“${args.skill}”`)
    }

    const breedingIndex = this.catalog.breedingIndex
    if (!breedingIndex) return finish({ error: '配种索引尚未加载' }, [], '配种索引未就绪')
    if (name === 'find_child_by_parents') {
      const parentA = this.resolvePal(String(args.parentA)); const parentB = this.resolvePal(String(args.parentB))
      if (!parentA || !parentB) return finish({ error: '未找到唯一匹配的亲本' }, [], '解析双亲')
      const recipes = recipeMatchesForParents(breedingIndex, parentA.internalId, parentB.internalId)
      const evidence = recipes.map((recipe) => recipeEvidence('双亲配种结果', `${parentA.name.zhHans} + ${parentB.name.zhHans} → ${this.palsById.get(recipe.childId)?.name.zhHans ?? recipe.childId}`, `#/breeding/forward?parentA=${encodeURIComponent(parentA.internalId)}&parentB=${encodeURIComponent(parentB.internalId)}`, this.catalog.datasetVersion, recipe.recipeIndex))
      return finish(recipes.map((recipe) => this.serializeRecipe(recipe)), evidence, `${parentA.name.zhHans} × ${parentB.name.zhHans}`)
    }
    if (name === 'find_children_for_parent') {
      const parent = this.resolvePal(String(args.parent)); if (!parent) return finish({ error: '未找到唯一匹配的亲本' }, [], '解析亲本')
      const all = filterAndSortRecipesForParent(recipeMatchesForParent(breedingIndex, parent.internalId), parent.internalId, this.palsById, String(args.query ?? ''))
      const recipes = all.slice(Number(args.offset), Number(args.offset) + Number(args.limit))
      const route = `#/breeding/forward?parentA=${encodeURIComponent(parent.internalId)}`
      const evidence = recipes.map((recipe) => recipeEvidence('亲本配种结果', this.recipeLabel(recipe), route, this.catalog.datasetVersion, recipe.recipeIndex))
      return finish({ total: all.length, recipes: recipes.map((recipe) => this.serializeRecipe(recipe)) }, evidence, `${parent.name.zhHans} 的子代配方`)
    }
    const child = this.resolvePal(String(args.child)); if (!child) return finish({ error: '未找到唯一匹配的子代' }, [], '解析目标子代')
    const all = filterAndSortBreedingRecipes(recipeMatchesForChild(breedingIndex, child.internalId), this.palsById, { legendaryIds: legendaryPalIds(breedingIndex), excludeLegendary: Boolean(args.excludeLegendary), excludeSelfBreeding: Boolean(args.excludeSelf), sortKey: args.sort as 'paldexNo' | 'averageRarity', sortDirection: args.direction as 'asc' | 'desc', identityIds: (recipe) => [recipe.parentAId, recipe.parentBId] }).filter((recipe) => !args.query || [recipe.parentAId, recipe.parentBId].some((id) => { const pal = this.palsById.get(id); return pal && matchesPalIdentityQuery(pal, String(args.query)) }))
    const recipes = all.slice(Number(args.offset), Number(args.offset) + Number(args.limit))
    const route = `#/breeding/reverse?target=${encodeURIComponent(child.internalId)}`
    const evidence = recipes.map((recipe) => recipeEvidence('目标反查结果', this.recipeLabel(recipe), route, this.catalog.datasetVersion, recipe.recipeIndex))
    return finish({ total: all.length, recipes: recipes.map((recipe) => this.serializeRecipe(recipe)) }, evidence, `${child.name.zhHans} 的亲本组合`)
  }

  private resolvePal(query: string): PalRecord | null {
    const matches = this.catalog.pals.filter((pal) => matchesPalIdentityQuery(pal, query))
    if (matches.length === 1) return matches[0]
    const normalized = normalizeSearchTerm(query)
    return matches.find((pal) => [pal.internalId, pal.paldbId, pal.paldexNo, pal.name.zhHans, pal.name.en].some((value) => value && normalizeSearchTerm(value) === normalized)) ?? null
  }

  private palIdentity(pal: PalRecord) { return { id: pal.internalId, paldexNo: pal.paldexNo, name: pal.name } }
  private serializePal(pal: PalRecord) { return { ...this.palIdentity(pal), elements: pal.elements, rarity: pal.rarity, workSuitabilities: pal.workSuitabilities, partnerSkill: pal.partnerSkill, stats: pal.stats, activeSkills: (pal.activeSkills ?? []).map((ref) => ({ ...ref, name: ref.nameOverride ?? this.skillsById.get(ref.skillId)?.name, detail: this.skillsById.get(ref.skillId) })), passiveSkills: pal.passiveSkills ?? [], drops: (pal.drops ?? []).map((drop) => ({ ...drop, name: this.itemsById.get(drop.itemId)?.name ?? drop.itemId })) } }
  private serializeRecipe(recipe: { recipeIndex: number; parentAId: string; parentBId: string; childId: string }) { return { recipeIndex: recipe.recipeIndex, parentA: this.palIdentity(this.palsById.get(recipe.parentAId)!), parentB: this.palIdentity(this.palsById.get(recipe.parentBId)!), child: this.palIdentity(this.palsById.get(recipe.childId)!) } }
  private recipeLabel(recipe: { parentAId: string; parentBId: string; childId: string }) { return `${this.palsById.get(recipe.parentAId)?.name.zhHans ?? recipe.parentAId} + ${this.palsById.get(recipe.parentBId)?.name.zhHans ?? recipe.parentBId} → ${this.palsById.get(recipe.childId)?.name.zhHans ?? recipe.childId}` }

  private buildDocuments(): KnowledgeDocument[] {
    const docs: KnowledgeDocument[] = []
    for (const pal of this.catalog.pals) {
      const activeText = (pal.activeSkills ?? []).map((ref) => `${ref.nameOverride ?? this.skillsById.get(ref.skillId)?.name ?? ref.skillId} ${this.skillsById.get(ref.skillId)?.description ?? ''}`).join(' ')
      const passiveText = (pal.passiveSkills ?? []).map((skill) => `${skill.name} ${skill.description}`).join(' ')
      const dropText = (pal.drops ?? []).map((drop) => this.itemsById.get(drop.itemId)?.name ?? drop.itemId).join(' ')
      docs.push({ ...evidenceForPal(pal, this.catalog.datasetVersion, summarizePal(pal, this.skillsById, this.itemsById)), fields: [ { name: '名称与编号', text: palIdentitySearchText(pal), weight: 8 }, { name: '伙伴技能', text: `${pal.partnerSkill?.name ?? ''} ${pal.partnerSkill?.description ?? ''}`, weight: 3 }, { name: '主动技能', text: activeText, weight: 3 }, { name: '固有词条', text: passiveText, weight: 3 }, { name: '掉落物', text: dropText, weight: 3 }, { name: '工作适性', text: Object.keys(pal.workSuitabilities).join(' '), weight: 2 } ] })
    }
    for (const skill of this.catalog.skills) docs.push({ id: `skill:${skill.id}`, kind: 'skill', title: skill.name, summary: `${skill.element} · 威力 ${skill.power ?? '—'} · 冷却 ${skill.cooldownSeconds ?? '—'} 秒；${skill.description}`, matchedFields: [], score: 0, datasetVersion: this.catalog.datasetVersion, fields: [{ name: '技能名称', text: `${skill.name} ${skill.id} ${pinyinSearchAliases(skill.name)}`, weight: 7 }, { name: '技能说明', text: `${skill.description} ${skill.effects.join(' ')}`, weight: 2 }] })
    for (const item of this.catalog.items) docs.push({ id: `item:${item.id}`, kind: 'item', title: item.name, summary: `本地掉落物目录 · ${item.id}`, matchedFields: [], score: 0, datasetVersion: this.catalog.datasetVersion, imagePath: item.icon.localPath, fields: [{ name: '物品名称', text: `${item.name} ${item.id} ${pinyinSearchAliases(item.name)}`, weight: 7 }] })
    const passiveNames = new Map<string, string>()
    for (const pal of this.catalog.pals) for (const passive of pal.passiveSkills ?? []) passiveNames.set(passive.name, passive.description)
    for (const [name, description] of passiveNames) docs.push({ id: `passive:${name}`, kind: 'passive', title: name, summary: description, matchedFields: [], score: 0, datasetVersion: this.catalog.datasetVersion, fields: [{ name: '词条名称', text: name, weight: 7 }, { name: '词条说明', text: description, weight: 2 }] })
    return docs
  }
}

function uniqueEvidence(evidence: KnowledgeEvidence[]): KnowledgeEvidence[] {
  return [...new Map(evidence.map((item) => [item.id, item])).values()]
}
