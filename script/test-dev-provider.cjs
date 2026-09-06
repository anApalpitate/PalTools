const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const Module = require('node:module')
const os = require('node:os')
const path = require('node:path')
const packageMetadata = require('../package.json')
const {
  DEFAULT_DEVELOPMENT_API_PATH,
  DEVELOPMENT_PROFILE_ID,
  MAX_DOCUMENT_BYTES,
  loadDevelopmentProvider,
  parseDevelopmentProviderDocument,
} = require('./development/dev-provider.cjs')

const syntheticKey = 'synthetic-development-key-123456'
const syntheticModel = 'deepseek-synthetic-model'

function assertSafeFailure(action, expected) {
  let failure
  try {
    action()
  } catch (error) {
    failure = error
  }
  assert.ok(failure instanceof Error, 'expected parsing to fail')
  assert.match(failure.message, expected)
  assert.equal(failure.message.includes(syntheticKey), false)
  assert.equal(failure.message.includes(syntheticModel), false)
  return failure
}

async function assertSafeRejection(action, expected) {
  let failure
  try {
    await action()
  } catch (error) {
    failure = error
  }
  assert.ok(failure instanceof Error, 'expected loading to fail')
  assert.match(failure.message, expected)
  assert.equal(failure.message.includes(syntheticKey), false)
  assert.equal(failure.message.includes(syntheticModel), false)
  return failure
}

