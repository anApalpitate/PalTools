import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  BREEDING_EXPECTED_COUNT,
  PALCALC_BREEDING_SHA256,
  PALCALC_BREEDING_URL,
  PALCALC_DB_URL,
  PALCALC_RAW_ROOT,
  PALCALC_RELEASE,
  PALCALC_REVISION,
  PALDB_EXPECTED_COUNT,
} from './config'
import { fetchWithRetry } from './http'

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

async function download(url: string): Promise<Buffer> {
  return Buffer.from(await (await fetchWithRetry(url)).arrayBuffer())
}

function sourceDirectoryArgument(): string | null {
  const index = process.argv.indexOf('--source-dir')
  const value =
    index >= 0 && process.argv[index + 1]
      ? process.argv[index + 1]
      : process.argv[2] && !process.argv[2].startsWith('-')
        ? process.argv[2]
        : null
  return value ? resolve(value, 'PalCalc.Model') : null
}

async function main(): Promise<void> {
  await mkdir(PALCALC_RAW_ROOT, { recursive: true })
  const sourceDirectory = sourceDirectoryArgument()
  const [dbData, breedingData] = sourceDirectory
    ? await Promise.all([
        readFile(resolve(sourceDirectory, 'db.json')),
        readFile(resolve(sourceDirectory, 'breeding.json')),
      ])
    : await Promise.all([
        download(PALCALC_DB_URL),
        download(PALCALC_BREEDING_URL),
      ])

  const breedingHash = sha256(breedingData)
  if (breedingHash !== PALCALC_BREEDING_SHA256) {
    throw new Error(
      `PalCalc breeding.json 哈希不匹配：${breedingHash}`,
    )
  }

  const db = JSON.parse(dbData.toString('utf8')) as { Pals?: unknown[] }
  const breeding = JSON.parse(breedingData.toString('utf8')) as {
    Breeding?: unknown[]
  }
  if (db.Pals?.length !== PALDB_EXPECTED_COUNT) {
    throw new Error(`PalCalc 帕鲁数量异常：${db.Pals?.length ?? 0}`)
  }
  if (breeding.Breeding?.length !== BREEDING_EXPECTED_COUNT) {
    throw new Error(`PalCalc 配方数量异常：${breeding.Breeding?.length ?? 0}`)
  }

  await Promise.all([
    writeFile(resolve(PALCALC_RAW_ROOT, 'db.json'), dbData),
    writeFile(resolve(PALCALC_RAW_ROOT, 'breeding.json'), breedingData),
    writeFile(
      resolve(PALCALC_RAW_ROOT, 'source.json'),
      `${JSON.stringify(
        {
          release: PALCALC_RELEASE,
          revision: PALCALC_REVISION,
          dbUrl: PALCALC_DB_URL,
          dbSha256: sha256(dbData),
          breedingUrl: PALCALC_BREEDING_URL,
          breedingSha256: breedingHash,
          importedFrom: sourceDirectory ? 'verified-local-checkout' : 'github-raw',
          fetchedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      'utf8',
    ),
  ])

  console.log(
    `PalCalc 导入完成：${db.Pals.length} 个帕鲁，${breeding.Breeding.length} 条配方`,
  )
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) {
  await main()
}
