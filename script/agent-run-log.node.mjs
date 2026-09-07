import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { formatAgentRunSummary, listAgentRunLogPaths, readAgentRunRecords, summarizeAgentRun } from './agent-run-log.mjs'

const task = 'fixed-task'
const epoch = Date.parse('2026-09-07T15:59:00.000Z')
const at = (seconds) => new Date(epoch + seconds * 1000).toISOString()
const event = (seconds, phase, kind, extra = {}) => ({ schemaVersion: 2, time: at(seconds), task, phase, event: kind, ...extra })
const summarize = (records, seconds = 120) => summarizeAgentRun(records, task, { now: at(seconds) })

test('normal completion preserves timestamp evidence and disjoint phase duration', () => {
  const report = summarize([event(0, 'plan', 'start'), event(10, 'plan', 'done'), event(15, 'implement', 'start'), event(40, 'implement', 'done')])
  assert.equal(report.wallClockSec, 40)
  assert.equal(report.activeSec, 35)
  assert.equal(report.unclassifiedSec, 5)
  assert.equal(report.dataConfidence, 'high')
  assert.deepEqual(report.longestPhase, { phase: 'implement', activeSec: 25 })
  assert.equal(report.startedAt, at(0))
  assert.equal(report.endedAt, at(40))
})

test('parallel phases use interval unions, and work during another phase wait remains active', () => {
  const report = summarize([
    event(0, 'implement', 'start'), event(5, 'verify', 'start'),
    event(10, 'verify', 'pause', { waitKind: 'tool' }), event(20, 'implement', 'done'),
    event(30, 'verify', 'resume'), event(40, 'verify', 'pass'),
  ])
  assert.equal(report.wallClockSec, 40)
  assert.equal(report.activeSec, 30)
  assert.equal(report.waitingSec, 10)
  assert.equal(report.waitByKind.tool, 10)
})

test('cross-day pause/resume separates every supported waiting source', () => {
  const kinds = ['tool', 'user', 'approval', 'service', 'interruption']
  const records = [event(0, 'implement', 'start')]
  for (const [index, waitKind] of kinds.entries()) {
    records.push(event(10 + index * 20, 'implement', 'pause', { waitKind }))
    records.push(event(20 + index * 20, 'implement', 'resume'))
  }
  records.push(event(110, 'implement', 'done'))
  const report = summarize(records)
  assert.equal(report.wallClockSec, 110)
  assert.equal(report.activeSec, 60)
  assert.equal(report.waitingSec, 50)
  assert.deepEqual(report.waitByKind, Object.fromEntries(kinds.map((kind) => [kind, 10])))
  assert.equal(report.dataConfidence, 'high')
})

test('a terminal event while paused closes waiting without reclassifying it as active', () => {
  const report = summarize([
    event(0, 'verify', 'start'), event(10, 'verify', 'pause', { waitKind: 'service' }),
    event(30, 'verify', 'fail', { durationSec: 30 }),
  ])
  assert.equal(report.activeSec, 10)
  assert.equal(report.waitingSec, 20)
  assert.equal(report.dataConfidence, 'high')
  assert.deepEqual(report.issues, [])
})

test('named validation attempts retain failure, retry and concrete command bottlenecks', () => {
  const report = summarize([
    event(0, 'verify', 'start'),
    event(5, 'verify', 'pause', { waitKind: 'tool', step: 'focused-tests', commands: ['node --test focused.node.mjs'], attempt: 1 }),
    event(15, 'verify', 'resume', { step: 'focused-tests', result: 'fail', attempt: 1 }),
    event(20, 'verify', 'pause', { waitKind: 'tool', step: 'focused-tests', attempt: 2 }),
    event(40, 'verify', 'resume', { step: 'focused-tests', result: 'pass', attempt: 2 }),
    event(45, 'verify', 'pass'),
  ])
  assert.equal(report.activeSec, 15)
  assert.equal(report.waitingSec, 30)
  assert.equal(report.failedAttempts, 1)
  assert.equal(report.longestCommand.step, 'focused-tests')
  assert.equal(report.longestCommand.totalSec, 30)
  assert.equal(report.longestCommand.attempts, 2)
  assert.equal(report.longestCommand.retries, 1)
  assert.equal(report.longestCommand.result, 'pass')
  assert.equal(report.longestCommand.command, 'node --test focused.node.mjs')
  assert.match(formatAgentRunSummary(report), /失败尝试：1/)
})

test('direct command boundaries report duration without adding it to parent active time', () => {
  const report = summarize([
    event(0, 'verify', 'start'), event(5, 'verify', 'start', { step: 'build' }),
    event(20, 'verify', 'pass', { step: 'build' }), event(30, 'verify', 'pass'),
  ])
  assert.equal(report.activeSec, 30)
  assert.equal(report.longestCommand.totalSec, 15)
  assert.equal(report.waitingSec, 0)
})

