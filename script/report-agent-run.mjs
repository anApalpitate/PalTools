import { resolve } from 'node:path'
import {
  formatAgentRunSummary,
  listAgentRunLogPaths,
  readAgentRunRecords,
  summarizeAgentRun,
} from './agent-run-log.mjs'

function usage() {
  console.log(`Usage: npm.cmd run agent:report -- --task <name> [options]

Options:
  --input <jsonl>          Repeat to use explicit log files.
  --now <ISO timestamp>   Override the report end for fixed checks.
  --json                  Print machine-readable JSON.
  --help`)
}

function readArgs(argv) {
  const values = { inputs: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index]
    if (option === '--help' || option === '--json') {
      values[option.slice(2)] = true
      continue
    }
    if (!option.startsWith('--')) throw new Error(`Unknown argument: ${option}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${option}`)
    index += 1
    if (option === '--task') values.task = value
    else if (option === '--input') values.inputs.push(resolve(value))
    else if (option === '--now') values.now = value
    else throw new Error(`Unknown option: ${option}`)
  }
  return values
}

try {
  const values = readArgs(process.argv.slice(2))
  if (values.help) {
    usage()
    process.exit(0)
  }
  if (!values.task) throw new Error('--task is required')
  if (values.now && !Number.isFinite(Date.parse(values.now))) throw new Error('--now must be an ISO timestamp')
  const paths = values.inputs.length ? values.inputs : listAgentRunLogPaths()
  const summary = summarizeAgentRun(readAgentRunRecords(paths), values.task, { now: values.now })
  console.log(values.json ? JSON.stringify(summary, null, 2) : formatAgentRunSummary(summary))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  usage()
  process.exit(1)
}
