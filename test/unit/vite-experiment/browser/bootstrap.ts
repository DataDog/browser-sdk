import type { TestRunOptions, ServerMessage } from '../types/messages.ts'
import { createJasmineReporter } from './reporter.ts'

// Vite defines `module.exports` when loading Jasmine, and Jasmine assumes it's in Node.js, so it
// uses `global` instead of `window` as a global variable.
window.global = globalThis
// Jasmine uses an undeclared variable `i`, which breaks in strict mode
// https://github.com/jasmine/jasmine/blob/v3.99.1/lib/jasmine-core/jasmine.js#L3369
window.i = undefined

const { default: jasmineRequire } = await import('jasmine-core/lib/jasmine-core/jasmine.js')

main().catch((error) => {
  console.error(error)
})

async function main() {
  const jasmine = jasmineRequire.core(jasmineRequire)
  const env = jasmine.getEnv({ global: globalThis })
  Object.assign(globalThis, jasmineRequire.interface(jasmine, env))

  const ws = await createWebSocketClient()
  const options = await waitForRunTestsMessage(ws)

  const jasmineConfig: jasmine.Configuration = {}

  if (options.seed) {
    jasmineConfig.seed = options.seed
  }

  if (options.stopOnFailure) {
    jasmineConfig.stopOnSpecFailure = true
  }

  env.configure(jasmineConfig)
  env.addReporter(createJasmineReporter(ws))

  try {
    const { specFileCount } = await loadSpecFiles()
    console.log(`Loaded ${specFileCount} spec files`)
  } catch (error) {
    console.error('Failed to load specs:', error)
    document.body.innerHTML = `<h1 style="color: red;">Failed to load specs</h1><pre>${error instanceof Error ? error.stack : String(error)}</pre>`
    return
  }

  // TODO: remove me. This removes the event listener added in forEach.spec.ts, because it prevent the
  // page from refreshing when using watch mode. This listener might be useful for Karma so let's keep
  // it for now.
  afterEach(() => {
    window.onbeforeunload = null
  })

  await env.execute()

  document.body.innerHTML = '<h1>Test suite complete (see console)</h1>'
}

function createWebSocketClient(): Promise<WebSocket> {
  const ws = new WebSocket(`ws://${window.location.host}`)

  return new Promise<WebSocket>((resolve, reject) => {
    ws.onopen = () => {
      console.log('Connected to CLI via WebSocket')
      resolve(ws)
    }

    ws.onerror = (error) => {
      document.body.innerHTML = '<h1 style="color: red;">WebSocket connection failed</h1>'
      reject(new Error('WebSocket connection failed', { cause: error }))
    }
  })
}

function waitForRunTestsMessage(ws: WebSocket): Promise<TestRunOptions> {
  return new Promise<TestRunOptions>((resolve, reject) => {
    const messageHandler = (event: MessageEvent) => {
      try {
        const message: ServerMessage = JSON.parse(event.data)
        if (message.type === 'run-tests') {
          ws.removeEventListener('message', messageHandler)
          resolve(message.data)
        }
      } catch (error) {
        reject(new Error('Error parsing message', { cause: error }))
      }
    }

    ws.addEventListener('message', messageHandler)
  })
}

async function loadSpecFiles() {
  // Use eager: false to prevent immediate evaluation
  const specImports = {
    ...import.meta.glob('../../../../packages/**/*.spec.{ts,tsx}', { eager: false }),
    ...import.meta.glob('../../../../developer-extension/**/*.spec.{ts,tsx}', { eager: false }),
  }

  const forEachSpecModules: Array<() => Promise<unknown>> = []
  const otherSpecModules: Array<() => Promise<unknown>> = []

  for (const [path, module] of Object.entries(specImports)) {
    if (path.includes('forEach.spec.ts')) {
      forEachSpecModules.push(module)
    } else {
      otherSpecModules.push(module)
    }
  }

  // Make sure 'forEach.spec' are the first files to be evaluated, so their `beforeEach` hooks are
  // executed before all other `beforeEach` hooks, and their `afterEach` hook are executed after all
  // other `afterEach` hooks.
  await Promise.all(forEachSpecModules.map((module) => module()))
  await Promise.all(otherSpecModules.map((module) => module()))

  return { specFileCount: Object.keys(specImports).length }
}