test('unclosed stages, waits and commands are explicitly provisional', () => {
  const report = summarize([
    event(0, 'implement', 'start'), event(10, 'verify', 'start'),
    event(20, 'verify', 'pause', { waitKind: 'tool', step: 'focused-tests' }),
    event(25, 'docs', 'start', { step: 'lint' }),
  ], 50)
  assert.equal(report.wallClockSec, 50)
  assert.equal(report.activeSec, 50)
  assert.equal(report.dataConfidence, 'low')
  assert.equal(report.unfinished.length, 3)
  assert.match(formatAgentRunSummary(report), /未闭合记录/)
  assert.equal(report.commands.find((command) => command.step === 'lint')?.result, 'open')
})

test('legacy logs remain readable but do not claim precise waiting data', () => {
  const records = [event(0, 'implement', 'start'), event(40, 'implement', 'done', { durationSec: 40 })]
  records.forEach((record) => delete record.schemaVersion)
  const report = summarize(records)
  assert.equal(report.activeSec, 40)
  assert.equal(report.dataConfidence, 'medium')
  assert.equal(report.legacyCompatible, true)
  assert.match(formatAgentRunSummary(report), /无法可靠拆分其中的等待时间/)
})

test('legacy duration without a start is bounded by its inferred start and is marked uncertain', () => {
  const report = summarize([{ time: at(40), task, phase: 'verify', event: 'pass', durationSec: 30 }])
  assert.equal(report.startedAt, at(10))
  assert.equal(report.wallClockSec, 30)
  assert.equal(report.activeSec, 30)
  assert.equal(report.dataConfidence, 'low')
  assert.match(report.issues.join('\n'), /缺少开始/)
})

test('invalid timestamps and events lower confidence rather than silently disappearing', () => {
  const report = summarize([
    event(0, 'verify', 'start'), { ...event(5, 'verify', 'pause'), time: 'invalid' },
    event(10, 'verify', 'unexpected'), event(30, 'verify', 'done'),
  ])
  assert.equal(report.dataConfidence, 'low')
  assert.match(report.issues.join('\n'), /时间/)
  assert.match(report.issues.join('\n'), /事件/)
})

test('mismatched command resume cannot silently claim a reliable report', () => {
  const report = summarize([
    event(0, 'verify', 'start'), event(10, 'verify', 'pause', { waitKind: 'tool', step: 'build', attempt: 1 }),
    event(20, 'verify', 'resume', { step: 'other', result: 'pass', attempt: 2 }), event(30, 'verify', 'pass'),
  ])
  assert.equal(report.dataConfidence, 'low')
  assert.match(report.issues.join('\n'), /不匹配/)
})

test('duplicate and unpaired boundaries lower confidence without double-counting active intervals', () => {
  const report = summarize([
    event(0, 'verify', 'start'), event(5, 'verify', 'start'),
    event(10, 'verify', 'pause', { waitKind: 'tool' }), event(15, 'verify', 'pause', { waitKind: 'tool' }),
    event(20, 'verify', 'resume'), event(25, 'verify', 'resume'), event(30, 'verify', 'done'),
    event(35, 'verify', 'done'), event(40, 'docs', 'done', { step: 'lint' }),
  ])
  assert.equal(report.activeSec, 20)
  assert.equal(report.waitingSec, 10)
  assert.equal(report.dataConfidence, 'low')
  assert.equal(report.issues.length, 7)
})

test('measured command duration overrides coordination time without altering active or wait intervals', () => {
  const report = summarize([
    event(0, 'verify', 'start'),
    event(5, 'verify', 'pause', { waitKind: 'tool', step: 'full-tests' }),
    event(65, 'verify', 'resume', { step: 'full-tests', result: 'pass', durationSec: 23.41, durationSource: 'override' }),
    event(70, 'verify', 'start', { step: 'build' }),
    event(80, 'verify', 'pass', { step: 'build', durationSec: 4.2 }),
    event(90, 'verify', 'done'),
  ])
  assert.equal(report.activeSec, 30)
  assert.equal(report.waitingSec, 60)
  assert.equal(report.longestCommand.totalSec, 23.41)
  assert.equal(report.longestCommand.runs[0].startedAt, at(5))
  assert.equal(report.longestCommand.runs[0].endedAt, at(65))
  assert.equal(report.longestCommand.runs[0].durationSource, 'override')
  assert.equal(report.commands.find((command) => command.step === 'build').totalSec, 4.2)
})

test('invalid field types are reported safely, and invalid report end is rejected', () => {
  const report = summarize([
    event(0, 'verify', 'start'), event(5, 'verify', 'start', { step: 42 }),
    event(6, 'verify', 'start', { commands: 'bad' }), event(30, 'verify', 'done'),
  ])
  assert.equal(report.activeSec, 30)
  assert.equal(report.dataConfidence, 'low')
  assert.equal(report.issues.length, 2)
  assert.throws(() => summarizeAgentRun([event(0, 'plan', 'start')], task, { now: 'invalid' }), /timestamp/)
})

