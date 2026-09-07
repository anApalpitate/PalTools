import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, resolve } from 'node:path'

const terminalEvents = new Set(['done', 'pass', 'fail', 'skip'])
const phases = new Set(['investigate', 'plan', 'implement', 'verify', 'docs', 'commit'])
const phaseEvents = new Set(['start', 'pause', 'resume', ...terminalEvents])
const waitKinds = new Set(['tool', 'user', 'approval', 'service', 'interruption'])

function secondsBetween(start, end) {
  return Math.max(0, (end - start) / 1000)
}

function mergeIntervals(intervals) {
  const sorted = intervals
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end >= start)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1])
  const merged = []
  for (const interval of sorted) {
    const previous = merged.at(-1)
    if (!previous || interval[0] > previous[1]) merged.push([...interval])
    else previous[1] = Math.max(previous[1], interval[1])
  }
  return merged
}

function subtractIntervals(intervals, blockers) {
  const mergedBlockers = mergeIntervals(blockers)
  const remaining = []
  for (const [start, end] of mergeIntervals(intervals)) {
    let cursor = start
    for (const [blockStart, blockEnd] of mergedBlockers) {
      if (blockEnd <= cursor) continue
      if (blockStart >= end) break
      if (blockStart > cursor) remaining.push([cursor, Math.min(blockStart, end)])
      cursor = Math.max(cursor, blockEnd)
      if (cursor >= end) break
    }
    if (cursor < end) remaining.push([cursor, end])
  }
  return remaining
}

function durationOf(intervals) {
  return mergeIntervals(intervals).reduce((total, [start, end]) => total + secondsBetween(start, end), 0)
}

function timestamp(record) {
  const value = Date.parse(record?.time)
  return Number.isFinite(value) ? value : undefined
}

function commandDuration(attempt) {
  return Number.isFinite(attempt.durationSec) && attempt.durationSec >= 0
    ? attempt.durationSec
    : secondsBetween(attempt.start, attempt.end)
}

export function readAgentRunRecords(paths) {
  const records = []
  for (const inputPath of paths) {
    const source = readFileSync(inputPath, 'utf8')
    for (const [lineIndex, line] of source.split(/\r?\n/).entries()) {
      if (!line.trim()) continue
      try {
        const record = JSON.parse(line)
        if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Invalid record')
        records.push(record)
      } catch {
        records.push({
          time: new Date(0).toISOString(),
          task: '__invalid__',
          phase: '__invalid__',
          event: '__invalid__',
          parseError: `${inputPath}:${lineIndex + 1}`,
        })
      }
    }
  }
  return records
}

export function listAgentRunLogPaths(directory = resolve('output', 'agent-runs')) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name) === '.jsonl')
    .map((entry) => resolve(directory, entry.name))
    .sort()
}

