const { app, BrowserWindow, net, protocol, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const APP_SCHEME = 'paltools'
const SMOKE_ARGUMENT = '--paltools-smoke-test'
const smokeTest =
  process.env.PALTOOLS_SMOKE_TEST === '1' ||
  process.argv.includes(SMOKE_ARGUMENT) ||
  app.commandLine.hasSwitch('paltools-smoke-test')

if (smokeTest) {
  const smokeUserData = path.join(
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
        const passed = await window.webContents.executeJavaScript(`
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
              document.querySelectorAll('.tool-tabs button')[2]?.click();
              const defaultLimit = await waitFor(() => {
                const input = document.querySelector('.admin-card input[type="number"]');
                return input?.value === '6';
              });
              return resolve(defaultLimit ? 'ok' : 'admin-default');
            })().catch((error) => resolve('exception:' + error.message));
          })
        `)
        clearTimeout(smokeTimeout)
        app.exit(passed === 'ok' ? 0 : 1)
      } catch {
        clearTimeout(smokeTimeout)
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

app.whenReady().then(() => {
  registerAppProtocol()
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