test('malformed JSON and non-object records are reported without crashing valid task summaries', () => {
  withFixture((directory) => {
    const path = join(directory, '2026-09-08.jsonl')
    writeFileSync(path, `${JSON.stringify(event(0, 'verify', 'start'))}\nnull\n[]\n{bad\n${JSON.stringify(event(30, 'verify', 'pass'))}\n`)
    const report = summarize(readAgentRunRecords([path]))
    assert.equal(report.activeSec, 30)
    assert.equal(report.issues.length, 3)
    assert.equal(report.dataConfidence, 'low')
  })
})

test('report CLI reads explicit cross-day files and produces JSON with failures on invalid input', () => {
  withFixture((directory) => {
    const first = join(directory, '2026-09-07.jsonl')
    const second = join(directory, '2026-09-08.jsonl')
    writeFileSync(first, `${JSON.stringify(event(0, 'implement', 'start'))}\n`)
    writeFileSync(second, `${JSON.stringify(event(100, 'implement', 'done'))}\n`)
    assert.deepEqual(listAgentRunLogPaths(directory), [first, second])
    const report = run('report-agent-run.mjs', ['--task', task, '--input', second, '--input', first, '--json'], directory)
    assert.equal(report.status, 0, report.stderr)
    assert.equal(JSON.parse(report.stdout).wallClockSec, 100)
    const invalid = run('report-agent-run.mjs', ['--task', task, '--now', 'invalid'], directory)
    assert.equal(invalid.status, 1)
    assert.match(invalid.stderr, /--now/)
    const missing = run('report-agent-run.mjs', ['--task', task, '--input', join(directory, 'missing.jsonl')], directory)
    assert.equal(missing.status, 1)
    const partlyMissing = run('report-agent-run.mjs', ['--task', task, '--input', first, '--input', join(directory, 'missing.jsonl')], directory)
    assert.equal(partlyMissing.status, 1)
  })
})

test('logger pairs phase pauses independently of step names, and never reuses a completed start', () => {
  withFixture((directory) => {
    const logs = join(directory, 'output', 'agent-runs')
    mkdirSync(logs, { recursive: true })
    const old = { ...event(0, 'verify', 'start'), time: new Date(Date.now() - 10000).toISOString() }
    writeFileSync(join(logs, '2000-01-01.jsonl'), `${JSON.stringify(old)}\n`)
    const pause = run('log-agent-event.mjs', ['--task', task, '--phase', 'verify', '--event', 'pause', '--wait-kind', 'tool', '--step', 'build'], directory)
    assert.equal(pause.status, 0, pause.stderr)
    let records = readAgentRunRecords(listAgentRunLogPaths(logs))
    assert.ok(records.at(-1).durationSec >= 9)
    for (const args of [
      ['--event', 'resume', '--step', 'build', '--result', 'pass'],
      ['--event', 'done'], ['--event', 'done'],
    ]) {
      const result = run('log-agent-event.mjs', ['--task', task, '--phase', 'verify', ...args], directory)
      assert.equal(result.status, 0, result.stderr)
    }
    records = readAgentRunRecords(listAgentRunLogPaths(logs))
    assert.equal(typeof records.at(-2).durationSec, 'number')
    assert.equal(records.at(-1).durationSec, undefined)
  })
})

test('logger validates wait/attempt/result options and preserves v2 metadata', () => {
  withFixture((directory) => {
    for (const args of [
      ['--event', 'pause'], ['--event', 'start', '--wait-kind', 'tool'],
      ['--event', 'resume', '--step', 'build'], ['--event', 'start', '--attempt', '0'],
      ['--event', 'done', '--result', 'pass'], ['--event', 'done', '--duration-sec', '-1'],
    ]) {
      assert.equal(run('log-agent-event.mjs', ['--task', task, '--phase', 'verify', ...args], directory).status, 1)
    }
    const result = run('log-agent-event.mjs', [
      '--task', task, '--phase', 'verify', '--event', 'start', '--step', 'build', '--attempt', '2',
      '--file', 'script/build.mjs', '--command', 'npm.cmd run build', '--note', 'fixed metadata',
    ], directory)
    assert.equal(result.status, 0, result.stderr)
    const [record] = readAgentRunRecords(listAgentRunLogPaths(join(directory, 'output', 'agent-runs')))
    assert.equal(record.schemaVersion, 2)
    assert.equal(record.attempt, 2)
    assert.deepEqual(record.commands, ['npm.cmd run build'])
    assert.deepEqual(record.files, ['script/build.mjs'])
    assert.equal(record.note, 'fixed metadata')
  })
})

function run(script, args, cwd) {
  return spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], { cwd, encoding: 'utf8' })
}

function withFixture(runFixture) {
  const parent = resolve('output', 'agent-run-tests')
  mkdirSync(parent, { recursive: true })
  const directory = mkdtempSync(join(parent, 'case-'))
  try {
    return runFixture(directory)
  } finally {
    const child = relative(parent, resolve(directory))
    assert.ok(child && !child.startsWith('..') && !isAbsolute(child), 'Fixture cleanup must remain in the test output directory')
    rmSync(directory, { recursive: true, force: true })
  }
}
