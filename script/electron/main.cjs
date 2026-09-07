const { app, BrowserWindow, net, protocol, shell } = require('electron')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { registerAgentGateway } = require('./agent-gateway.cjs')

const APP_SCHEME = 'paltools'
const SMOKE_ARGUMENT = '--paltools-smoke-test'
const smokeTest =
  process.env.PALTOOLS_SMOKE_TEST === '1' ||
  process.argv.includes(SMOKE_ARGUMENT) ||
  app.commandLine.hasSwitch('paltools-smoke-test')
let smokeUserData
let smokeModelServer
let smokeModelBaseUrl = ''

if (smokeTest) {
  smokeUserData = path.join(
    app.getPath('temp'),
    `paltools-smoke-${process.pid}`,
  )
  fs.mkdirSync(smokeUserData, { recursive: true })
  app.setPath('userData', smokeUserData)
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-http-cache')
  app.commandLine.appendSwitch('no-sandbox')
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

function registerAppProtocol() {
  const webRoot = path.join(app.getAppPath(), 'build', 'web')
  const webRootPrefix = `${webRoot}${path.sep}`

  protocol.handle(APP_SCHEME, (request) => {
    const requestUrl = new URL(request.url)
    const pathname =
      requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname
    const decodedPath = decodeURIComponent(pathname)
    const localPath = path.resolve(webRoot, `.${decodedPath}`)

    if (
      localPath !== path.join(webRoot, 'index.html') &&
      !localPath.startsWith(webRootPrefix)
    ) {
      return new Response('Not found', { status: 404 })
    }

    return net.fetch(pathToFileURL(localPath).toString())
  })
}

async function startSmokeModelServer() {
  smokeModelServer = http.createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions' || request.headers.authorization !== 'Bearer paltools-smoke-secret') {
      response.writeHead(401, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: { message: 'smoke authentication failed' } }))
      return
    }
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      try {
        const payload = JSON.parse(body)
        if (payload.model !== 'smoke-model' || payload.stream !== true) throw new Error('invalid smoke request')
        response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
        response.write('data: {"choices":[{"delta":{"content":"smoke "}}]}\n\n')
        response.write('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n')
        response.write('data: {"choices":[],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}\n\n')
        response.end('data: [DONE]\n\n')
      } catch (error) {
        response.writeHead(400, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ error: { message: error.message } }))
      }
    })
  })
  await new Promise((resolve, reject) => {
    smokeModelServer.once('error', reject)
    smokeModelServer.listen(0, '127.0.0.1', resolve)
  })
  const address = smokeModelServer.address()
  smokeModelBaseUrl = `http://127.0.0.1:${address.port}/v1`
}

