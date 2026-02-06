import { createJasmineReporter } from './reporter.ts'

// Vite defines `module.exports` when loading Jasmine, and Jasmine assumes it's in Node.js, so it
// uses `global` instead of `window` as a global variable.
window.global = globalThis
// Jasmine uses an undeclared variable `i`, which breaks in strict mode
// https://github.com/jasmine/jasmine/blob/v3.99.1/lib/jasmine-core/jasmine.js#L3369
window.i = undefined

const { default: jasmineRequire } = await import('jasmine-core/lib/jasmine-core/jasmine.js')

main()

async function main() {
  const jasmine = jasmineRequire.core(jasmineRequire)
  const env = jasmine.getEnv({ global: globalThis })
  Object.assign(globalThis, jasmineRequire.interface(jasmine, env))

  // Establish WebSocket connection
  const ws = await createWebSocketClient()

  // Wait for run-tests message from CLI
  const options = await waitForRunTestsMessage(ws)
  console.log(`Received spec pattern from CLI: ${options.specPattern === null ? 'all specs' : options.specPattern}`)

  // Configure Jasmine options
  const jasmineConfig: any = {}
  if (options.seed) {
    console.log(`Using seed: ${options.seed}`)
    jasmineConfig.seed = options.seed
  }
  if (options.stopOnFailure) {
    console.log('Stop on failure enabled')
    jasmineConfig.stopOnSpecFailure = true
  }
  if (Object.keys(jasmineConfig).length > 0) {
    env.configure(jasmineConfig)
  }

  const reporter = createJasmineReporter(ws)

  env.addReporter(reporter)

  try {
    const { specFileCount } = await loadSpecFiles(options.specPattern)
    console.log(`Loaded ${specFileCount} spec files`)
  } catch (error) {
    console.error('Failed to load specs:', error)
    document.body.innerHTML = `<h1 style="color: red;">Failed to load specs</h1><pre>${error instanceof Error ? error.stack : String(error)}</pre>`
    return
  }

  await env.execute()

  displayReporterResults(reporter)

  document.body.innerHTML = '<h1>Test suite complete (see console)</h1>'
}

async function createWebSocketClient(): Promise<WebSocket> {
  const ws = new WebSocket(`ws://${window.location.host}`)

  return new Promise<WebSocket>((resolve, reject) => {
    ws.onopen = () => {
      console.log('Connected to CLI via WebSocket')
      resolve(ws)
    }
    ws.onerror = (error) => {
      console.error('WebSocket connection failed:', error)
      document.body.innerHTML = '<h1 style="color: red;">WebSocket connection failed</h1>'
      reject(error)
    }
  })
}

interface RunTestsOptions {
  specPattern: string | null
  seed?: string
  stopOnFailure?: boolean
}

async function waitForRunTestsMessage(ws: WebSocket): Promise<RunTestsOptions> {
  return new Promise<RunTestsOptions>((resolve, reject) => {
    const messageHandler = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'run-tests') {
          ws.removeEventListener('message', messageHandler)
          resolve(message.options)
        }
      } catch (error) {
        console.error('Error parsing message:', error)
        reject(error)
      }
    }

    ws.addEventListener('message', messageHandler)
  })
}

function displayReporterResults(reporter: ReturnType<typeof createJasmineReporter>) {
  console.group('Test execution complete')

  if (reporter.overallResult?.order.random) {
    console.log(`Jasmine randomized with seed: ${reporter.overallResult.order.seed}`)
  }

  function countSpecsByStatus(status: string) {
    return reporter.specResults.reduce((count, spec) => (spec.status === status ? count + 1 : count), 0)
  }

  console.log(
    `%c${countSpecsByStatus('passed')} passed, %c${countSpecsByStatus('failed')} failed, %c${countSpecsByStatus(
      'excluded'
    )} excluded, %c${countSpecsByStatus('pending')} pending`,
    'color: green',
    'color: red',
    'color: gray',
    'color: gray'
  )
  console.groupEnd()

  const failedSpecs = reporter.specResults.filter((spec: any) => spec.status === 'failed')
  if (failedSpecs.length > 0) {
    console.group('\nFailed tests:')
    failedSpecs.forEach((spec: any) => {
      console.group(`\n❌ ${spec.fullName}`)
      printFailedExpectations(spec.failedExpectations)
      console.groupEnd()
    })
    console.groupEnd()
  }

  const failedSuites = reporter.suitesResults.filter((suite: any) => suite.status === 'failed')
  if (failedSuites.length > 0) {
    console.group('\nFailed suites:')
    failedSuites.forEach((suite: any) => {
      console.group(`\n❌ ${suite.fullName}`)
      printFailedExpectations(suite.failedExpectations)
      console.groupEnd()
    })
    console.groupEnd()
  }

  if (reporter.overallResult?.failedExpectations.length ?? 0 > 0) {
    console.group('\nGlobal failed expectations:')
    printFailedExpectations(reporter.overallResult!.failedExpectations)
    console.groupEnd()
  }
}

function printFailedExpectations(expectations: any[]) {
  expectations.forEach((expectation: any) => {
    console.error(expectation.stack)
  })
}

async function loadSpecFiles(specPattern: string | null) {
  // Use eager: false to prevent immediate evaluation
  const allSpecImports = import.meta.glob('../../../../packages/**/*.spec.ts', { eager: false })

  // Filter specs based on the pattern
  const specImports: Record<string, () => Promise<unknown>> = {}
  for (const [path, value] of Object.entries(allSpecImports)) {
    // If pattern is null, include all specs
    if (specPattern === null) {
      specImports[path] = value as () => Promise<unknown>
    } else {
      // Otherwise, check if the path includes the pattern
      if (path.includes(specPattern)) {
        specImports[path] = value as () => Promise<unknown>
      }
    }
  }

  console.log(`Filtered ${Object.keys(specImports).length} specs from ${Object.keys(allSpecImports).length} total`)

  // First import forEach.spec.ts
  for (const [path, value] of Object.entries(specImports)) {
    if (path.includes('forEach.spec.ts')) {
      await value()
    }
  }

  // Then import all other specs
  for (const [path, value] of Object.entries(specImports)) {
    if (path.includes('forEach.spec.ts')) {
      continue
    }
    await value()
  }

  return { specFileCount: Object.keys(specImports).length }
}