async function testGatewayBoundary(temporaryRoot, fixture) {
  const handlers = new Map()
  let capturedKey = ''
  let smokeSwitch = false
  let encryptionEnabled = false
  let reEncryptNext = false
  let encryptionGeneration = 0
  let fetchCalls = 0
  let upstreamResponse = () => new Response('{"ok":true}', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
  const fakeApp = {
    isPackaged: false,
    commandLine: { hasSwitch: () => smokeSwitch },
    getPath: (name) => {
      assert.equal(name, 'userData')
      return temporaryRoot
    },
  }
  const originalLoad = Module._load
  const originalFetch = global.fetch
  process.env.PALTOOLS_DEV_API_PATH = fixture
  Module._load = function loadWithElectronBoundaryMock(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: fakeApp,
        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
        safeStorage: {
          isAsyncEncryptionAvailable: async () => encryptionEnabled,
          encryptStringAsync: async (plainText) => Buffer.from(`sealed-${++encryptionGeneration}:${plainText}`, 'utf8'),
          decryptStringAsync: async (encrypted) => {
            const shouldReEncrypt = reEncryptNext
            reEncryptNext = false
            return { result: encrypted.toString('utf8').replace(/^sealed-\d+:/, ''), shouldReEncrypt }
          },
        },
      }
    }
    if (request.endsWith('build/electron/provider-protocol.cjs')) {
      return {
        buildProviderStreamRequest: (_profile, key) => {
          capturedKey = key
          return { url: 'https://provider.invalid/v1/chat/completions', headers: {}, body: {} }
        },
        createProviderStreamAccumulator: () => ({ push: () => [], result: () => ({ text: '', toolCalls: [] }) }),
        parseProviderResponse: (_profile, payload) => {
          if (payload?.error) throw new Error(String(payload.error.message))
          return { text: 'synthetic response', toolCalls: [] }
        },
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  global.fetch = async () => { fetchCalls += 1; return upstreamResponse() }

  const gatewayPath = require.resolve('./electron/agent-gateway.cjs')
  delete require.cache[gatewayPath]
  try {
    require(gatewayPath).registerAgentGateway()
    const listProfiles = handlers.get('paltools-agent:list-profiles')
    const saveProfile = handlers.get('paltools-agent:save-profile')
    const removeProfile = handlers.get('paltools-agent:remove-profile')
    const setDefaultProfile = handlers.get('paltools-agent:set-default-profile')
    const complete = handlers.get('paltools-agent:complete')
    assert.equal(typeof listProfiles, 'function')
    assert.equal(typeof complete, 'function')

    const initial = await listProfiles()
    assert.equal(initial.defaultProfileId, DEVELOPMENT_PROFILE_ID)
    assert.deepEqual(initial.managedProfileIds, [DEVELOPMENT_PROFILE_ID])
    const managed = initial.profiles.find((profile) => profile.id === DEVELOPMENT_PROFILE_ID)
    assert.equal(managed.hasApiKey, true)
    assert.equal(Object.hasOwn(managed, 'apiKey'), false)
    await assert.rejects(() => fs.access(path.join(temporaryRoot, 'agent-providers.json')))

    await assert.rejects(() => saveProfile(null, managed, syntheticKey), /不能保存/)
    await assert.rejects(() => removeProfile(null, DEVELOPMENT_PROFILE_ID), /不能删除/)
    await assert.rejects(() => fs.access(path.join(temporaryRoot, 'agent-providers.json')))

    const result = await complete({ sender: { id: 7, isDestroyed: () => false, send: () => undefined } }, DEVELOPMENT_PROFILE_ID, {
      messages: [{ role: 'user', content: 'synthetic request' }],
      tools: [],
      allowTools: false,
    }, 'synthetic-request')
    assert.equal(result.text, 'synthetic response')
    assert.equal(capturedKey, syntheticKey)
    await assert.rejects(() => fs.access(path.join(temporaryRoot, 'agent-providers.json')))

    const scopedProfile = {
      schemaVersion: 1,
      id: 'session-scoped-profile',
      presetId: 'custom',
      displayName: 'Session scoped profile',
      transport: 'openai-chat',
      baseUrl: 'https://first-provider.example/v1',
      model: 'synthetic-model',
      authMode: 'bearer',
      timeoutMs: 60000,
      contextTurns: 12,
      capabilityMode: 'retrieval-only',
      extraHeaders: {},
      extraBody: {},
    }
    const request = { messages: [{ role: 'user', content: 'scope test' }], tools: [], allowTools: false }
    const sender = { sender: { id: 11, isDestroyed: () => false, send: () => undefined } }
    const sessionScopedKey = syntheticKey
    await saveProfile(null, scopedProfile, sessionScopedKey)
    await complete(sender, scopedProfile.id, request, 'session-scope-before')
    assert.equal(capturedKey, sessionScopedKey)
    await saveProfile(null, { ...scopedProfile, baseUrl: 'https://second-provider.example/v1' })
    await assertSafeRejection(() => complete(sender, scopedProfile.id, request, 'session-scope-after'), /API Key 不可用/)
    assert.equal((await fs.readFile(path.join(temporaryRoot, 'agent-providers.json'), 'utf8')).includes(sessionScopedKey), false)

    encryptionEnabled = true
    const encryptedProfile = { ...scopedProfile, id: 'encrypted-scoped-profile', displayName: 'Encrypted scoped profile' }
    const encryptedScopedKey = syntheticKey
    await saveProfile(null, encryptedProfile, encryptedScopedKey)
    const encryptedStateBefore = JSON.parse(await fs.readFile(path.join(temporaryRoot, 'agent-providers.json'), 'utf8'))
    const encryptedValueBefore = encryptedStateBefore.profiles.find((row) => row.profile.id === encryptedProfile.id)?.encryptedKey
    reEncryptNext = true
    await complete(sender, encryptedProfile.id, request, 'encrypted-scope-before')
    assert.equal(capturedKey, encryptedScopedKey)
    const encryptedStateAfter = JSON.parse(await fs.readFile(path.join(temporaryRoot, 'agent-providers.json'), 'utf8'))
    const encryptedValueAfter = encryptedStateAfter.profiles.find((row) => row.profile.id === encryptedProfile.id)?.encryptedKey
    assert.notEqual(encryptedValueAfter, encryptedValueBefore)

    const originalWriteFile = fs.writeFile
    const fetchCallsBeforeFailure = fetchCalls
    reEncryptNext = true
    fs.writeFile = async () => { throw new Error(`synthetic persistence failure ${syntheticKey}`) }
    try {
      await assertSafeRejection(() => complete(sender, encryptedProfile.id, request, 'encrypted-rewrite-failure'), /安全更新失败/)
      assert.equal(fetchCalls, fetchCallsBeforeFailure)
    } finally {
      fs.writeFile = originalWriteFile
    }
    await saveProfile(null, { ...encryptedProfile, transport: 'openai-responses' })
    await assertSafeRejection(() => complete(sender, encryptedProfile.id, request, 'encrypted-scope-after'), /API Key 不可用/)
    const scopedState = JSON.parse(await fs.readFile(path.join(temporaryRoot, 'agent-providers.json'), 'utf8'))
    assert.equal(scopedState.profiles.find((row) => row.profile.id === encryptedProfile.id)?.encryptedKey, undefined)
    encryptionEnabled = false

    upstreamResponse = () => new Response(JSON.stringify({ error: { message: syntheticKey } }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    await assertSafeRejection(() => complete({ sender: { id: 7, isDestroyed: () => false, send: () => undefined } }, DEVELOPMENT_PROFILE_ID, {
      messages: [{ role: 'user', content: 'synthetic request' }], tools: [], allowTools: false,
    }, 'synthetic-http-error'), /认证失败/)
    upstreamResponse = () => new Response(JSON.stringify({ error: { message: syntheticKey } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    await assertSafeRejection(() => complete({ sender: { id: 7, isDestroyed: () => false, send: () => undefined } }, DEVELOPMENT_PROFILE_ID, {
      messages: [{ role: 'user', content: 'synthetic request' }], tools: [], allowTools: false,
    }, 'synthetic-payload-error'), /模型服务返回错误/)

    const encoder = new TextEncoder()
    let declaredResponseCancelled = false
    upstreamResponse = () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(encoder.encode('{}')) },
      cancel() { declaredResponseCancelled = true },
    }), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Length': '2000001' } })
    await assertSafeRejection(() => complete({ sender: { id: 7, isDestroyed: () => false, send: () => undefined } }, DEVELOPMENT_PROFILE_ID, {
      messages: [{ role: 'user', content: 'declared oversized response' }], tools: [], allowTools: false,
    }, 'synthetic-declared-oversized-response'), /响应超过 2 MB/)
    assert.equal(declaredResponseCancelled, true)

    let streamedResponseCancelled = false
    upstreamResponse = () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(1_000_000))
        controller.enqueue(new Uint8Array(1_000_001))
      },
      cancel() { streamedResponseCancelled = true },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    await assertSafeRejection(() => complete({ sender: { id: 7, isDestroyed: () => false, send: () => undefined } }, DEVELOPMENT_PROFILE_ID, {
      messages: [{ role: 'user', content: 'streamed oversized response' }], tools: [], allowTools: false,
    }, 'synthetic-streamed-oversized-response'), /响应超过 2 MB/)
    assert.equal(streamedResponseCancelled, true)

    let sseResponseCancelled = false
    upstreamResponse = () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(1_000_000))
        controller.enqueue(new Uint8Array(1_000_001))
      },
      cancel() { sseResponseCancelled = true },
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    await assertSafeRejection(() => complete({ sender: { id: 7, isDestroyed: () => false, send: () => undefined } }, DEVELOPMENT_PROFILE_ID, {
      messages: [{ role: 'user', content: 'oversized SSE response' }], tools: [], allowTools: false,
    }, 'synthetic-oversized-sse-response'), /响应超过 2 MB/)
    assert.equal(sseResponseCancelled, true)
    upstreamResponse = () => new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } })

    const storedProfile = {
      schemaVersion: 1,
      id: 'stored-profile',
      presetId: 'ollama',
      displayName: 'Stored profile',
      transport: 'openai-chat',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'stored-model',
      authMode: 'none',
      timeoutMs: 60000,
      contextTurns: 12,
      capabilityMode: 'retrieval-only',
      extraHeaders: {},
      extraBody: {},
    }
    await fs.writeFile(path.join(temporaryRoot, 'agent-providers.json'), JSON.stringify({
      schemaVersion: 1,
      defaultProfileId: storedProfile.id,
      profiles: [{ profile: { ...storedProfile, apiKey: syntheticKey, unknownSecretField: syntheticKey }, unknownRowField: syntheticKey }],
    }), 'utf8')
    const storedSnapshot = await listProfiles()
    assert.equal(storedSnapshot.defaultProfileId, storedProfile.id)
    assert.equal(Object.hasOwn(storedSnapshot.profiles.find((profile) => profile.id === storedProfile.id), 'apiKey'), false)
    const scrubbedState = await fs.readFile(path.join(temporaryRoot, 'agent-providers.json'), 'utf8')
    assert.equal(scrubbedState.includes(syntheticKey), false)
    assert.equal(scrubbedState.includes('unknownSecretField'), false)

    const savedProfileId = 'saved-sanitized-profile'
    await saveProfile(null, { ...storedProfile, id: savedProfileId, apiKey: syntheticKey, unknownSecretField: syntheticKey })
    const savedSnapshot = await listProfiles()
    const savedProfile = savedSnapshot.profiles.find((profile) => profile.id === savedProfileId)
    assert.ok(savedProfile)
    assert.equal(Object.hasOwn(savedProfile, 'apiKey'), false)
    assert.equal(Object.hasOwn(savedProfile, 'unknownSecretField'), false)
    assert.equal((await fs.readFile(path.join(temporaryRoot, 'agent-providers.json'), 'utf8')).includes(syntheticKey), false)
    await removeProfile(null, savedProfileId)

    const storedResult = await complete({ sender: { id: 8, isDestroyed: () => false, send: () => undefined } }, storedProfile.id, {
      messages: [{ role: 'user', content: 'stored request' }], tools: [], allowTools: false,
    }, 'stored-request')
    assert.equal(storedResult.text, 'synthetic response')
    assert.equal(capturedKey, '')

    await setDefaultProfile(null, DEVELOPMENT_PROFILE_ID)
    const sessionDefault = await listProfiles()
    assert.equal(sessionDefault.defaultProfileId, DEVELOPMENT_PROFILE_ID)
    assert.equal(sessionDefault.sessionDefaultProfileId, DEVELOPMENT_PROFILE_ID)
    await setDefaultProfile(null, storedProfile.id)
    const restoredDefault = await listProfiles()
    assert.equal(restoredDefault.defaultProfileId, storedProfile.id)
    assert.equal(restoredDefault.sessionDefaultProfileId, undefined)

    fakeApp.isPackaged = true
    const packaged = await listProfiles()
    assert.deepEqual(packaged.managedProfileIds, [])
    assert.equal(packaged.profiles.some((profile) => profile.id === DEVELOPMENT_PROFILE_ID), false)

    await fs.writeFile(path.join(temporaryRoot, 'agent-providers.json'), JSON.stringify({
      schemaVersion: 1,
      defaultProfileId: 'dangling-profile',
      profiles: [{ profile: storedProfile }],
    }), 'utf8')
    const danglingDefault = await listProfiles()
    assert.equal(danglingDefault.defaultProfileId, '')

    fakeApp.isPackaged = false
    const previousSmokeEnvironment = process.env.PALTOOLS_SMOKE_TEST
    process.env.PALTOOLS_SMOKE_TEST = '1'
    const environmentSmoke = await listProfiles()
    assert.equal(environmentSmoke.profiles.some((profile) => profile.id === DEVELOPMENT_PROFILE_ID), false)
    if (previousSmokeEnvironment === undefined) delete process.env.PALTOOLS_SMOKE_TEST
    else process.env.PALTOOLS_SMOKE_TEST = previousSmokeEnvironment

    process.argv.push('--paltools-smoke-test')
    const argumentSmoke = await listProfiles()
    assert.equal(argumentSmoke.profiles.some((profile) => profile.id === DEVELOPMENT_PROFILE_ID), false)
    process.argv.pop()

    smokeSwitch = true
    const smoke = await listProfiles()
    assert.deepEqual(smoke.managedProfileIds, [])
    assert.equal(smoke.profiles.some((profile) => profile.id === DEVELOPMENT_PROFILE_ID), false)
  } finally {
    delete require.cache[gatewayPath]
    Module._load = originalLoad
    global.fetch = originalFetch
  }
}

