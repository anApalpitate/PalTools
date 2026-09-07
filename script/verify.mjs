import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createVerificationSession } from './verification-session.mjs'

const scenes = ['paldex', 'breeding', 'assistant', 'theme', 'shared']

export function parseVerificationArgs(args) {
  if (args.length === 1 && ['smoke', 'package-electron'].includes(args[0])) return { standalone: args[0] }
  const options = { browser: undefined, electron: false, packageElectron: false }
  for (const argument of args) {
    if (argument === '--electron') options.electron = true
    else if (argument === '--package') options.packageElectron = true
    else if (argument === '--browser' || argument.startsWith('--browser=')) {
      options.browser = argument === '--browser' ? [...scenes] : [...new Set(argument.slice('--browser='.length).split(','))]
      if (options.browser.some((scene) => !scenes.includes(scene))) throw new Error('Unknown or empty browser scene')
    } else throw new Error(`Unknown verification argument: ${argument}`)
  }
  if (!options.browser && !options.electron && !options.packageElectron) throw new Error('Choose --browser[=scenes], --electron, --package, smoke, or package-electron')
  return options
}

export async function runVerification(options, { session = createVerificationSession(), browser } = {}) {
  if (options.standalone === 'smoke') await session.smokeElectron()
  else if (options.standalone === 'package-electron') await session.packageElectron()
  else {
    await session.prepareWeb()
    if (options.browser) {
      const runBrowser = browser ?? (await import('./test-browser.mjs')).runBrowserRegression
      try { await runBrowser({ scenes: options.browser, verificationSession: session }) }
      catch (error) { session.invalidate(); throw error }
    }
    if (options.electron) await session.smokeElectron()
    if (options.packageElectron) await session.packageElectron()
  }
  return session.results
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runVerification(parseVerificationArgs(process.argv.slice(2)))
    .catch((error) => { console.error(error.message); process.exitCode = 1 })
}