export function summarizeAgentRun(records, task, options = {}) {
  const now = options.now instanceof Date ? options.now.getTime() : Date.parse(options.now ?? new Date().toISOString())
  if (!Number.isFinite(now)) throw new Error('Invalid report end timestamp')
  const issues = []
  let hasLegacyRecords = false
  const selected = records
    .map((record, index) => ({ record, index, at: timestamp(record) }))
    .filter(({ record, at }) => {
      if (record?.parseError) issues.push(`无法解析日志：${record.parseError}`)
      if (record?.task !== task) return false
      if (at === undefined) issues.push(`日志时间无效：${record.phase}/${record.event}`)
      return at !== undefined
    })
    .sort((left, right) => left.at - right.at || left.index - right.index)

  if (!selected.length) throw new Error(`没有找到任务日志：${task}`)
  const lastAt = selected.at(-1).at
  const openEnd = Math.max(lastAt, now)

  const phaseStates = new Map()
  const phaseIntervals = new Map()
  const waitIntervals = []
  const commandAttempts = []
  const directCommands = new Map()

  const stateFor = (phase) => {
    if (!phaseStates.has(phase)) phaseStates.set(phase, { activeStart: undefined, wait: undefined })
    return phaseStates.get(phase)
  }
  const addPhaseInterval = (phase, start, end) => {
    if (!phaseIntervals.has(phase)) phaseIntervals.set(phase, [])
    phaseIntervals.get(phase).push([start, end])
  }
  const closeWait = (state, record, at) => {
    if (!state.wait) return false
    if (record.event === 'resume' && ((record.step ?? '') !== (state.wait.step ?? '')
      || (record.attempt !== undefined && record.attempt !== state.wait.attempt))) {
      issues.push(`等待恢复的步骤或尝试不匹配：${record.phase}/${state.wait.step ?? ''}`)
    }
    if (record.event === 'resume' && state.wait.step && !['pass', 'fail', 'skip'].includes(record.result)) {
      issues.push(`命令恢复缺少结果：${record.phase}/${state.wait.step}`)
    }
    const interval = {
      phase: record.phase,
      kind: state.wait.kind,
      step: state.wait.step,
      command: state.wait.command,
      attempt: state.wait.attempt,
      result: record.result ?? (terminalEvents.has(record.event) ? record.event : 'unknown'),
      durationSec: record.durationSec,
      durationSource: record.durationSource,
      start: state.wait.start,
      end: at,
    }
    waitIntervals.push(interval)
    if (interval.step) commandAttempts.push(interval)
    state.wait = undefined
    return true
  }

  for (const { record, at } of selected) {
    if (record.schemaVersion !== 2) hasLegacyRecords = true
    if (!phaseEvents.has(record.event)) {
      issues.push(`日志事件无效：${record.phase}/${record.event}`)
      continue
    }
    if (record.schemaVersion !== undefined && ![1, 2].includes(record.schemaVersion)) issues.push(`日志版本未知：${record.schemaVersion}`)
    if (!phases.has(record.phase) || (record.step !== undefined && (typeof record.step !== 'string' || !record.step))
      || (record.commands !== undefined && (!Array.isArray(record.commands) || record.commands.some((command) => typeof command !== 'string')))) {
      issues.push(`日志阶段、步骤或命令格式无效：${record.phase}`)
      continue
    }
    if (record.attempt !== undefined && (!Number.isInteger(record.attempt) || record.attempt < 1 || !record.step)) {
      issues.push(`命令尝试编号无效：${record.phase}/${record.step ?? ''}`)
    }
    const phase = record.phase
    const state = stateFor(phase)
    const stepKey = record.step ? `${phase}\u0000${record.step}` : undefined

    if (record.step && record.event === 'start') {
      if (directCommands.has(stepKey)) issues.push(`命令重复开始：${phase}/${record.step}`)
      else directCommands.set(stepKey, { start: at, record })
      continue
    }
    if (record.step && terminalEvents.has(record.event)) {
      const command = directCommands.get(stepKey)
      if (!command) issues.push(`命令缺少开始：${phase}/${record.step}`)
      else {
        commandAttempts.push({
          phase,
          kind: record.waitKind ?? 'tool',
          step: record.step,
          command: record.commands?.[0] ?? command.record.commands?.[0],
          attempt: record.attempt ?? command.record.attempt ?? 1,
          result: record.event,
          durationSec: record.durationSec,
          durationSource: record.durationSource,
          start: command.start,
          end: at,
        })
        directCommands.delete(stepKey)
      }
      continue
    }

    if (record.event === 'start') {
      if (state.activeStart !== undefined || state.wait) issues.push(`阶段重复开始：${phase}`)
      else state.activeStart = at
      continue
    }
    if (record.event === 'pause') {
      if (!waitKinds.has(record.waitKind)) issues.push(`等待分类无效：${phase}/${record.waitKind ?? ''}`)
      if (state.activeStart === undefined) issues.push(`阶段暂停前未处于活跃状态：${phase}`)
      else {
        addPhaseInterval(phase, state.activeStart, at)
        state.activeStart = undefined
      }
      if (state.wait) issues.push(`阶段重复暂停：${phase}`)
      else {
        state.wait = {
          start: at,
          kind: record.waitKind ?? 'unknown',
          step: record.step,
          command: record.commands?.[0],
          attempt: record.attempt ?? 1,
        }
      }
      continue
    }
    if (record.event === 'resume') {
      if (!closeWait(state, record, at)) issues.push(`阶段恢复前没有等待：${phase}`)
      if (state.activeStart !== undefined) issues.push(`阶段恢复时已经活跃：${phase}`)
      else state.activeStart = at
      continue
    }
    if (terminalEvents.has(record.event)) {
      const closedWait = closeWait(state, record, at)
      if (state.activeStart !== undefined) {
        addPhaseInterval(phase, state.activeStart, at)
        state.activeStart = undefined
      } else if (!closedWait && Number.isFinite(record.durationSec) && record.durationSec > 0) {
        addPhaseInterval(phase, at - record.durationSec * 1000, at)
        hasLegacyRecords = true
        issues.push(`阶段缺少开始，仅按 durationSec 推算：${phase}`)
      } else if (!closedWait && record.event !== 'skip') {
        issues.push(`阶段结束前未处于活跃状态：${phase}`)
      }
    }
  }

  const unfinished = []
  for (const [phase, state] of phaseStates) {
    if (state.activeStart !== undefined) {
      unfinished.push({ phase, state: 'active', since: new Date(state.activeStart).toISOString() })
      addPhaseInterval(phase, state.activeStart, openEnd)
    }
    if (state.wait) {
      unfinished.push({ phase, state: 'waiting', waitKind: state.wait.kind, step: state.wait.step, since: new Date(state.wait.start).toISOString() })
      const interval = { phase, ...state.wait, end: openEnd, result: 'open' }
      waitIntervals.push(interval)
      if (interval.step) commandAttempts.push(interval)
    }
  }
  for (const { record, start } of directCommands.values()) {
    unfinished.push({ phase: record.phase, state: 'command', step: record.step, since: new Date(start).toISOString() })
    commandAttempts.push({ phase: record.phase, step: record.step, command: record.commands?.[0], attempt: record.attempt ?? 1, start, end: openEnd, result: 'open' })
  }

  const allActiveIntervals = [...phaseIntervals.values()].flat()
  const activeUnion = mergeIntervals(allActiveIntervals)
  const allWaitIntervals = waitIntervals.map(({ start, end }) => [start, end])
  const exclusiveWaitIntervals = subtractIntervals(allWaitIntervals, activeUnion)
  const firstAt = Math.min(selected[0].at, ...allActiveIntervals.map(([start]) => start))
  const wallEnd = unfinished.length ? openEnd : lastAt
  const wallClockSec = secondsBetween(firstAt, wallEnd)
  const activeSec = durationOf(activeUnion)
  const waitingSec = durationOf(exclusiveWaitIntervals)
  const waitByKind = {}
  for (const kind of new Set(waitIntervals.map((entry) => entry.kind))) {
    waitByKind[kind] = durationOf(subtractIntervals(
      waitIntervals.filter((entry) => entry.kind === kind).map(({ start, end }) => [start, end]),
      activeUnion,
    ))
  }

  const phaseTotals = [...phaseIntervals.entries()]
    .map(([phase, intervals]) => ({ phase, activeSec: durationOf(intervals) }))
    .sort((left, right) => right.activeSec - left.activeSec || left.phase.localeCompare(right.phase))

  const commandGroups = new Map()
  for (const attempt of commandAttempts) {
    const key = `${attempt.phase}\u0000${attempt.step}`
    if (!commandGroups.has(key)) commandGroups.set(key, [])
    commandGroups.get(key).push(attempt)
  }
  const commands = [...commandGroups.values()]
    .map((attempts) => {
      const ordered = attempts.sort((left, right) => left.start - right.start)
      return {
        phase: ordered[0].phase,
        step: ordered[0].step,
        command: ordered.find((attempt) => attempt.command)?.command,
        totalSec: ordered.reduce((total, attempt) => total + commandDuration(attempt), 0),
        attempts: ordered.length,
        retries: Math.max(0, ordered.length - 1),
        failures: ordered.filter((attempt) => attempt.result === 'fail').length,
        result: ordered.at(-1).result,
        runs: ordered.map((attempt) => ({
          attempt: attempt.attempt,
          result: attempt.result,
          startedAt: new Date(attempt.start).toISOString(),
          endedAt: new Date(attempt.end).toISOString(),
          durationSec: commandDuration(attempt),
          durationSource: attempt.durationSource ?? (attempt.durationSec !== undefined ? 'record' : 'timestamps'),
        })),
      }
    })
    .sort((left, right) => right.totalSec - left.totalSec || left.step.localeCompare(right.step))

  const confidence = unfinished.length || issues.length ? 'low' : hasLegacyRecords ? 'medium' : 'high'
  return {
    task,
    startedAt: new Date(firstAt).toISOString(),
    endedAt: new Date(wallEnd).toISOString(),
    wallClockSec,
    activeSec,
    waitingSec,
    unclassifiedSec: Math.max(0, wallClockSec - activeSec - waitingSec),
    waitPercent: wallClockSec ? (waitingSec / wallClockSec) * 100 : 0,
    waitByKind,
    phases: phaseTotals,
    longestPhase: phaseTotals[0] ?? null,
    commands,
    longestCommand: commands[0] ?? null,
    failedAttempts: commandAttempts.filter((attempt) => attempt.result === 'fail').length,
    unfinished,
    issues,
    dataConfidence: confidence,
    legacyCompatible: hasLegacyRecords,
  }
}

