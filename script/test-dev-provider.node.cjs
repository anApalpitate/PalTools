const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const Module = require('node:module')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function profile(id, overrides = {}) {
  return {
    schemaVersion: 2, id, presetId: 'custom', displayName: id,
    transport: 'openai-chat', baseUrl: 'https://provider.invalid/v1',
    defaultModelId: 'synthetic-model', authMode: 'bearer', timeoutMs: 5000,
    models: [{ modelId: 'synthetic-model', enabled: true, contextTurns: 2, capabilityMode: 'retrieval-only', extraBody: {} }],
    extraHeaders: {}, ...overrides,
  }
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'paltools-provider-state-'))
  const handlers = new Map()
  const requests = []
  const hooks = { read: null, write: null, rename: null, encrypt: null, fetch: null }
  let encryptionAvailable = false
  let reEncrypt = false
  const app = { isPackaged: true, commandLine: { hasSwitch: () => false }, getPath: () => root }
  const gatewayPath = require.resolve('./electron/agent-gateway.cjs')
  const originalLoad = Module._load
  const originalFetch = global.fetch
  const gatewayFs = {
    ...fs,
    readFile: async (...args) => { if (hooks.read) await hooks.read(...args); return fs.readFile(...args) },
    writeFile: async (...args) => { if (hooks.write) await hooks.write(...args); return fs.writeFile(...args) },
    rename: async (...args) => { if (hooks.rename) await hooks.rename(...args); return fs.rename(...args) },
  }
  Module._load = function mockedLoad(request, parent, isMain) {
    if (parent?.filename === gatewayPath) {
      if (request === 'electron') return {
        app,
        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
        safeStorage: {
          isAsyncEncryptionAvailable: async () => encryptionAvailable,
          encryptStringAsync: async (key) => { if (hooks.encrypt) await hooks.encrypt(key); return Buffer.from(`encrypted:${key}`) },
          decryptStringAsync: async (key) => ({ result: key.toString().replace(/^encrypted:/, ''), shouldReEncrypt: reEncrypt }),
        },
      }
      if (request === 'node:fs/promises') return gatewayFs
      if (request === '../development/dev-provider.cjs') return {
        loadDevelopmentProvider: async () => ({ profile: profile('paltools-managed-development-deepseek'), apiKey: 'synthetic-managed-key' }),
      }
      if (request.endsWith('build/electron/provider-protocol.cjs')) return {
        buildProviderStreamRequest: (selected, key, requestBody) => {
          requests.push({ profile: selected, key, request: requestBody })
          return { url: `${selected.baseUrl}/chat/completions`, headers: {}, body: {} }
        },
        createProviderStreamAccumulator: () => ({ push: () => [], result: () => ({ text: 'ok', toolCalls: [] }) }),
        parseProviderResponse: () => ({ text: 'ok', toolCalls: [] }),
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  global.fetch = async (...args) => {
    if (hooks.fetch) return hooks.fetch(...args)
    return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  delete require.cache[gatewayPath]
  require(gatewayPath).registerAgentGateway()
  t.after(async () => {
    Module._load = originalLoad
    global.fetch = originalFetch
    delete require.cache[gatewayPath]
    await fs.rm(root, { recursive: true, force: true })
  })
  const call = (name, ...args) => handlers.get(`paltools-agent:${name}`)(null, ...args)
  const event = { sender: { id: 17, isDestroyed: () => false, send: () => {} } }
  return {
    root, hooks, requests, event,
    save: (value, key) => call('save-profile', value, key),
    remove: (id) => call('remove-profile', id),
    setDefault: (id) => call('set-default-profile', id),
    list: () => handlers.get('paltools-agent:list-profiles')(),
    complete: (id, requestId = 'request-1') => handlers.get('paltools-agent:complete')(event, id, { messages: [], tools: [] }, requestId),
    cancel: (requestId = 'request-1') => handlers.get('paltools-agent:cancel')(event, requestId),
    state: async () => JSON.parse(await fs.readFile(path.join(root, 'agent-providers.json'), 'utf8')),
    encryption: (value) => { encryptionAvailable = value },
    reEncrypt: (value) => { reEncrypt = value },
    development: (value) => { app.isPackaged = !value },
  }
}

test('concurrent saves preserve both profiles and first default', async (t) => {
  const f = await fixture(t)
  const entered = deferred()
  const release = deferred()
  let writes = 0
  f.hooks.write = async () => { if (++writes === 1) { entered.resolve(); await release.promise } }
  const first = f.save(profile('first'), 'synthetic-first-key')
  await entered.promise
  const second = f.save(profile('second'), 'synthetic-second-key')
  release.resolve()
  await Promise.all([first, second])
  const snapshot = await f.list()
  assert.deepEqual(snapshot.profiles.map((value) => value.id), ['first', 'second'])
  assert.equal(snapshot.defaultProfileId, 'first')
  assert.equal((await f.state()).profiles.length, 2)
})

test('save, remove and default changes share invocation order', async (t) => {
  const f = await fixture(t)
  await f.save(profile('keep'), 'synthetic-keep-key')
  await f.save(profile('remove'), 'synthetic-remove-key')
  const entered = deferred()
  const release = deferred()
  let writes = 0
  f.hooks.write = async () => { if (++writes === 1) { entered.resolve(); await release.promise } }
  const saved = f.save(profile('keep', { displayName: 'updated' }))
  await entered.promise
  const removed = f.remove('remove')
  const defaulted = f.setDefault('keep')
  release.resolve()
  await Promise.all([saved, removed, defaulted])
  const state = await f.state()
  assert.deepEqual(state.profiles.map((row) => row.profile.id), ['keep'])
  assert.equal(state.profiles[0].profile.displayName, 'updated')
  assert.equal(state.defaultProfileId, 'keep')
})

for (const operation of ['write', 'rename']) {
  test(`${operation} failure preserves the previous file and session credential, and the queue recovers`, async (t) => {
    const f = await fixture(t)
    await f.save(profile('saved'), 'synthetic-original-key')
    const before = await fs.readFile(path.join(f.root, 'agent-providers.json'), 'utf8')
    f.hooks[operation] = async (target) => {
      if (operation === 'write') await fs.writeFile(target, 'partial synthetic content')
      throw new Error(`synthetic ${operation} failure`)
    }
    await assert.rejects(f.save(profile('saved', { displayName: 'must-not-commit' }), 'synthetic-replacement-key'), /synthetic/)
    f.hooks[operation] = null
    assert.equal(await fs.readFile(path.join(f.root, 'agent-providers.json'), 'utf8'), before)
    assert.deepEqual(await fs.readdir(f.root), ['agent-providers.json'])
    await f.complete('saved')
    assert.equal(f.requests.at(-1).key, 'synthetic-original-key')
    await f.save(profile('next'), 'synthetic-next-key')
    assert.equal((await f.state()).profiles.length, 2)
  })
}

test('failed endpoint change and remove retain the original credential', async (t) => {
  const f = await fixture(t)
  await f.save(profile('saved'), 'synthetic-original-key')
  f.hooks.write = async () => { throw new Error('synthetic disk failure') }
  await assert.rejects(f.save(profile('saved', { baseUrl: 'https://other.invalid/v1' })), /synthetic/)
  await assert.rejects(f.remove('saved'), /synthetic/)
  f.hooks.write = null
  await f.complete('saved')
  assert.equal(f.requests.at(-1).key, 'synthetic-original-key')
  assert.equal(f.requests.at(-1).profile.baseUrl, 'https://provider.invalid/v1')
})

test('failed persisted default change retains the managed session default', async (t) => {
  const f = await fixture(t)
  f.development(true)
  await f.save(profile('saved'), 'synthetic-original-key')
  await f.setDefault('paltools-managed-development-deepseek')
  f.hooks.rename = async () => { throw new Error('synthetic rename failure') }
  await assert.rejects(f.setDefault('saved'), /synthetic/)
  f.hooks.rename = null
  assert.equal((await f.list()).defaultProfileId, 'paltools-managed-development-deepseek')
  await f.setDefault('saved')
  assert.equal((await f.list()).defaultProfileId, 'saved')
})

test('normalization commits inside the same queue as subsequent saves', async (t) => {
  const f = await fixture(t)
  await fs.writeFile(path.join(f.root, 'agent-providers.json'), JSON.stringify({ schemaVersion: 1, defaultProfileId: 'original', profiles: [{ profile: profile('original', { unknown: 'discard' }) }] }))
  const entered = deferred()
  const release = deferred()
  let writes = 0
  f.hooks.write = async () => { if (++writes === 1) { entered.resolve(); await release.promise } }
  const listed = f.list()
  await entered.promise
  const saved = f.save(profile('new'), 'synthetic-new-key')
  release.resolve()
  await Promise.all([listed, saved])
  assert.deepEqual((await f.state()).profiles.map((row) => row.profile.id), ['original', 'new'])
})

test('credential re-encryption cannot overwrite a concurrent saved profile', async (t) => {
  const f = await fixture(t)
  f.encryption(true)
  await f.save(profile('encrypted'), 'synthetic-encrypted-key')
  f.reEncrypt(true)
  const entered = deferred()
  const release = deferred()
  f.hooks.encrypt = async () => { entered.resolve(); await release.promise }
  const completion = f.complete('encrypted')
  await entered.promise
  const saved = f.save(profile('another', { authMode: 'none' }))
  release.resolve()
  await Promise.all([completion, saved])
  assert.deepEqual((await f.state()).profiles.map((row) => row.profile.id), ['encrypted', 'another'])
  assert.equal(f.requests.at(-1).key, 'synthetic-encrypted-key')
})

test('network work does not hold the configuration queue', async (t) => {
  const f = await fixture(t)
  await f.save(profile('saved'), 'synthetic-original-key')
  const entered = deferred()
  const response = deferred()
  f.hooks.fetch = async () => { entered.resolve(); return response.promise }
  const completion = f.complete('saved')
  await entered.promise
  try {
    await f.save(profile('parallel', { authMode: 'none' }))
    assert.equal((await f.list()).profiles.length, 2)
  } finally { response.resolve(new Response('{}')) }
  await completion
})

test('cancel settles before a blocked configuration write completes and leaves its queue intact', async (t) => {
  const f = await fixture(t)
  await f.save(profile('saved'), 'synthetic-original-key')
  const entered = deferred()
  const release = deferred()
  f.hooks.write = async () => { entered.resolve(); await release.promise }
  const saved = f.save(profile('parallel', { authMode: 'none' }))
  await entered.promise
  const completion = f.complete('saved')
  const rejected = assert.rejects(completion, /已停止生成/)
  let settled = false
  void completion.catch(() => { settled = true })
  try {
    await f.cancel()
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(settled, true, 'cancellation must settle without releasing the unrelated write')
    assert.equal(f.requests.length, 0)
  } finally { release.resolve() }
  await Promise.all([saved, rejected])
  assert.equal(f.requests.length, 0)
  assert.deepEqual((await f.list()).profiles.map((value) => value.id), ['saved', 'parallel'])
  await f.complete('saved', 'after-cancel')
  assert.equal(f.requests.length, 1)
  assert.equal(f.requests[0].key, 'synthetic-original-key')
})

for (const fails of [false, true]) test(`cancelled credential refresh retains the queue until it ${fails ? 'fails' : 'commits'}`, async (t) => {
  const f = await fixture(t)
  f.encryption(true)
  await f.save(profile('encrypted'), 'synthetic-encrypted-key')
  f.reEncrypt(true)
  const entered = deferred()
  const release = deferred()
  f.hooks.encrypt = async () => { entered.resolve(); await release.promise; if (fails) throw new Error('synthetic refresh failure') }
  const completion = f.complete('encrypted')
  const rejected = assert.rejects(completion, /已停止生成/)
  let cancelled = false
  void completion.catch(() => { cancelled = true })
  await entered.promise
  let saved = false
  const saving = f.save(profile('another', { authMode: 'none' })).then(() => { saved = true })
  try {
    await f.cancel()
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(cancelled, true)
    assert.equal(saved, false, 'the cancelled state operation must still serialize subsequent saves')
  } finally { release.resolve() }
  await Promise.all([rejected, saving])
  assert.equal(f.requests.length, 0)
  assert.deepEqual((await f.state()).profiles.map((row) => row.profile.id), ['encrypted', 'another'])
  f.hooks.encrypt = null
  f.reEncrypt(false)
  await f.complete('encrypted', 'after-refresh')
  assert.equal(f.requests.at(-1).key, 'synthetic-encrypted-key')
})

test('replaced queued request cannot unregister a newer request with the same id', async (t) => {
  const f = await fixture(t)
  await f.save(profile('saved'), 'synthetic-original-key')
  const writing = deferred()
  const releaseWrite = deferred()
  f.hooks.write = async () => { writing.resolve(); await releaseWrite.promise }
  const saved = f.save(profile('parallel', { authMode: 'none' }))
  await writing.promise
  const first = f.complete('saved', 'same-id')
  const firstRejected = assert.rejects(first, /已停止生成/)
  const second = f.complete('saved', 'same-id')
  const secondRejected = assert.rejects(second, /已停止生成/)
  const reading = deferred()
  const releaseRead = deferred()
  f.hooks.read = async () => { reading.resolve(); await releaseRead.promise }
  releaseWrite.resolve()
  await reading.promise
  await firstRejected
  await f.cancel('same-id')
  releaseRead.resolve()
  await Promise.all([saved, secondRejected])
  assert.equal(f.requests.length, 0)
})
