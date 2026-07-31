import type { PalSortKey } from '../src/domain/pals'
import type { ElementId } from '../src/domain/types'

export type CliCommand =
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'info'; json: boolean }
  | {
      kind: 'search'
      query: string
      element: ElementId | ''
      workTypes: string[]
      sortKey: PalSortKey
      sortDirection: 'asc' | 'desc'
      limit: number
      json: boolean
    }
  | {
      kind: 'forward'
      parentA: string
      parentB: string
      json: boolean
    }
  | { kind: 'reverse'; target: string; json: boolean }
  | { kind: 'plan-validate'; file: string; json: boolean }

export type ParsedArgs =
  | { kind: 'command'; command: CliCommand; dataDir: string | undefined }
  | { kind: 'usage-error'; message: string; json: boolean }

const ELEMENT_IDS = new Set([
  'neutral',
  'fire',
  'water',
  'electric',
  'grass',
  'dark',
  'dragon',
  'ground',
  'ice',
  'unknown',
])

const SORT_KEYS: readonly PalSortKey[] = [
  'paldexNo',
  'hp',
  'attack',
  'defense',
  'workSpeed',
  'walkSpeed',
  'runSpeed',
  'swimSpeed',
  'rideSprintSpeed',
  'transportSpeed',
  'stamina',
  'foodAmount',
]

const SORT_KEY_SET = new Set<string>(SORT_KEYS)
const FLAG_WITH_VALUE = new Set([
  'data-dir',
  'element',
  'work',
  'sort',
  'dir',
  'limit',
  'parents',
  'target',
])

function usageError(message: string, json: boolean): ParsedArgs {
  return { kind: 'usage-error', message, json }
}

function valueFor(
  argv: string[],
  index: number,
  name: string,
  inline: string | undefined,
): { value: string; next: number } {
  if (inline !== undefined) {
    return { value: inline, next: index }
  }
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('-')) {
    throw new Error(`参数 --${name} 需要一个值。`)
  }
  return { value, next: index + 1 }
}

