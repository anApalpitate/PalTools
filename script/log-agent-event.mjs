import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

const phases = new Set(['investigate', 'plan', 'implement', 'verify', 'docs', 'commit'])
const events = new Set(['start', 'done', 'pass', 'fail', 'skip'])

function usage() {
  console.log(`Usage: npm.cmd run agent:log -- --task <name> --phase <phase> --event <event> [options]

Phases: investigate, plan, implement, verify, docs, commit
Events: start, done, pass, fail, skip
Options:
  --duration-sec <seconds>
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

function elapsedSinceStart(outputPath, values, now) {
  if (values.durationSec !== undefined || values.event === 'start' || !existsSync(outputPath)) return values.durationSec
  const previous = readFileSync(outputPath, 'utf8')
    .trim()
    .split('\n')
    .reverse()
    .map((line) => JSON.parse(line))
    .find((record) => record.task === values.task && record.phase === values.phase && record.event === 'start')
  if (!previous) return undefined
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
    time: now.toISOString(),
    task: values.task,
    phase: values.phase,
    event: values.event,
  }
  const durationSec = elapsedSinceStart(outputPath, values, now)
  if (durationSec !== undefined) record.durationSec = durationSec
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
