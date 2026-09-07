import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { access, mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { createVerificationSession } from './verification-session.mjs'
import { parseVerificationArgs, runVerification } from './verify.mjs'

test('one session builds once and still executes browser, source smoke and packaging', async () => {
  await fixture(async ({ root, run, commands }) => {
    const session = createVerificationSession({ root, run, log: () => {} })
    await runVerification({ browser: ['breeding'], electron: true, packageElectron: true }, {
      session,
      browser: async ({ scenes, verificationSession }) => {
        assert.deepEqual(scenes, ['breeding'])
        await verificationSession.prepareWeb()
        await verificationSession.consumeWeb('browser', async () => commands.push('browser'))
      },
    })
    assert.deepEqual(commands, ['build', 'browser', 'electron-smoke', 'electron-package'])
    assert.equal(session.results.filter((result) => result.id === 'build').length, 1)
    assert.ok(session.results.every((result) => result.durationSec >= 0))
  })
})

for (const file of ['src/App.tsx', 'script/build.mjs', 'cli/main.ts', 'pipeline/data/validate.ts', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.app.json', '.nvmrc', '.env.local', 'public/data/manifest.json', 'data/raw/palcalc/breeding.json']) {
  test(`rejects changed input before consumption: ${file}`, async () => {
    await fixture(async ({ root, run, commands }) => {
      const session = createVerificationSession({ root, run, log: () => {} })
      await session.prepareWeb()
      await write(root, file, 'changed')
      await assert.rejects(session.smokeElectron(), /inputs changed/)
      assert.deepEqual(commands, ['build'])
    })
  })
}

for (const change of ['add-env', 'delete-env', 'add-source', 'delete-source', 'change-output', 'delete-output', 'add-output', 'change-protocol']) {
  test(`rejects path and artifact changes: ${change}`, async () => {
    await fixture(async ({ root, run, commands }) => {
      const session = createVerificationSession({ root, run, log: () => {} })
      await session.prepareWeb()
      if (change === 'add-env') await write(root, '.env.production', 'new')
      if (change === 'delete-env') await rm(resolve(root, '.env.local'))
      if (change === 'add-source') await write(root, 'src/added.ts', 'new')
      if (change === 'delete-source') await rm(resolve(root, 'src/App.tsx'))
      if (change === 'change-output') await write(root, 'build/web/index.html', 'changed')
      if (change === 'delete-output') await rm(resolve(root, 'build/web/index.html'))
      if (change === 'add-output') await write(root, 'build/web/stale.js', 'unexpected')
      if (change === 'change-protocol') await write(root, 'build/electron/provider-protocol.cjs', 'changed')
      await assert.rejects(session.consumeWeb('browser', async () => commands.push('browser')))
      assert.deepEqual(commands, ['build'])
    })
  })
}

test('documentation and ordinary ignored outputs do not invalidate the build', async () => {
  await fixture(async ({ root, run, commands }) => {
    const session = createVerificationSession({ root, run, log: () => {} })
    await session.prepareWeb()
    await write(root, 'README.md', 'documentation')
    await write(root, 'docs/reference/checks.md', 'documentation')
    await write(root, 'output/agent-runs/events.jsonl', 'log')
    await write(root, 'tsconfig.app.tsbuildinfo', 'compiler cache')
    await session.smokeElectron()
    assert.deepEqual(commands, ['build', 'electron-smoke'])
  })
})

test('a new session rebuilds even when matching artifacts already exist', async () => {
  await fixture(async ({ root, run, commands }) => {
    await createVerificationSession({ root, run, log: () => {} }).prepareWeb()
    await createVerificationSession({ root, run, log: () => {} }).prepareWeb()
    assert.deepEqual(commands, ['build', 'build'])
  })
})

test('standalone smoke builds protocol and standalone packaging builds and tests protocol', async () => {
  await fixture(async ({ root, run, commands }) => {
    await createVerificationSession({ root, run, log: () => {} }).smokeElectron()
    await createVerificationSession({ root, run, log: () => {} }).packageElectron()
    assert.deepEqual(commands, ['protocol-build', 'electron-smoke', 'protocol-contract', 'electron-package'])
  })
})

test('failed or interrupted preparation never produces reusable state', async () => {
  await fixture(async ({ root, commands }) => {
    const session = createVerificationSession({ root, log: () => {}, run: async ({ id }) => { commands.push(id); return { code: 1 } } })
    await assert.rejects(session.prepareWeb(), /failed/)
    await assert.rejects(session.prepareWeb(), /failed session/)
    assert.deepEqual(commands, ['build'])
  })
})

test('a source change during preparation rejects a successful exit', async () => {
  await fixture(async ({ root, run }) => {
    const session = createVerificationSession({ root, log: () => {}, run: async (command) => {
      await run(command)
      await write(root, 'src/App.tsx', 'changed while building')
      return { code: 0 }
    } })
    await assert.rejects(session.prepareWeb(), /inputs changed/)
    await assert.rejects(session.smokeElectron(), /failed session/)
  })
})

test('a failed consumer and changed output during a consumer invalidate the session', async () => {
  await fixture(async ({ root, run }) => {
    const failed = createVerificationSession({ root, run, log: () => {} })
    await failed.prepareWeb()
    await assert.rejects(failed.consumeWeb('browser', async () => { throw new Error('browser failed') }), /browser failed/)
    await assert.rejects(failed.smokeElectron(), /failed session/)
    const changed = createVerificationSession({ root, run, log: () => {} })
    await changed.prepareWeb()
    await assert.rejects(changed.consumeWeb('browser', () => write(root, 'build/web/index.html', 'changed')), /artifacts changed/)
  })
})

test('a successful build with missing required outputs is not accepted', async () => {
  await fixture(async ({ root }) => {
    const session = createVerificationSession({ root, log: () => {}, run: async () => ({ code: 0 }) })
    await assert.rejects(session.prepareWeb(), /ENOENT/)
  })
})

test('CLI keeps independent modes and validates explicit browser scenes', () => {
  assert.deepEqual(parseVerificationArgs(['--browser=breeding,assistant', '--electron']), { browser: ['breeding', 'assistant'], electron: true, packageElectron: false })
  assert.deepEqual(parseVerificationArgs(['smoke']), { standalone: 'smoke' })
  assert.deepEqual(parseVerificationArgs(['package-electron']), { standalone: 'package-electron' })
  assert.equal(parseVerificationArgs(['--package']).packageElectron, true)
  assert.equal(parseVerificationArgs(['--browser']).browser.length, 5)
  for (const args of [[], ['--skip-build'], ['smoke', '--electron'], ['--browser='], ['--browser=unknown']]) {
    assert.throws(() => parseVerificationArgs(args))
  }
})

test('importing the browser entry point creates no directories or signal handlers', async () => {
  await fixture(async ({ root }) => {
    await write(root, 'script/test-browser.mjs', await readFile(new URL('./test-browser.mjs', import.meta.url), 'utf8'))
    await write(root, 'script/verification-session.mjs', await readFile(new URL('./verification-session.mjs', import.meta.url), 'utf8'))
    await write(root, 'probe.mjs', `
      const before = ['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal))
      const module = await import('./script/test-browser.mjs')
      let invalidScenesRejected = false
      try { module.parseBrowserArguments(['--scenes=']) } catch { invalidScenesRejected = true }
      console.log(JSON.stringify({
        exportType: typeof module.runBrowserRegression,
        defaultScenes: module.parseBrowserArguments([]),
        selectedScenes: module.parseBrowserArguments(['--scenes=breeding']),
        invalidScenesRejected,
        before,
        after: ['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal)),
      }))
    `)
    const child = spawnSync(process.execPath, ['probe.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true })
    assert.equal(child.status, 0, child.error?.message ?? child.stderr)
    const result = JSON.parse(child.stdout)
    assert.equal(result.exportType, 'function')
    assert.deepEqual(result.defaultScenes, ['paldex', 'breeding', 'assistant', 'theme', 'shared'])
    assert.deepEqual(result.selectedScenes, ['breeding'])
    assert.equal(result.invalidScenesRejected, true)
    assert.deepEqual(result.after, result.before)
    for (const directory of ['output', '.playwright-browsers', '.playwright-cli']) await assert.rejects(access(resolve(root, directory)), /ENOENT/)
  })
})

async function fixture(callback) {
  const parent = resolve(tmpdir())
  const root = await mkdtemp(resolve(parent, 'paltools-verification-'))
  try {
    for (const path of ['src/App.tsx', 'script/build.mjs', 'cli/main.ts', 'pipeline/data/validate.ts', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.app.json', '.nvmrc', '.env.local', 'public/data/manifest.json', 'data/raw/palcalc/breeding.json']) await write(root, path, 'fixture')
    const commands = []
    const run = async ({ id }) => {
      commands.push(id)
      if (id === 'build') await write(root, 'build/web/index.html', 'production')
      if (['build', 'protocol-build', 'protocol-contract'].includes(id)) await write(root, 'build/electron/provider-protocol.cjs', 'protocol')
      return { code: 0 }
    }
    await callback({ root, run, commands })
  } finally {
    const child = relative(parent, root)
    assert.ok(child && !child.startsWith('..') && !isAbsolute(child))
    await rm(root, { recursive: true, force: true })
  }
}

async function write(root, path, content) {
  const target = resolve(root, path)
  await mkdir(resolve(target, '..'), { recursive: true })
  await writeFile(target, content)
}
