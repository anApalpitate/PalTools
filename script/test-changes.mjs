import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'
import { categories, createTestPlan } from './test-impact.mjs'

const repoRoot = resolve(import.meta.dirname, '..')

export function parseArguments(args) {
  const options = { plan: false, files: [], requestedCategories: [], delivery: false, task: 'test-changes' }
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--plan') options.plan = true
    else if (argument === '--delivery') options.delivery = true
    else if (argument === '--help') options.help = true
    else {
      const match = argument.match(/^--(files|category|task)(?:=(.*))?$/)
      if (!match) throw new Error(`Unknown argument: ${argument}`)
      const value = match[2] ?? args[++index]
      if (!value || value.startsWith('--')) throw new Error(`Missing value for --${match[1]}`)
      if (match[1] === 'task') options.task = value
      else {
        const values = value.split(',').map((part) => part.trim())
        if (values.some((part) => !part)) throw new Error(`Empty value for --${match[1]}`)
        options[match[1] === 'files' ? 'files' : 'requestedCategories'].push(...values)
      }
    }
  }
  for (const category of options.requestedCategories) if (!categories.includes(category)) throw new Error(`Unknown test category: ${category}`)
  return options
}

function gitFiles(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
  if (result.error || result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.error?.message ?? result.stderr.trim()}`)
  return result.stdout.split('\0').filter(Boolean)
}

export function discoverChanges(root) {
  return [...new Set([
    ...gitFiles(root, ['diff', '--no-renames', '--name-only', '-z', 'HEAD']),
    ...gitFiles(root, ['diff', '--no-renames', '--name-only', '-z', '--cached']),
    ...gitFiles(root, ['diff', '--no-renames', '--name-only', '-z']),
    ...gitFiles(root, ['ls-files', '--others', '--exclude-standard', '-z']),
  ])].sort()
}

export function loadRepository(root, explicitFiles = []) {
  const tracked = gitFiles(root, ['ls-files', '-z'])
  const untracked = gitFiles(root, ['ls-files', '--others', '--exclude-standard', '-z'])
  const files = [...new Set([...tracked, ...untracked, ...explicitFiles])].filter((file) => existsSync(resolve(root, file)))
  const sources = {}
  for (const file of files) {
    if (/^(?:src|cli|pipeline|script)\//.test(file) && /\.(?:[cm]?[jt]sx?)$/.test(file)) sources[file] = readFileSync(resolve(root, file), 'utf8')
  }
  return { files, sources }
}

function normalizedFiles(root, paths) {
  return paths.map((file) => {
    const result = relative(root, isAbsolute(file) ? file : resolve(root, file)).replaceAll('\\', '/')
    if (!result || result === '..' || result.startsWith('../') || isAbsolute(result)) throw new Error(`File must be inside the repository: ${file}`)
    return result
  })
}

function npmLocation() {
  const candidates = [process.env.npm_execpath, resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')]
  const found = candidates.find((candidate) => candidate && existsSync(candidate))
  if (!found) throw new Error('Cannot locate npm CLI; invoke this entry point through npm run test:changes')
  return found
}

function runProcess(command, args, root) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', windowsHide: true })
    const forward = (signal) => child.kill(signal)
    const onInterrupt = () => forward('SIGINT')
    const onTerminate = () => forward('SIGTERM')
    process.once('SIGINT', onInterrupt)
    process.once('SIGTERM', onTerminate)
    const clean = () => {
      process.removeListener('SIGINT', onInterrupt)
      process.removeListener('SIGTERM', onTerminate)
    }
    child.once('error', (error) => { clean(); rejectRun(error) })
    child.once('close', (code, signal) => { clean(); resolveRun({ code: code ?? (signal === 'SIGINT' ? 130 : 1), signal }) })
  })
}

function logCommandBoundary(root, task, command, event, durationSec) {
  const args = [resolve(repoRoot, 'script/log-agent-event.mjs'), '--task', task, '--phase', 'verify', '--step', command.id, '--event', event, '--command', `${command.executable} ${command.args.join(' ')}`]
  if (durationSec !== undefined) args.push('--duration-sec', String(durationSec))
  const logged = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', windowsHide: true })
  if (logged.error || logged.status !== 0) throw new Error(`Cannot record validation boundary: ${logged.error?.message ?? logged.stderr.trim()}`)
}

export async function executePlan(plan, { root = repoRoot, task = 'test-changes', run = runProcess, logBoundary = logCommandBoundary } = {}) {
  const output = resolve(root, 'output', 'test-impact')
  mkdirSync(output, { recursive: true })
  const logPath = resolve(output, `${new Date().toISOString().replaceAll(':', '-')}-${process.pid}.jsonl`)
  appendFileSync(logPath, `${JSON.stringify({ event: 'plan', task, timestamp: new Date().toISOString(), plan })}\n`)
  const results = []
  for (const command of plan.commands) {
    const display = `${command.executable} ${command.args.join(' ')}`
    console.log(`\n[${command.id}] ${display}\n${command.reasons.join('; ')}`)
    logBoundary(root, task, command, 'start')
    const started = performance.now()
    let result
    try {
      const executable = command.executable === 'npm' || command.executable === 'node' ? process.execPath : command.executable
      const args = command.executable === 'npm' ? [npmLocation(), ...command.args] : command.args
      result = await run(executable, args, root)
    } catch (error) {
      result = { code: 1, error: error.message }
      console.error(error.message)
    }
    const record = { event: 'command', task, timestamp: new Date().toISOString(), id: command.id, command: display, durationSec: Number(((performance.now() - started) / 1000).toFixed(3)), ...result }
    results.push(record)
    appendFileSync(logPath, `${JSON.stringify(record)}\n`)
    logBoundary(root, task, command, record.code === 0 ? 'pass' : 'fail', record.durationSec)
    console.log(`[${command.id}] exit ${record.code}; ${record.durationSec}s`)
    if (record.code !== 0) return { code: record.code, results, logPath }
  }
  return { code: 0, results, logPath }
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args)
  if (options.help) {
    console.log(`Usage: npm run test:changes -- [--plan] [--files=file,...] [--category=${categories.join(',')}] [--delivery] [--task=name]\nWithout --files or --category, includes staged, unstaged, untracked, deleted and renamed paths. --category runs the complete category; --delivery adds affected production/browser/Electron checks. Commands stop on the first failure and write output/test-impact/*.jsonl.`)
    return 0
  }
  const changedFiles = options.files.length ? normalizedFiles(repoRoot, options.files) : options.requestedCategories.length ? [] : discoverChanges(repoRoot)
  const plan = createTestPlan({ ...loadRepository(repoRoot, changedFiles), changedFiles, requestedCategories: options.requestedCategories, delivery: options.delivery })
  console.log(JSON.stringify(plan, null, 2))
  if (options.plan) return 0
  const result = await executePlan(plan, { task: options.task })
  console.log(`Verification log: ${result.logPath}`)
  return result.code
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().then((code) => { process.exitCode = code }).catch((error) => { console.error(error.message); process.exitCode = 1 })
}
