import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const buildRoot = resolve(repoRoot, 'build')
const releaseRoot = resolve(buildRoot, 'release')
const npmCli = process.env.npm_execpath

function assertBuildChild(target, expectedName) {
  if (
    !target.startsWith(`${buildRoot}${sep}`) ||
    dirname(target) !== buildRoot ||
    target.slice(buildRoot.length + 1) !== expectedName
  ) {
    throw new Error(`Refusing to clean unexpected artifact directory: ${target}`)
  }
}

function run(command, args, environment = process.env) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: environment,
      stdio: 'inherit',
    })
    child.once('error', rejectProcess)
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolveProcess()
        return
      }
      rejectProcess(
        new Error(`${command} ${args.join(' ')} failed (${signal ?? `exit ${code}`})`),
      )
    })
  })
}

function smokeTest(executable) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(executable, ['--paltools-smoke-test'], {
      cwd: repoRoot,
      env: { ...process.env, PALTOOLS_SMOKE_TEST: '1' },
      stdio: 'inherit',
    })
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      rejectProcess(new Error('Packaged application smoke test exceeded 30 seconds'))
    }, 30_000)
    child.once('error', (error) => {
      clearTimeout(timeout)
      rejectProcess(error)
    })
    child.once('close', (code, signal) => {
      clearTimeout(timeout)
      if (code === 0) {
        resolveProcess()
        return
      }
      rejectProcess(
        new Error(`Packaged application smoke test failed (${signal ?? `exit ${code}`})`),
      )
    })
  })
}

function sha256(file) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256')
    const stream = createReadStream(file)
    stream.once('error', rejectHash)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.once('end', () => resolveHash(hash.digest('hex')))
  })
}

async function main() {
  if (process.platform !== 'darwin') {
    throw new Error('package:mac must run on macOS')
  }
  if (Number.parseInt(process.versions.node, 10) < 22) {
    throw new Error(`package:mac requires Node.js 22 or newer (found ${process.version})`)
  }
  if (!npmCli) {
    throw new Error('package:mac must be invoked through npm')
  }
  try {
    await Promise.all([
      access(resolve(repoRoot, 'data', 'raw', 'palcalc', 'breeding.json')),
      access(resolve(repoRoot, 'public', 'generated')),
    ])
  } catch {
    throw new Error(
      'package:mac requires the local data/raw snapshot and public/generated assets; restore them before packaging',
    )
  }

  const webRoot = resolve(buildRoot, 'web')
  assertBuildChild(webRoot, 'web')
  assertBuildChild(releaseRoot, 'release')
  await Promise.all([rm(webRoot, { recursive: true, force: true }), rm(releaseRoot, { recursive: true, force: true })])

  const packageEnvironment = {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    ELECTRON_BUILDER_CACHE: resolve(tmpdir(), 'paltools-electron-builder'),
  }

  await run(
    process.execPath,
    [npmCli, 'run', 'test', '--', '--maxWorkers=1'],
    packageEnvironment,
  )
  await run(process.execPath, [npmCli, 'run', 'build'], packageEnvironment)
  await run(
    process.execPath,
    [npmCli, 'run', 'package:mac:electron'],
    packageEnvironment,
  )

  const app = resolve(releaseRoot, 'mac-arm64', 'PalTools.app')
  const executable = resolve(app, 'Contents', 'MacOS', 'PalTools')
  const localeDirectory = resolve(
    app,
    'Contents',
    'Frameworks',
    'Electron Framework.framework',
    'Versions',
    'A',
    'Resources',
  )
  await access(executable)
  const locales = (await readdir(localeDirectory))
    .filter((name) => name.endsWith('.lproj'))
    .sort()
  const expectedLocales = ['en.lproj']
  if (locales.join('\n') !== expectedLocales.join('\n')) {
    throw new Error(`Unexpected Electron locale set: ${locales.join(', ')}`)
  }

  await smokeTest(executable)

  const artifacts = (await readdir(releaseRoot))
    .filter((name) => name.endsWith('.dmg'))
    .sort()
  if (artifacts.length !== 1) {
    throw new Error(`Expected one DMG artifact, found: ${artifacts.join(', ')}`)
  }
  const artifact = resolve(releaseRoot, artifacts[0])
  const hash = await sha256(artifact)
  console.log(`\nPackaging complete: ${artifact}`)
  console.log(`SHA-256: ${hash}`)
}

await main()
