import { resolve } from 'node:path'

export const PROJECT_ROOT = resolve(import.meta.dirname, '../..')
export const RAW_ROOT = resolve(PROJECT_ROOT, 'data/raw')
export const PALDB_RAW_ROOT = resolve(RAW_ROOT, 'paldb')
export const PALDB_PAGE_ROOT = resolve(PALDB_RAW_ROOT, 'pages')
export const PALCALC_RAW_ROOT = resolve(RAW_ROOT, 'palcalc')
export const GENERATED_DATA_ROOT = resolve(PROJECT_ROOT, 'public/data')
export const GENERATED_IMAGE_ROOT = resolve(
  PROJECT_ROOT,
  'public/generated/pals',
)
export const GENERATED_ELEMENT_IMAGE_ROOT = resolve(
  PROJECT_ROOT,
  'public/generated/elements',
)
export const GENERATED_ITEM_IMAGE_ROOT = resolve(
  PROJECT_ROOT,
  'public/generated/items',
)
export const GENERATED_WORK_IMAGE_ROOT = resolve(
  PROJECT_ROOT,
  'public/generated/work-suitabilities',
)

export const PALDB_BASE_URL = 'https://paldb.cn'
export const PALDB_LIST_URL = `${PALDB_BASE_URL}/pals`
export const PALDB_ROBOTS_URL = `${PALDB_BASE_URL}/robots.txt`
export const PALDB_EXPECTED_COUNT = 299
// paldb 当前 299 条含 No.204 枯星龙；PalCalc 的 299 物种矩阵另含花冠叶泥泥。
// 合并展示时两份来源的并集为 300 条。
export const GENERATED_PAL_COUNT = 300
export const REQUEST_GAP_MS = 1_000

export const PALCALC_REVISION =
  '8b7e2f779e47fddae16ddcb973e828ba20c02b80'
export const PALCALC_RELEASE = 'v1.17.6'
export const PALCALC_BASE_URL = `https://raw.githubusercontent.com/tylercamp/palcalc/${PALCALC_REVISION}/PalCalc.Model`
export const PALCALC_DB_URL = `${PALCALC_BASE_URL}/db.json`
export const PALCALC_BREEDING_URL = `${PALCALC_BASE_URL}/breeding.json`
export const PALCALC_BREEDING_SHA256 =
  '1af1e4d6b461599ec3b80a2195002337ff484ed3c28ce57e27def96138262ec2'
export const BREEDING_EXPECTED_COUNT = 44_851
export const PAIR_EXPECTED_COUNT = 44_850

export const GAME_RELEASE_LINE = '1.0' as const
export const GAME_BUILD_ID = '24181527' as const
export const DATASET_SCHEMA_VERSION = 4 as const