async function testGatewayFailureIsolation(temporaryRoot) {
  const handlers = new Map()
  const fakeApp = {
    isPackaged: false,
    commandLine: { hasSwitch: () => false },
    getPath: () => temporaryRoot,
  }
  const storedProfile = {
    schemaVersion: 1,
    id: 'failure-isolation-stored-profile',
    presetId: 'ollama',
    displayName: 'Stored fallback profile',
    transport: 'openai-chat',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'stored-model',
    authMode: 'none',
    timeoutMs: 60000,
    contextTurns: 12,
    capabilityMode: 'retrieval-only',
    extraHeaders: {},
    extraBody: {},
  }
  const managedProfile = {
    ...storedProfile,
    id: DEVELOPMENT_PROFILE_ID,
    presetId: 'deepseek',
    displayName: '开发者 DeepSeek（仅开发版）',
    baseUrl: 'https://api.deepseek.com',
    model: syntheticModel,
    authMode: 'bearer',
    capabilityMode: 'auto',
  }
  await fs.writeFile(path.join(temporaryRoot, 'agent-providers.json'), JSON.stringify({
    schemaVersion: 1,
    defaultProfileId: storedProfile.id,
    profiles: [{ profile: storedProfile }],
  }), 'utf8')

  let loaderMode = 'missing'
  const originalLoad = Module._load
  const originalFetch = global.fetch
  const previousOverride = process.env.PALTOOLS_DEV_API_PATH
  delete process.env.PALTOOLS_DEV_API_PATH
  Module._load = function loadWithFailureIsolationMock(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: fakeApp,
        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
        safeStorage: { isAsyncEncryptionAvailable: async () => false },
      }
    }
    if (request.endsWith('build/electron/provider-protocol.cjs')) {
      return {
        buildProviderStreamRequest: () => ({ url: 'http://127.0.0.1:11434/v1/chat/completions', headers: {}, body: {} }),
        createProviderStreamAccumulator: () => ({ push: () => [], result: () => ({ text: '', toolCalls: [] }) }),
        parseProviderResponse: () => ({ text: 'stored response', toolCalls: [] }),
      }
    }
    if (request === '../development/dev-provider.cjs') {
      return {
        loadDevelopmentProvider: async () => {
          if (loaderMode === 'valid') return { profile: managedProfile, apiKey: syntheticKey }
          const error = new Error(loaderMode === 'missing' ? '开发者 API 配置文件不可用' : '开发者 API 配置文件必须使用 UTF-8 编码')
          error.code = loaderMode === 'missing' ? 'PALTOOLS_DEV_PROVIDER_MISSING' : 'PALTOOLS_DEV_PROVIDER_INVALID'
          throw error
        },
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  global.fetch = async () => new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } })

  const gatewayPath = require.resolve('./electron/agent-gateway.cjs')
  delete require.cache[gatewayPath]
  try {
    require(gatewayPath).registerAgentGateway()
    const listProfiles = handlers.get('paltools-agent:list-profiles')
    const complete = handlers.get('paltools-agent:complete')

    const missing = await listProfiles()
    assert.equal(missing.defaultProfileId, storedProfile.id)
    assert.equal(missing.developmentProfileError, undefined)
    assert.deepEqual(missing.managedProfileIds, [])

    process.env.PALTOOLS_DEV_API_PATH = 'synthetic-explicit-missing-path'
    const explicitMissing = await listProfiles()
    assert.equal(explicitMissing.defaultProfileId, storedProfile.id)
    assert.match(explicitMissing.developmentProfileError, /文件不可用/)

    delete process.env.PALTOOLS_DEV_API_PATH
    loaderMode = 'malformed'
    const malformed = await listProfiles()
    assert.equal(malformed.defaultProfileId, storedProfile.id)
    assert.match(malformed.developmentProfileError, /UTF-8/)
    assert.equal(malformed.developmentProfileError.includes(syntheticKey), false)
    const storedResult = await complete({ sender: { id: 9, isDestroyed: () => false, send: () => undefined } }, storedProfile.id, {
      messages: [{ role: 'user', content: 'stored request' }], tools: [], allowTools: false,
    }, 'failure-isolation-request')
    assert.equal(storedResult.text, 'stored response')

    loaderMode = 'valid'
    const recovered = await listProfiles()
    assert.equal(recovered.profiles.some((profile) => profile.id === DEVELOPMENT_PROFILE_ID), true)
    assert.equal(recovered.developmentProfileError, undefined)

    await fs.writeFile(path.join(temporaryRoot, 'agent-providers.json'), '{"schemaVersion":1,"profiles":[', 'utf8')
    const corruptState = await listProfiles()
    assert.equal(corruptState.defaultProfileId, DEVELOPMENT_PROFILE_ID)
    assert.equal(corruptState.profiles.some((profile) => profile.id === DEVELOPMENT_PROFILE_ID), true)
    assert.equal(corruptState.developmentProfileError, undefined)

    await fs.writeFile(path.join(temporaryRoot, 'agent-providers.json'), JSON.stringify({ schemaVersion: 2, profiles: [] }), 'utf8')
    const invalidTopLevelState = await listProfiles()
    assert.equal(invalidTopLevelState.defaultProfileId, DEVELOPMENT_PROFILE_ID)
    assert.equal(invalidTopLevelState.profiles.some((profile) => profile.id === DEVELOPMENT_PROFILE_ID), true)
  } finally {
    delete require.cache[gatewayPath]
    Module._load = originalLoad
    global.fetch = originalFetch
    if (previousOverride === undefined) delete process.env.PALTOOLS_DEV_API_PATH
    else process.env.PALTOOLS_DEV_API_PATH = previousOverride
  }
}