export function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) {
    return usageError('缺少命令。运行 paltools --help 查看用法。', false)
  }

  let dataDir: string | undefined
  let json = false
  let commandName: string | undefined
  const positionals: string[] = []
  const flags = new Map<string, string[]>()

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      return { kind: 'command', command: { kind: 'help' }, dataDir }
    }
    if (arg === '--version' || arg === '-v') {
      return { kind: 'command', command: { kind: 'version' }, dataDir }
    }
    if (arg.startsWith('--')) {
      const equalsIndex = arg.indexOf('=')
      const name = equalsIndex >= 0 ? arg.slice(2, equalsIndex) : arg.slice(2)
      const inline = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : undefined
      if (name === 'json') {
        json = true
        continue
      }
      if (name === 'data-dir') {
        try {
          const { value, next } = valueFor(argv, index, name, inline)
          dataDir = value
          index = next
        } catch (error) {
          return usageError(
            error instanceof Error ? error.message : '参数 --data-dir 无效。',
            json,
          )
        }
        continue
      }
      if (!FLAG_WITH_VALUE.has(name)) {
        return usageError(`未知参数：--${name}`, json)
      }
      try {
        const { value, next } = valueFor(argv, index, name, inline)
        flags.set(name, [...(flags.get(name) ?? []), value])
        index = next
      } catch (error) {
        return usageError(
          error instanceof Error ? error.message : `参数 --${name} 无效。`,
          json,
        )
      }
      continue
    }
    if (arg.startsWith('-')) {
      return usageError(`未知参数：${arg}`, json)
    }
    if (commandName === undefined) {
      commandName = arg
    } else {
      positionals.push(arg)
    }
  }

  if (commandName === undefined) {
    return usageError('缺少命令。运行 paltools --help 查看用法。', json)
  }

  const single = (name: string): string | undefined => flags.get(name)?.[0]
  const singleRequired = (name: string): ParsedArgs | string => {
    const value = single(name)
    if (value === undefined || value.trim() === '') {
      return usageError(`命令 ${commandName} 缺少 --${name} 参数。`, json)
    }
    return value
  }

  switch (commandName) {
    case 'info':
      if (positionals.length > 0) {
        return usageError('info 命令不接受位置参数。', json)
      }
      return {
        kind: 'command',
        command: { kind: 'info', json },
        dataDir,
      }
    case 'search': {
      if (positionals.length > 1) {
        return usageError('search 命令最多接受一个查询词。', json)
      }
      const element = single('element') ?? ''
      if (element !== '' && !ELEMENT_IDS.has(element)) {
        return usageError(`未知属性：${element}`, json)
      }
      const sortKey = single('sort') ?? 'paldexNo'
      if (!SORT_KEY_SET.has(sortKey)) {
        return usageError(`未知排序键：${sortKey}`, json)
      }
      const sortDirection = single('dir') ?? 'asc'
      if (sortDirection !== 'asc' && sortDirection !== 'desc') {
        return usageError('--dir 只能为 asc 或 desc。', json)
      }
      const rawLimit = single('limit') ?? '50'
      if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1) {
        return usageError('--limit 必须是正整数。', json)
      }
      return {
        kind: 'command',
        command: {
          kind: 'search',
          query: positionals[0] ?? '',
          element: element === '' ? '' : (element as ElementId),
          workTypes: flags.get('work') ?? [],
          sortKey: sortKey as PalSortKey,
          sortDirection,
          limit: Number(rawLimit),
          json,
        },
        dataDir,
      }
    }
    case 'forward': {
      const parents = singleRequired('parents')
      if (typeof parents !== 'string') return parents
      if (positionals.length > 0) {
        return usageError('forward 命令不接受位置参数。', json)
      }
      const parts = parents.split(',').map((part) => part.trim())
      if (parts.length !== 2 || parts.some((part) => part === '')) {
        return usageError('--parents 需要恰好两个用逗号分隔的帕鲁。', json)
      }
      return {
        kind: 'command',
        command: {
          kind: 'forward',
          parentA: parts[0],
          parentB: parts[1],
          json,
        },
        dataDir,
      }
    }
    case 'reverse': {
      const target = singleRequired('target')
      if (typeof target !== 'string') return target
      if (positionals.length > 0) {
        return usageError('reverse 命令不接受位置参数。', json)
      }
      return {
        kind: 'command',
        command: { kind: 'reverse', target, json },
        dataDir,
      }
    }
    case 'plan': {
      if (positionals[0] !== 'validate' || positionals.length !== 2) {
        return usageError('用法：paltools plan validate <文件>', json)
      }
      return {
        kind: 'command',
        command: {
          kind: 'plan-validate',
          file: positionals[1],
          json,
        },
        dataDir,
      }
    }
    default:
      return usageError(`未知命令：${commandName}`, json)
  }
}

export const HELP_TEXT = `PalTools CLI - 离线图鉴与配种查询工具

用法：
  paltools <命令> [参数] [--json]

命令：
  paltools info                          显示应用与数据集版本、游戏版本和记录数
  paltools search [查询词]                按名称/拼音/编号/属性/工作适性/技能搜索帕鲁
  paltools forward --parents A,B          查询两位亲本的无性别配种结果
  paltools reverse --target C             查询目标子代的全部亲本组合
  paltools plan validate <文件>           校验 .paltools-plan.json 导出方案
  paltools --help, -h                     显示本帮助
  paltools --version, -v                  显示 CLI 应用版本

search 参数：
  --element <id>                 按属性过滤（neutral/fire/water/electric/grass/dark/dragon/ground/ice/unknown）
  --work <名称>                   按工作适性过滤，可重复传入
  --sort <键>                     排序键（paldexNo/hp/attack/defense/workSpeed/...）
  --dir asc|desc                 排序方向，默认 asc
  --limit <数量>                  最多输出条数，默认 50

全局参数：
  --json                         输出稳定 JSON 结构
  --data-dir <目录>               指定 public/data 目录，默认 ./public/data，可用 PALTOOLS_DATA_DIR 覆盖

退出码：
  0 成功
  1 方案校验失败或内部错误
  2 参数错误或帕鲁标识无法唯一解析
  3 查询有效但没有结果
  4 数据缺失、损坏或 Schema 版本不兼容
`
