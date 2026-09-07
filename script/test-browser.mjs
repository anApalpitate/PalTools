import { spawn } from 'node:child_process'
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createVerificationSession } from './verification-session.mjs'

const repoRoot = resolve(import.meta.dirname, '..')
export const availableScenes = ['paldex', 'breeding', 'assistant', 'theme', 'shared']

export function parseBrowserArguments(args) {
  if (args.length > 1 || (args.length === 1 && !args[0].startsWith('--scenes='))) {
    throw new Error('Usage: npm run test:browser -- [--scenes=paldex,breeding,assistant,theme,shared]')
  }
  const scenes = args.length ? [...new Set(args[0].slice('--scenes='.length).split(','))] : [...availableScenes]
  if (scenes.some((scene) => !availableScenes.includes(scene))) throw new Error('Unknown or empty browser scene')
  return scenes
}

export async function runBrowserRegression({ scenes = [...availableScenes], verificationSession = createVerificationSession() } = {}) {
  if (!scenes.length || scenes.some((scene) => !availableScenes.includes(scene))) throw new Error('Unknown or empty browser scene')
  const artifactRoot = resolve(repoRoot, 'output', 'playwright', 'browser-regression')
  const browserRoot = resolve(repoRoot, '.playwright-browsers')
  const daemonRoot = resolve(repoRoot, '.playwright-cli', 'daemon')
  const scenarioFile = resolve(repoRoot, 'tests', 'e2e', 'paltools-browser-regression.js')
  const viteCli = resolve(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js')
  const npmCli = process.env.npm_execpath
  const baseUrl = 'http://127.0.0.1:4173'
  const session = `paltools-browser-${process.pid}`
  const cliPackage = '@playwright/cli@0.1.19'
  const selectedScenarioFile = resolve(artifactRoot, 'selected-scenarios.js')

  if (!npmCli) throw new Error('test:browser must be invoked through npm.cmd/npm')

  await Promise.all([
    access(viteCli),
    access(scenarioFile),
    mkdir(artifactRoot, { recursive: true }),
    mkdir(browserRoot, { recursive: true }),
    mkdir(daemonRoot, { recursive: true }),
  ])

  const environment = {
    ...process.env,
    PALTOOLS_NPM_CACHE: resolve(repoRoot, '.npm-cache'),
    npm_config_cache: resolve(repoRoot, '.npm-cache'),
    PLAYWRIGHT_BROWSERS_PATH: browserRoot,
    PWTEST_DAEMON_SESSION_DIR: daemonRoot,
  }

  let previewProcess
  let previewWasStarted = false
  let sessionOpened = false
  let activeProcess
  let cleanupPromise

  function run(command, args, {
    cwd = repoRoot,
    timeoutMs = 10 * 60_000,
    allowFailure = false,
    capture = false,
  } = {}) {
    return new Promise((resolveRun, rejectRun) => {
      const child = spawnManaged(command, args, cwd, capture)
      activeProcess = child
      let stdout = ''
      let stderr = ''
      if (capture) {
        child.stdout.on('data', (chunk) => {
          const text = chunk.toString()
          stdout += text
          process.stdout.write(text)
        })
        child.stderr.on('data', (chunk) => {
          const text = chunk.toString()
          stderr += text
          process.stderr.write(text)
        })
      }
      const timer = setTimeout(() => {
        child.kill()
        rejectRun(new Error(`${command} ${args.join(' ')} exceeded ${timeoutMs} ms`))
      }, timeoutMs)
      child.once('error', (error) => {
        clearTimeout(timer)
        if (activeProcess === child) activeProcess = undefined
        rejectRun(error)
      })
      child.once('close', (code, signal) => {
        clearTimeout(timer)
        if (activeProcess === child) activeProcess = undefined
        if (code === 0 || allowFailure) {
          resolveRun({ code, signal, stdout, stderr })
          return
        }
        rejectRun(new Error(`${command} ${args.join(' ')} failed (${signal ?? `exit ${code}`})`))
      })
    })
  }

  function spawnManaged(command, args, cwd, capture) {
    return spawn(command, args, {
      cwd,
      env: environment,
      windowsHide: true,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })
  }

  async function runNpm(args, options) {
    return run(process.execPath, [npmCli, ...args], options)
  }

  async function runPlaywright(args, options) {
    return runNpm(
      ['exec', '--yes', '--package', cliPackage, '--', 'playwright-cli', ...args],
      options,
    )
  }

  async function waitForPreview() {
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      if (previewProcess.exitCode !== null) {
        throw new Error(`Vite preview exited before readiness (exit ${previewProcess.exitCode})`)
      }
      try {
        const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1_000) })
        if (response.ok) return
      } catch {
        // Preview is still starting.
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 250))
    }
    throw new Error(`Vite preview did not become ready at ${baseUrl}`)
  }

  async function stopPreview() {
    const child = previewProcess
    previewProcess = undefined
    if (!child || child.exitCode !== null) return
    child.kill()
    await Promise.race([
      new Promise((resolveClose) => child.once('close', resolveClose)),
      new Promise((resolveWait) => setTimeout(resolveWait, 5_000)),
    ])
    if (child.exitCode === null) child.kill('SIGKILL')
  }

  async function assertPreviewStopped() {
    const deadline = Date.now() + 5_000
    while (Date.now() < deadline) {
      try {
        await fetch(baseUrl, { signal: AbortSignal.timeout(500) })
      } catch {
        return
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 200))
    }
    throw new Error(`Preview remains reachable after cleanup: ${baseUrl}`)
  }

  async function cleanup() {
    cleanupPromise ??= (async () => {
      activeProcess?.kill()
      activeProcess = undefined
      if (sessionOpened) {
        await runPlaywright([`-s=${session}`, 'close'], {
          allowFailure: true,
          timeoutMs: 30_000,
        }).catch(() => undefined)
      }
      await stopPreview()
    })()
    return cleanupPromise
  }

  const signalHandlers = []
  let completed = false
  try {
    await verificationSession.consumeWeb('browser', async () => {
      for (const [signal, exitCode] of [['SIGINT', 130], ['SIGTERM', 143]]) {
        const handler = () => { void cleanup().finally(() => process.exit(exitCode)) }
        signalHandlers.push([signal, handler])
        process.once(signal, handler)
      }

      const cachedBrowsers = await readdir(browserRoot)
      if (cachedBrowsers.some((name) => /^chromium-\d+$/.test(name))) {
        console.log(`Reusing Chromium from ${browserRoot}.`)
      } else {
        console.log(`Preparing Chromium in ${browserRoot}...`)
        await runPlaywright(['install-browser', 'chromium'], { timeoutMs: 15 * 60_000 })
      }

      console.log(`Starting managed Vite preview at ${baseUrl}...`)
      previewProcess = spawnManaged(
        process.execPath,
        [viteCli, 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
        repoRoot,
        true,
      )
      previewWasStarted = true
      previewProcess.stdout.on('data', (chunk) => process.stdout.write(chunk))
      previewProcess.stderr.on('data', (chunk) => process.stderr.write(chunk))
      await waitForPreview()

      const scenario = await readFile(scenarioFile, 'utf8')
      await writeFile(selectedScenarioFile, `async (page) => (${scenario.trim()})(page, ${JSON.stringify(scenes)})\n`, 'utf8')
      console.log(`Selected browser scenes: ${scenes.join(', ')}`)
      console.log(`Running named Playwright CLI session ${session}...`)
      await runPlaywright([`-s=${session}`, 'open', `${baseUrl}/#/paldex`, '--browser', 'chromium'], {
        timeoutMs: 60_000,
      })
      sessionOpened = true
      const result = await runPlaywright(
        [`-s=${session}`, 'run-code', `--filename=${selectedScenarioFile}`],
        { capture: true, timeoutMs: 10 * 60_000 },
      )
      await writeFile(resolve(artifactRoot, 'result.txt'), result.stdout, 'utf8')
      const summaryBlock = result.stdout.match(/### Result\r?\n([\s\S]*?)(?=\r?\n### |$)/)
      const summary = summaryBlock ? JSON.parse(summaryBlock[1]) : undefined
      if (summary?.status !== 'passed' || JSON.stringify(summary.scenes) !== JSON.stringify(scenes)) {
        throw new Error('Browser scenario did not return its completion summary; it may have been interrupted by a dialog.')
      }
      completed = true
    })
  } finally {
    try {
      await cleanup()
      if (previewWasStarted) await assertPreviewStopped()
    } catch (error) {
      verificationSession.invalidate()
      throw error
    } finally {
      for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler)
    }
  }

  if (completed) {
    console.log(`Browser regression passed; artifacts: ${artifactRoot}`)
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await runBrowserRegression({ scenes: parseBrowserArguments(process.argv.slice(2)) })
}