function formatSeconds(value) {
  return `${Math.round(value * 10) / 10}s`
}

export function formatAgentRunSummary(summary) {
  const lines = [
    `任务：${summary.task}`,
    `记录区间：${summary.startedAt} → ${summary.endedAt}`,
    `墙钟耗时：${formatSeconds(summary.wallClockSec)}`,
    `活跃耗时：${formatSeconds(summary.activeSec)}`,
    `等待耗时：${formatSeconds(summary.waitingSec)} (${Math.round(summary.waitPercent * 10) / 10}%)`,
    `数据可信度：${summary.dataConfidence}`,
  ]
  if (summary.longestPhase) lines.push(`最长阶段：${summary.longestPhase.phase} (${formatSeconds(summary.longestPhase.activeSec)})`)
  if (summary.longestCommand) lines.push(`最长命令：${summary.longestCommand.step} (${formatSeconds(summary.longestCommand.totalSec)}，重试 ${summary.longestCommand.retries} 次)`)
  const waits = Object.entries(summary.waitByKind).filter(([, seconds]) => seconds > 0)
  if (waits.length) lines.push(`等待分类：${waits.map(([kind, seconds]) => `${kind} ${formatSeconds(seconds)}`).join('，')}`)
  if (summary.failedAttempts) lines.push(`失败尝试：${summary.failedAttempts}`)
  if (summary.unclassifiedSec) lines.push(`未分类耗时：${formatSeconds(summary.unclassifiedSec)}`)
  if (summary.unfinished.length) lines.push(`未闭合记录（暂计至报告时间）：${summary.unfinished.map((entry) => `${entry.phase}/${entry.state}${entry.step ? `/${entry.step}` : ''}`).join('，')}`)
  if (summary.issues.length) lines.push(`数据问题：${summary.issues.join('；')}`)
  if (summary.legacyCompatible) lines.push('兼容提示：包含旧格式记录，无法可靠拆分其中的等待时间。')
  return lines.join('\n')
}
