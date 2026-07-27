import * as cheerio from 'cheerio'
import { createHash } from 'node:crypto'
import { PALDB_BASE_URL } from '../config'
import type { z } from 'zod'
import { paldbStatsSchema } from './schema'

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function parseNumber(value: string): number | null {
  const normalized = cleanText(value)
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : null
}

function normalizePageStat(value: number | undefined): number | null {
  return value === undefined || value < 0 ? null : value
}

export function parsePalList(html: string): string[] {
  const $ = cheerio.load(html)
  return unique(
    $('a[href^="/pals/"]')
      .map((_, element) => {
        const href = $(element).attr('href') ?? ''
        return href.match(/^\/pals\/([^/?#]+)$/)?.[1] ?? ''
      })
      .get()
      .filter(Boolean),
  )
}

export interface ParsedElementAsset {
  labelZhHans: string
  sourceUrl: string
}

export interface ParsedPalPage {
  paldbId: string
  paldexNo: string | null
  nameZhHans: string
  elementLabels: string[]
  elementAssets: ParsedElementAsset[]
  rarity: number | null
  workSuitabilities: Record<string, number>
  partnerSkillName: string | null
  partnerSkillDescription: string
  stats: z.infer<typeof paldbStatsSchema>
  activeSkills: Array<{
    id: string
    name: string
    elementLabel: string
    attackType: 'melee' | 'ranged'
    unlockLevel: number
    power: number | null
    cooldownSeconds: number | null
    attackRange: string | null
    effects: string[]
    description: string
    sourceUrl: string
  }>
  passiveSkills: Array<{
    name: string
    description: string
    rank: number | null
  }>
  drops: Array<{
    itemId: string
    itemName: string
    itemSourceUrl: string
    quantityMin: number
    quantityMax: number
    probabilityPercent: number
    requiredLevel: number | null
  }>
  imageSourceUrl: string
  sourceUrl: string
}

function sectionBody(
  $: cheerio.CheerioAPI,
  heading: string,
) {
  return $('h3')
    .filter((_, element) => cleanText($(element).text()) === heading)
    .first()
    .parent()
    .next()
}

function parseRange(value: string): [number, number] | null {
  const match = cleanText(value).match(/^(\d+)(?:\s*[–-]\s*(\d+))?$/)
  if (!match) return null
  const min = Number(match[1])
  return [min, Number(match[2] ?? match[1])]
}

function mediaId(url: string, name: string): string {
  const pathname = new URL(url).pathname
  const fileName = pathname.split('/').at(-1) ?? ''
  const assetId = decodeURIComponent(fileName).replace(/\.webp$/i, '')
  const nameHash = createHash('sha1').update(name).digest('hex').slice(0, 8)
  return `${assetId}--${nameHash}`
}

export function parsePalPage(html: string, sourceUrl: string): ParsedPalPage {
  const $ = cheerio.load(html)
  const paldbId = new URL(sourceUrl).pathname.split('/').filter(Boolean).at(-1)
  const title = cleanText($('meta[property="og:title"]').attr('content') ?? '')
  const description = cleanText(
    $('meta[name="description"]').attr('content') ?? '',
  )
  const nameZhHans = cleanText($('main h1').first().text() || $('h1').first().text())
  const paldexMatch = title.match(/No\.(\d+[A-Z]?)/i)
  const rarityMatch = cleanText($('body').text()).match(/稀有度:\s*(\d+)/)
  const imageSourceUrl = new URL(
    $('meta[property="og:image"]').attr('content') ?? '',
    PALDB_BASE_URL,
  ).toString()

  const identityCard = $('main h1').first().parent()
  const elementAssets: ParsedElementAsset[] = []
  let elementLabels = unique(
    identityCard
      .find('div[style*="T_prt_palstatus_element_"]')
      .map((_, element) => {
        const label = cleanText($(element).text())
        const assetPath = ($(element).attr('style') ?? '').match(
          /background-image:\s*url\(([^)]+)\)/i,
        )?.[1]
        if (label && assetPath) {
          elementAssets.push({
            labelZhHans: label,
            sourceUrl: new URL(assetPath, PALDB_BASE_URL).toString(),
          })
        }
        return label
      })
      .get()
      .filter((value) => value.length > 0 && value.length <= 8),
  ).slice(0, 2)

  if (elementLabels.length === 0) {
    const fallbackElement =
      description.match(/，([^，。]{1,10}属性)帕鲁/)?.[1] ??
      title.match(/No\.\d+[A-Z]?\s+(.+?属性)帕鲁图鉴/i)?.[1]
    if (fallbackElement) elementLabels = [fallbackElement]
  }

  const partnerHeading = $('h3')
    .filter((_, element) => cleanText($(element).text()) === '伙伴技能')
    .first()
  const partnerSkillText = cleanText(
    partnerHeading.parent().find('h4').first().text(),
  )
  const partnerSkillName =
    partnerSkillText && partnerSkillText !== '-' ? partnerSkillText : null
  const partnerSkillDescription = cleanText(
    partnerHeading.parent().find('p').first().text(),
  )

  const workSuitabilities: Record<string, number> = {}
  const workHeading = $('h3')
    .filter((_, element) => cleanText($(element).text()) === '工作适应性')
    .first()
  workHeading
    .parent()
    .find('img[src*="T_icon_palwork_"]')
    .each((_, element) => {
      const name = cleanText($(element).attr('alt') ?? '')
      const row = $(element).closest('div.flex.items-center')
      const level = cleanText(row.text()).match(/Lv\s*(\d+)/i)?.[1]
      if (name && level) workSuitabilities[name] = Number(level)
    })

  const rawStats = new Map<string, number>()
  $('div.flex.justify-between').each((_, element) => {
    const spans = $(element).find('span')
    if (spans.length < 2) return
    const label = cleanText(spans.first().text())
    const value = parseNumber(spans.last().text())
    if (value !== null) rawStats.set(label, value)
  })
  const foodAmount = $('img[src*="T_Icon_foodamount_on.webp"]').length
  const statsResult = paldbStatsSchema.safeParse({
    hp: normalizePageStat(rawStats.get('HP')),
    attack: normalizePageStat(rawStats.get('攻击')),
    defense: normalizePageStat(rawStats.get('防御')),
    workSpeed: normalizePageStat(rawStats.get('工作速度')),
    walkSpeed: normalizePageStat(rawStats.get('行走')),
    runSpeed: normalizePageStat(rawStats.get('奔跑')),
    swimSpeed: normalizePageStat(rawStats.get('游泳')),
    stamina: normalizePageStat(rawStats.get('耐力')),
    foodAmount,
  })

  if (
    !paldbId ||
    !nameZhHans ||
    elementLabels.length === 0 ||
    !imageSourceUrl ||
    !partnerSkillDescription ||
    !statsResult.success
  ) {
    throw new Error(`详情页关键字段缺失：${sourceUrl}`)
  }
  const stats = statsResult.data

  const activeSkills = sectionBody($, '主动技能')
    .find('a[href^="/skills/"]')
    .map((_, element) => {
      const card = $(element)
      const href = card.attr('href') ?? ''
      const badges = card
        .find('.inline-flex')
        .map((__, badge) => cleanText($(badge).text()))
        .get()
      const attackLabel = badges.find((value) => value === '近战' || value === '远程')
      const level = badges
        .map((value) => value.match(/^Lv\.\s*(\d+)$/i)?.[1])
        .find(Boolean)
      const elementLabel = cleanText(
        card.find('div[style*="T_prt_palstatus_element_"]').first().text(),
      )
      const statRow = card
        .find('div.flex.gap-3.mb-3.flex-wrap')
        .first()
        .children('div')
        .map((__, item) => cleanText($(item).text()))
        .get()
      const power = statRow
        .map((value) => value.match(/^威力:\s*(\d+(?:\.\d+)?)$/)?.[1])
        .find(Boolean)
      const cooldown = statRow
        .map((value) => value.match(/^冷却:\s*(\d+(?:\.\d+)?)\s*s$/i)?.[1])
        .find(Boolean)
      const effects = statRow.filter(
        (value) => !value.startsWith('威力:') && !value.startsWith('冷却:'),
      )
      const rangeText = card
        .find('div.text-gray-400.text-xs.mb-2')
        .first()
        .text()
      const attackRange = cleanText(rangeText).replace(/^攻击范围:\s*/, '') || null
      const descriptionText = cleanText(card.find('p').last().text())

      if (
        !href ||
        !attackLabel ||
        !level ||
        !elementLabel ||
        !descriptionText
      ) {
        throw new Error(`主动技能字段缺失：${sourceUrl}/${cleanText(card.text())}`)
      }

      return {
        id: decodeURIComponent(href.split('/').filter(Boolean).at(-1) ?? ''),
        name: cleanText(card.find('h4').first().text()),
        elementLabel,
        attackType: attackLabel === '近战' ? ('melee' as const) : ('ranged' as const),
        unlockLevel: Number(level),
        power: power ? Number(power) : null,
        cooldownSeconds: cooldown ? Number(cooldown) : null,
        attackRange,
        effects,
        description: descriptionText,
        sourceUrl: new URL(href, PALDB_BASE_URL).toString(),
      }
    })
    .get()

  const passiveSkills = sectionBody($, '被动技能')
    .find(':scope > .grid > div')
    .map((_, element) => {
      const card = $(element)
      const rankSource = card.find('img[alt="rank"]').attr('src') ?? ''
      const rank = rankSource.match(/_(0?[1-4])\.webp$/i)?.[1]
      return {
        name: cleanText(card.find('h4').first().text()),
        description: cleanText(card.find('p').first().text()),
        rank: rank ? Number(rank) : null,
      }
    })
    .get()
    .filter((skill) => skill.name && skill.description)

  const drops = sectionBody($, '掉落物品')
    .find('tbody tr')
    .map((_, element) => {
      const cells = $(element).find('td')
      const image = cells.eq(0).find('img').first()
      const itemName = cleanText(image.attr('alt') ?? cells.eq(0).text())
      const itemSourceUrl = new URL(
        image.attr('src') ?? '',
        PALDB_BASE_URL,
      ).toString()
      const quantity = parseRange(cells.eq(1).text())
      const probabilityText = cleanText(cells.eq(2).text())
      const probability = probabilityText.match(
        /^(?:Lv\.(\d+)\s+)?(\d+(?:\.\d+)?)%$/,
      )
      if (!itemName || !quantity || !probability) {
        throw new Error(`掉落物字段缺失：${sourceUrl}/${cleanText($(element).text())}`)
      }
      return {
        itemId: mediaId(itemSourceUrl, itemName),
        itemName,
        itemSourceUrl,
        quantityMin: quantity[0],
        quantityMax: quantity[1],
        probabilityPercent: Number(probability[2]),
        requiredLevel: probability[1] ? Number(probability[1]) : null,
      }
    })
    .get()

  const paldexNo = paldexMatch
    ? `${paldexMatch[1].match(/^\d+/)?.[0].padStart(3, '0') ?? ''}${
        paldexMatch[1].match(/[A-Z]$/i)?.[0].toUpperCase() ?? ''
      }`
    : null

  return {
    paldbId,
    paldexNo,
    nameZhHans,
    elementLabels,
    elementAssets: unique(
      elementAssets.map((asset) => `${asset.labelZhHans}\0${asset.sourceUrl}`),
    ).map((value) => {
      const [labelZhHans, assetUrl] = value.split('\0')
      return { labelZhHans, sourceUrl: assetUrl }
    }),
    rarity: rarityMatch ? Number(rarityMatch[1]) : null,
    workSuitabilities,
    partnerSkillName,
    partnerSkillDescription,
    stats,
    activeSkills,
    passiveSkills,
    drops,
    imageSourceUrl,
    sourceUrl,
  }
}
