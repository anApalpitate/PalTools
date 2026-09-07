import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, readFile, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'

const defaultRoot = resolve(import.meta.dirname, '..')
const inputDirectories = ['src', 'script', 'cli', 'pipeline', 'tests', 'public']
const rootInput = (name) => name === '.nvmrc' || name === 'index.html' || /^\.env(?:\.|$)/.test(name)
  || /\.(?:json|[cm]?[jt]s|ico|png|svg)$/.test(name)

async function filesUnder(root, path) {
  let entries
  try {
    entries = await readdir(resolve(root, path), { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
  const files = []
  for (const entry of entries) {
    const child = `${path}/${entry.name}`
    if (entry.isSymbolicLink()) throw new Error(`Cannot verify symbolic link: ${child}`)
    if (entry.isDirectory()) files.push(...await filesUnder(root, child))
    else if (entry.isFile()) files.push(child)
  }
  return files
}

async function digestFiles(root, files) {
  const entries = await Promise.all([...new Set(files)].sort().map(async (path) => [path, createHash('sha256').update(await readFile(resolve(root, path))).digest('hex')]))
  return createHash('sha256').update(JSON.stringify([process.version, process.platform, process.arch, entries])).digest('hex')
}

export async function fingerprintInputs(root) {
  const files = (await Promise.all(inputDirectories.map((path) => filesUnder(root, path)))).flat()
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!rootInput(entry.name)) continue
    if (entry.isSymbolicLink()) throw new Error(`Cannot verify symbolic link: ${entry.name}`)
    if (entry.isFile()) files.push(entry.name)
  }
  const raw = 'data/raw/palcalc/breeding.json'
  try { await access(resolve(root, raw)); files.push(raw) } catch (error) { if (error.code !== 'ENOENT') throw error }
  return digestFiles(root, files)
}

async function fingerprintArtifacts(root, web) {
  const protocol = 'build/electron/provider-protocol.cjs'
  const files = [protocol]
  if (web) {
    await access(resolve(root, 'build/web/index.html'))
    files.push(...await filesUnder(root, 'build/web'))
  }
  return digestFiles(root, files)
}

export function runVerificationCommand({ executable, args, cwd, env }) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(executable, args, { cwd, env, stdio: 'inherit', windowsHide: true })
    const interrupt = () => child.kill('SIGINT')
    const terminate = () => child.kill('SIGTERM')
    process.once('SIGINT', interrupt)
    process.once('SIGTERM', terminate)
    const cleanup = () => {
      process.removeListener('SIGINT', interrupt)
      process.removeListener('SIGTERM', terminate)
    }
    child.once('error', (error) => { cleanup(); rejectRun(error) })
    child.once('close', (code, signal) => { cleanup(); resolveRun({ code: code ?? 1, signal }) })
  })
}

export function createVerificationSession({ root = defaultRoot, run = runVerificationCommand, log = console.log } = {}) {
  const environment = { ...process.env }
  const npmCli = environment.npm_execpath ?? resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
  const results = []
  let webReceipt
  let protocolReceipt
  let failed = false

  function ensureUsable() {
    if (failed) throw new Error('Cannot reuse a failed session; start a new verification command.')
  }

  function invalidate() {
    failed = true
    webReceipt = undefined
    protocolReceipt = undefined
  }

  async function checked(action) {
    ensureUsable()
    try { return await action() } catch (error) { invalidate(); throw error }
  }

  async function timed(id, action) {
    const started = performance.now()
    let code = 1
    try {
      const result = await action()
      code = 0
      return result
    } finally {
      const durationSec = Number(((performance.now() - started) / 1000).toFixed(3))
      results.push({ id, code, durationSec })
      log(`[verify:${id}] exit ${code}; ${durationSec}s`)
    }
  }

  async function execute(id, args) {
    return timed(id, async () => {
      const result = await run({ id, executable: process.execPath, args, cwd: root, env: environment })
      if (result.code !== 0) throw new Error(`${id} failed (${result.signal ?? `exit ${result.code}`})`)
    })
  }

  async function assertCurrent(receipt, web) {
    if (await fingerprintInputs(root) !== receipt.inputs) throw new Error('Verification inputs changed; refusing to reuse the prepared build.')
    if (await fingerprintArtifacts(root, web) !== receipt.artifacts) throw new Error('Verification artifacts changed; refusing to reuse the prepared build.')
  }

  async function prepareWeb() {
    return checked(async () => {
      if (webReceipt) {
        await assertCurrent(webReceipt, true)
        log('[verify:build] Reusing verified artifacts from this session.')
        return
      }
      const inputs = await fingerprintInputs(root)
      await execute('build', [npmCli, 'run', 'build'])
      if (await fingerprintInputs(root) !== inputs) throw new Error('Verification inputs changed while building; no reusable result was recorded.')
      webReceipt = { inputs, artifacts: await fingerprintArtifacts(root, true) }
      protocolReceipt = { inputs, artifacts: await fingerprintArtifacts(root, false), contract: true }
    })
  }

  async function prepareProtocol({ contract = false } = {}) {
    return checked(async () => {
      if (protocolReceipt) {
        await assertCurrent(protocolReceipt, false)
        if (contract && !protocolReceipt.contract) {
          await execute('protocol-contract-check', [resolve(root, 'script/test-electron-provider-protocol.cjs')])
          await assertCurrent(protocolReceipt, false)
          protocolReceipt.contract = true
        }
        return
      }
      const inputs = await fingerprintInputs(root)
      await execute(contract ? 'protocol-contract' : 'protocol-build', [npmCli, 'run', contract ? 'test:electron-provider-protocol' : 'build:electron-provider-protocol'])
      if (await fingerprintInputs(root) !== inputs) throw new Error('Verification inputs changed while building protocol; no reusable result was recorded.')
      protocolReceipt = { inputs, artifacts: await fingerprintArtifacts(root, false), contract }
    })
  }

  async function consumeWeb(id, action) {
    return checked(async () => {
      await prepareWeb()
      const result = await timed(id, action)
      await assertCurrent(webReceipt, true)
      return result
    })
  }

  async function consumeProtocol(id, args, contract) {
    return checked(async () => {
      if (webReceipt) await assertCurrent(webReceipt, true)
      await prepareProtocol({ contract })
      await execute(id, args)
      await assertCurrent(protocolReceipt, false)
      if (webReceipt) await assertCurrent(webReceipt, true)
    })
  }

  return {
    prepareWeb,
    prepareProtocol,
    consumeWeb,
    invalidate,
    get results() { return [...results] },
    smokeElectron: () => consumeProtocol('electron-smoke', [resolve(root, 'node_modules/electron/cli.js'), '.', '--paltools-smoke-test'], false),
    packageElectron: () => consumeProtocol('electron-package', [resolve(root, 'node_modules/electron-builder/cli.js'), '--win', 'portable', '--x64', '--config.electronDist=build/cache/electron-dist-win32-x64'], true),
  }
}