async function main() {
  assert.equal(DEFAULT_DEVELOPMENT_API_PATH, 'D:\\aLCYYDS\\IDM下载\\开发者api.md')
  const packagedFiles = packageMetadata.build?.files ?? []
  assert.deepEqual(packagedFiles, ['build/web/**/*', 'build/electron/provider-protocol.cjs', 'script/electron/*.cjs', 'package.json'])
  assert.equal(JSON.stringify({ files: packagedFiles, extraFiles: packageMetadata.build?.extraFiles, extraResources: packageMetadata.build?.extraResources }).includes('script/development'), false)

  const parsed = parseDevelopmentProviderDocument(
    `开发者专用 API Key:${syntheticKey}\r\n\r\n模型：${syntheticModel}\r\n`,
  )
  assert.equal(parsed.apiKey, syntheticKey)
  assert.deepEqual(parsed.profile, {
    schemaVersion: 1,
    id: DEVELOPMENT_PROFILE_ID,
    presetId: 'deepseek',
    displayName: '开发者 DeepSeek（仅开发版）',
    transport: 'openai-chat',
    baseUrl: 'https://api.deepseek.com',
    model: syntheticModel,
    authMode: 'bearer',
    timeoutMs: 60000,
    contextTurns: 12,
    capabilityMode: 'auto',
    extraHeaders: {},
    extraBody: {},
  })

  const halfWidthModel = parseDevelopmentProviderDocument(
    `API Key: ${syntheticKey}\n模型: ${syntheticModel}`,
  )
  assert.equal(halfWidthModel.profile.model, syntheticModel)

  assertSafeFailure(
    () => parseDevelopmentProviderDocument(`API Key：${syntheticKey}\n模型：${syntheticModel}`),
    /无法识别/,
  )
  assertSafeFailure(
    () => parseDevelopmentProviderDocument(`API Key:${syntheticKey}\n模型：other-model`),
    /DeepSeek/,
  )
  assertSafeFailure(
    () => parseDevelopmentProviderDocument(`API Key:${syntheticKey}`),
    /两个字段/,
  )
  assertSafeFailure(
    () => parseDevelopmentProviderDocument(`API Key:${syntheticKey}\n模型：${syntheticModel}\n额外字段:值`),
    /两个字段/,
  )

  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'paltools-dev-provider-'))
  const fixture = path.join(temporaryRoot, 'developer-api.md')
  const oversized = path.join(temporaryRoot, 'oversized.md')
  const invalidUtf8 = path.join(temporaryRoot, 'invalid-utf8.md')
  const previousOverride = process.env.PALTOOLS_DEV_API_PATH
  try {
    await fs.writeFile(fixture, `API Key:${syntheticKey}\r\n\r\n模型：${syntheticModel}\r\n`, 'utf8')
    assert.equal((await loadDevelopmentProvider(fixture)).profile.id, DEVELOPMENT_PROFILE_ID)

    process.env.PALTOOLS_DEV_API_PATH = fixture
    assert.equal((await loadDevelopmentProvider()).apiKey, syntheticKey)
    await testGatewayBoundary(temporaryRoot, fixture)
    await testGatewayFailureIsolation(temporaryRoot)

    await fs.writeFile(oversized, Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 0x61))
    await assertSafeRejection(() => loadDevelopmentProvider(oversized), /文件大小/)

    await fs.writeFile(invalidUtf8, Buffer.from([0xff, 0xfe, 0xfd]))
    await assertSafeRejection(() => loadDevelopmentProvider(invalidUtf8), /UTF-8/)
    const missingFailure = await assertSafeRejection(() => loadDevelopmentProvider(path.join(temporaryRoot, 'missing.md')), /不可用/)
    assert.equal(missingFailure.code, 'PALTOOLS_DEV_PROVIDER_MISSING')
  } finally {
    if (previousOverride === undefined) delete process.env.PALTOOLS_DEV_API_PATH
    else process.env.PALTOOLS_DEV_API_PATH = previousOverride
    await fs.rm(temporaryRoot, { recursive: true, force: true })
  }

  console.log('Development Provider loader contract passed with synthetic credentials.')
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Development Provider loader test failed.')
  process.exitCode = 1
})