async function stopSmokeModelServer() {
  if (!smokeModelServer) return
  await new Promise((resolve) => smokeModelServer.close(resolve))
  smokeModelServer = undefined
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 768,
    minHeight: 620,
    title: 'PalTools',
    backgroundColor: '#07110e',
    autoHideMenuBar: true,
    show: !smokeTest,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: !smokeTest,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${APP_SCHEME}://`)) {
      event.preventDefault()
      if (url.startsWith('https://') || url.startsWith('http://')) {
        void shell.openExternal(url)
      }
    }
  })

  if (smokeTest) {
    const smokeTimeout = setTimeout(() => app.exit(1), 25000)
    window.webContents.once('did-fail-load', () => {
      clearTimeout(smokeTimeout)
      app.exit(1)
    })
    window.webContents.once('did-finish-load', async () => {
      try {
        let passed = await window.webContents.executeJavaScript(`
          new Promise((resolve) => {
            const deadline = Date.now() + 20000;
            const waitFor = (predicate) => new Promise((finish) => {
              const check = () => {
                const value = predicate();
                if (value) return finish(value);
                if (Date.now() >= deadline) return finish(null);
                setTimeout(check, 100);
              };
              check();
            });
            (async () => {
              const loaded = await waitFor(() => {
                const count = document.querySelector('.count-block strong')?.textContent;
                const icon = document.querySelector('.element-badge img');
                const error = document.querySelector('.error-state');
                return !error && count === '300' && icon?.complete && icon?.naturalWidth > 0;
              });
              if (!loaded) return resolve('initial-content');

              const [manifest, index, skills, items] = await Promise.all(
                ['manifest.json', 'breeding-index.json', 'skills.json', 'items.json']
                  .map((name) => fetch('./data/' + name).then((response) => {
                    if (!response.ok) throw new Error(name + ' failed to load');
                    return response.json();
                  })),
              );
              if (
                manifest.schemaVersion !== 4 ||
                index.schemaVersion !== 4 ||
                !index.parentsByChild ||
                !skills.skills?.length ||
                !items.items?.length
              ) return resolve('schema-or-index');

              document.querySelector('.pal-card')?.click();
              const detailLoaded = await waitFor(() => {
                const skillCard = document.querySelector('.active-skill-card');
                const dropIcon = document.querySelector('.item-image img');
                return skillCard && dropIcon;
              });
              if (!detailLoaded) return resolve('detail-content');

              const itemIconLoaded = await new Promise((finish) => {
                const image = new Image();
                image.onload = () => finish(image.naturalWidth > 0);
                image.onerror = () => finish(false);
                image.src = '.' + items.items[0].icon.localPath;
              });
              if (!itemIconLoaded) return resolve('item-icon');

              document.querySelector('.dialog-close')?.click();
              const detailClosed = await waitFor(() => !document.querySelector('.dialog-close'));
              if (!detailClosed) return resolve('detail-close');
              window.history.pushState(null, '', '#/settings');
              window.dispatchEvent(new PopStateEvent('popstate'));
              const settingsReady = await waitFor(() => {
                const themeOptions = document.querySelectorAll('[role="radio"]');
                const selectedTheme = document.querySelector(
                  '[role="radio"][aria-checked="true"]',
                );
                return (
                  themeOptions.length === 7 &&
                  selectedTheme?.textContent?.includes('森林夜色')
                );
              });
              if (!settingsReady) {
                return resolve(
                  'settings-content:hash=' + window.location.hash +
                  ':radios=' + document.querySelectorAll('[role="radio"]').length +
                  ':selected=' + (document.querySelector('[role="radio"][aria-checked="true"]')?.textContent ?? ''),
                );
              }

              window.history.pushState(null, '', '#/assistant');
              window.dispatchEvent(new PopStateEvent('popstate'));
              const assistantReady = await waitFor(() => (
                document.querySelector('.assistant-page h1')?.textContent === '先配置模型服务' &&
                document.querySelector('.assistant-setup-link')?.getAttribute('href') === '#/settings' &&
                !document.querySelector('.assistant-workbench')
              ));
              if (!assistantReady) return resolve('assistant-content');

              if (typeof window.paltoolsAgent?.listProfiles !== 'function') {
                return resolve('agent-preload');
              }
              const smokeProfile = {
                schemaVersion: 1,
                id: 'smoke-local-profile',
                presetId: 'ollama',
                displayName: 'Smoke Local',
                transport: 'openai-chat',
                baseUrl: ${JSON.stringify(smokeModelBaseUrl)},
                model: 'smoke-model',
                authMode: 'bearer',
                timeoutMs: 5000,
                contextTurns: 12,
                capabilityMode: 'retrieval-only',
                extraHeaders: {},
                extraBody: {},
              };
              await window.paltoolsAgent.saveProfile(smokeProfile, 'paltools-smoke-secret');
              const agentProfiles = await window.paltoolsAgent.listProfiles();
              if (!agentProfiles.profiles.some((profile) => profile.id === smokeProfile.id && profile.hasApiKey)) {
                return resolve('agent-profile-storage');
              }
              const streamText = [];
              const unsubscribe = window.paltoolsAgent.subscribe((requestId, event) => {
                if (requestId === 'smoke-request' && event.type === 'text-delta') streamText.push(event.text);
              });
              const modelResult = await window.paltoolsAgent.complete(smokeProfile.id, {
                messages: [{ role: 'user', content: 'smoke' }],
                tools: [],
                allowTools: false,
              }, 'smoke-request');
              unsubscribe();
              if (modelResult.text !== 'smoke ok' || streamText.join('') !== 'smoke ok' || modelResult.usage?.totalTokens !== 3) {
                return resolve('agent-model-stream');
              }
              window.history.pushState(null, '', '#/breeding/forward');
              window.dispatchEvent(new PopStateEvent('popstate'));
              const solutionTab = await waitFor(() => document.querySelector('#breeding-tab-solution'));
              if (!solutionTab) return resolve('solution-tab');
              solutionTab.click();
              const workspaceReady = await waitFor(() => (
                document.querySelector('.solution-workspace') &&
                document.querySelector('.relation-bag h2')?.textContent === '配方背包'
              ));
              if (!workspaceReady) return resolve('solution-workspace');
              const database = await new Promise((finish, fail) => {
                const request = indexedDB.open('paltools-breeding-network');
                request.onsuccess = () => finish(request.result);
                request.onerror = () => fail(request.error);
              });
              const stores = [...database.objectStoreNames];
              database.close();
              return resolve(
                ['metadata', 'relations', 'plans', 'planRelations'].every((name) => stores.includes(name))
                  ? 'ok'
                  : 'workspace-storage'
              );
            })().catch((error) => resolve('exception:' + error.message));
          })
        `)
        clearTimeout(smokeTimeout)
        const providerState = fs.readFileSync(path.join(smokeUserData, 'agent-providers.json'), 'utf8')
        if (providerState.includes('paltools-smoke-secret')) passed = 'agent-key-plaintext'
        fs.writeFileSync(path.join(smokeUserData, 'result.txt'), passed, 'utf8')
        await stopSmokeModelServer()
        app.exit(passed === 'ok' ? 0 : 1)
      } catch (error) {
        clearTimeout(smokeTimeout)
        fs.writeFileSync(
          path.join(smokeUserData, 'result.txt'),
          `exception:${error instanceof Error ? error.message : String(error)}`,
          'utf8',
        )
        await stopSmokeModelServer()
        app.exit(1)
      }
    })
  }

  if (!app.isPackaged && process.env.PALTOOLS_DEV_URL) {
    void window.loadURL(process.env.PALTOOLS_DEV_URL)
  } else {
    void window.loadURL(`${APP_SCHEME}://app/index.html`)
  }
}

app.whenReady().then(async () => {
  registerAppProtocol()
  registerAgentGateway()
  if (smokeTest) await startSmokeModelServer()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
