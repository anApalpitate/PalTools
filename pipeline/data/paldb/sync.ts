import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  GENERATED_ELEMENT_IMAGE_ROOT,
  GENERATED_IMAGE_ROOT,
  GENERATED_ITEM_IMAGE_ROOT,
  GENERATED_WORK_IMAGE_ROOT,
  PALDB_BASE_URL,
  PALDB_EXPECTED_COUNT,
  PALDB_LIST_URL,
  PALDB_PAGE_ROOT,
  PALDB_RAW_ROOT,
  PALDB_ROBOTS_URL,
} from '../config'
import { isPathAllowed } from '../robots'
import { sha256 } from './assets'
import { PaldbClient } from './client'
import { parsePalList, parsePalPage } from './parser'
import {
  ELEMENT_LABEL_TO_ID,
  rawElementAssetSchema,
  rawItemAssetSchema,
  rawRecordSchema,
  rawWorkSuitabilityAssetSchema,
  SOURCE_ELEMENT_LABELS,
  type RawElementAsset,
  type RawItemAsset,
  type RawPaldbRecord,
  type RawWorkSuitabilityAsset,
} from './schema'

export async function syncPaldb(args = process.argv.slice(2)): Promise<void> {
  const refresh = args.includes('--refresh')
  const offline = args.includes('--offline')
  if (refresh && offline) {
    throw new Error('--refresh 与 --offline 不能同时使用')
  }

  await Promise.all([
    mkdir(PALDB_PAGE_ROOT, { recursive: true }),
    mkdir(GENERATED_IMAGE_ROOT, { recursive: true }),
    mkdir(GENERATED_ELEMENT_IMAGE_ROOT, { recursive: true }),
    mkdir(GENERATED_ITEM_IMAGE_ROOT, { recursive: true }),
    mkdir(GENERATED_WORK_IMAGE_ROOT, { recursive: true }),
  ])
  const client = new PaldbClient(offline, refresh)
  const robotsPath = resolve(PALDB_RAW_ROOT, 'robots.txt')
  const robotsText = offline
    ? await readFile(robotsPath, 'utf8')
    : await client.cachedText(PALDB_ROBOTS_URL, robotsPath, true)

  if (
    !isPathAllowed(robotsText, '/pals') ||
    !isPathAllowed(robotsText, '/pals/Lamball')
  ) {
    throw new Error('paldb robots.txt 当前不允许抓取公开图鉴页面，已终止')
  }

  const listHtml = await client.cachedText(
    PALDB_LIST_URL,
    resolve(PALDB_RAW_ROOT, 'pals.html'),
  )
  const palIds = parsePalList(listHtml)
  if (palIds.length !== PALDB_EXPECTED_COUNT) {
    throw new Error(
      `图鉴链接数量异常：期望 ${PALDB_EXPECTED_COUNT}，实际 ${palIds.length}`,
    )
  }

  const records: RawPaldbRecord[] = []
  const elementSources = new Map<string, Set<string>>()
  const itemSources = new Map<string, { name: string; sourceUrl: string }>()
  const workSources = new Map<string, Set<string>>()

  for (const [index, paldbId] of palIds.entries()) {
    const sourceUrl = `${PALDB_BASE_URL}/pals/${encodeURIComponent(paldbId)}`
    const html = await client.cachedText(
      sourceUrl,
      resolve(PALDB_PAGE_ROOT, `${paldbId}.html`),
    )
    const parsed = parsePalPage(html, sourceUrl)
    for (const asset of parsed.elementAssets) {
      const sources = elementSources.get(asset.labelZhHans) ?? new Set<string>()
      sources.add(asset.sourceUrl)
      elementSources.set(asset.labelZhHans, sources)
    }
    for (const asset of parsed.workSuitabilityAssets) {
      const sources = workSources.get(asset.name) ?? new Set<string>()
      sources.add(asset.sourceUrl)
      workSources.set(asset.name, sources)
    }
    for (const drop of parsed.drops) {
      const existing = itemSources.get(drop.itemId)
      if (
        existing &&
        (existing.name !== drop.itemName ||
          existing.sourceUrl !== drop.itemSourceUrl)
      ) {
        throw new Error(
          `掉落物素材映射冲突：${drop.itemId}（${existing.name}/${drop.itemName}）`,
        )
      }
      itemSources.set(drop.itemId, {
        name: drop.itemName,
        sourceUrl: drop.itemSourceUrl,
      })
    }

    const imageData = await client.webp(
      parsed.imageSourceUrl,
      resolve(GENERATED_IMAGE_ROOT, `${parsed.paldbId}.webp`),
    )
    const {
      elementAssets: _elementAssets,
      workSuitabilityAssets: _workSuitabilityAssets,
      ...record
    } = parsed
    records.push(
      rawRecordSchema.parse({
        ...record,
        imageSha256: sha256(imageData),
        fetchedAt: new Date().toISOString(),
      }),
    )

    if ((index + 1) % 25 === 0 || index + 1 === palIds.length) {
      console.log(`paldb: ${index + 1}/${palIds.length}`)
    }
  }

  const unexpectedLabels = [...elementSources.keys()].filter(
    (label) => !(label in ELEMENT_LABEL_TO_ID),
  )
  if (unexpectedLabels.length > 0) {
    throw new Error(`发现未映射属性：${unexpectedLabels.join(', ')}`)
  }

  const elementAssets: RawElementAsset[] = []
  for (const label of SOURCE_ELEMENT_LABELS) {
    const sources = [...(elementSources.get(label) ?? [])]
    if (sources.length !== 1) {
      throw new Error(`属性素材无法一对一映射：${label}（${sources.length} 个 URL）`)
    }
    const id = ELEMENT_LABEL_TO_ID[label as keyof typeof ELEMENT_LABEL_TO_ID]
    if (id === 'unknown') continue
    const localPath = `/generated/elements/${id}.webp`
    const data = await client.webp(
      sources[0],
      resolve(GENERATED_ELEMENT_IMAGE_ROOT, `${id}.webp`),
    )
    elementAssets.push(
      rawElementAssetSchema.parse({
        id,
        labelZhHans: label,
        sourceUrl: sources[0],
        localPath,
        sha256: sha256(data),
      }),
    )
  }

  const itemAssets: RawItemAsset[] = []
  for (const [id, item] of [...itemSources].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const assetFileName =
      new URL(item.sourceUrl).pathname.split('/').at(-1) ?? `${id}.webp`
    const localPath = `/generated/items/${assetFileName}`
    const data = await client.webp(
      item.sourceUrl,
      resolve(GENERATED_ITEM_IMAGE_ROOT, assetFileName),
    )
    itemAssets.push(
      rawItemAssetSchema.parse({
        id,
        name: item.name,
        sourceUrl: item.sourceUrl,
        localPath,
        sha256: sha256(data),
      }),
    )
  }

  const workAssets: RawWorkSuitabilityAsset[] = []
  for (const [name, sourceSet] of [...workSources].sort(([a], [b]) =>
    a.localeCompare(b, 'zh-CN'),
  )) {
    const sources = [...sourceSet]
    if (sources.length !== 1) {
      throw new Error(`工作适应性素材无法一对一映射：${name}（${sources.length} 个 URL）`)
    }
    const assetFileName =
      new URL(sources[0]).pathname.split('/').at(-1) ?? `${name}.webp`
    const localPath = `/generated/work-suitabilities/${assetFileName}`
    const data = await client.webp(
      sources[0],
      resolve(GENERATED_WORK_IMAGE_ROOT, assetFileName),
    )
    workAssets.push(
      rawWorkSuitabilityAssetSchema.parse({
        name,
        sourceUrl: sources[0],
        localPath,
        sha256: sha256(data),
      }),
    )
  }

  await Promise.all([
    writeFile(
      resolve(PALDB_RAW_ROOT, 'pals.json'),
      `${JSON.stringify(records, null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      resolve(PALDB_RAW_ROOT, 'elements.json'),
      `${JSON.stringify(elementAssets, null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      resolve(PALDB_RAW_ROOT, 'items.json'),
      `${JSON.stringify(itemAssets, null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      resolve(PALDB_RAW_ROOT, 'work-suitabilities.json'),
      `${JSON.stringify(workAssets, null, 2)}\n`,
      'utf8',
    ),
  ])
  console.log(
    `paldb 图鉴同步完成：${records.length} 条，${elementAssets.length} 个属性素材，${itemAssets.length} 个掉落物素材，${workAssets.length} 个工作适应性素材`,
  )
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) await syncPaldb()
