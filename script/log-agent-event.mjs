import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { listAgentRunLogPaths, readAgentRunRecords } from './agent-run-log.mjs'

const phases = new Set(['investigate', 'plan', 'implement', 'verify', 'docs', 'commit'])
const events = new Set(['start', 'pause', 'resume', 'done', 'pass', 'fail', 'skip'])
const waitKinds = new Set(['tool', 'user', 'approval', 'service', 'interruption'])
const results = new Set(['pass', 'fail', 'skip'])

function usage() {
  console.log(`Usage: npm.cmd run agent:log -- --task <name> --phase <phase> --event <event> [options]

Phases: investigate, plan, implement, verify, docs, commit
Events: start, pause, resume, done, pass, fail, skip
Options:
  --duration-sec <seconds>
  --wait-kind <kind>       Required for pause: tool, user, approval, service, interruption.
  --step <name>            Name a validation or other high-cost substep.
  --result <result>        Result when resuming a step: pass, fail, skip.
  --attempt <number>       Positive attempt number for a named step.
  --file <path>             Repeat for each affected file.
  --command <summary>       Repeat for each key command; never include secrets.
  --note <summary>
  --help`)
}

function readArgs(argv) {
  const values = { files: [], commands: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index]
    if (option === '--help') {
      values.help = true
      continue
    }
    if (!option.startsWith('--')) throw new Error(`Unknown argument: ${option}`)

    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${option}`)
    index += 1

    if (option === '--file') values.files.push(value)
    else if (option === '--command') values.commands.push(value)
    else if (option === '--task') values.task = value
    else if (option === '--phase') values.phase = value
    else if (option === '--event') values.event = value
    else if (option === '--duration-sec') values.durationSec = Number(value)
    else if (option === '--wait-kind') values.waitKind = value
    else if (option === '--step') values.step = value
    else if (option === '--result') values.result = value
    else if (option === '--attempt') values.attempt = Number(value)
    else if (option === '--note') values.note = value
    else throw new Error(`Unknown option: ${option}`)
  }
  return values
}

function validate(values) {
  if (!values.task) throw new Error('--task is required')
  if (!phases.has(values.phase)) throw new Error(`--phase must be one of: ${[...phases].join(', ')}`)
  if (!events.has(values.event)) throw new Error(`--event must be one of: ${[...events].join(', ')}`)
  if (values.durationSec !== undefined && (!Number.isFinite(values.durationSec) || values.durationSec < 0)) {
    throw new Error('--duration-sec must be a non-negative number')
  }
  if (values.event === 'pause' && !waitKinds.has(values.waitKind)) {
    throw new Error(`pause requires --wait-kind with one of: ${[...waitKinds].join(', ')}`)
  }
  if (values.event !== 'pause' && values.waitKind !== undefined) throw new Error('--wait-kind is only valid with pause')
  if (values.result !== undefined && (values.event !== 'resume' || !results.has(values.result))) {
    throw new Error('--result is only valid with resume and must be pass, fail, or skip')
  }
  if (values.attempt !== undefined && (!Number.isInteger(values.attempt) || values.attempt < 1 || !values.step)) {
    throw new Error('--attempt must be a positive integer and requires --step')
  }
  if (values.event === 'resume' && values.step && !values.result) {
    throw new Error('resume with --step requires --result')
  }
}

function shanghaiDate(now) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function elapsedSinceBoundary(values, now) {
  if (values.durationSec !== undefined) return values.durationSec
  if (values.event === 'start') return undefined
  const records = readAgentRunRecords(listAgentRunLogPaths())
  const isCommandBoundary = (record) => record.step && !['pause', 'resume'].includes(record.event)
  const directCommand = isCommandBoundary(values)
  const keyMatches = (record) => record.task === values.task
    && record.phase === values.phase
    && (directCommand ? isCommandBoundary(record) && record.step === values.step : !isCommandBoundary(record))
  const expected = values.event === 'resume'
    ? new Set(['pause'])
    : new Set(['start', 'resume', ...(values.event === 'pause' ? [] : ['pause'])])
  const previous = records
    .filter((record) => keyMatches(record) && Number.isFinite(Date.parse(record.time)))
    .sort((left, right) => Date.parse(left.time) - Date.parse(right.time))
    .at(-1)
  if (!previous || !expected.has(previous.event)) return undefined
  return Math.max(0, Math.round((now.getTime() - new Date(previous.time).getTime()) / 1000))
}

try {
  const values = readArgs(process.argv.slice(2))
  if (values.help) {
    usage()
    process.exit(0)
  }
  validate(values)

  const now = new Date()
  const outputPath = resolve('output', 'agent-runs', `${shanghaiDate(now)}.jsonl`)
  const record = {
    schemaVersion: 2,
    time: now.toISOString(),
    task: values.task,
    phase: values.phase,
    event: values.event,
  }
  const durationSec = elapsedSinceBoundary(values, now)
  if (durationSec !== undefined) record.durationSec = durationSec
  if (values.durationSec !== undefined) record.durationSource = 'override'
  if (values.waitKind) record.waitKind = values.waitKind
  if (values.step) record.step = values.step
  if (values.result) record.result = values.result
  if (values.attempt) record.attempt = values.attempt
  if (values.files.length) record.files = values.files
  if (values.commands.length) record.commands = values.commands
  if (values.note) record.note = values.note

  mkdirSync(dirname(outputPath), { recursive: true })
  appendFileSync(outputPath, `${JSON.stringify(record)}\n`, 'utf8')
  console.log(`Logged agent event: ${relative(process.cwd(), outputPath)}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  usage()
  process.exit(1)
}
