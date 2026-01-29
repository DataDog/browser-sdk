import type { EventEmitter } from 'node:events'
import type { TestRunOptions } from './types/messages.ts'

// Type for Connection from testRunner.ts
interface Connection extends EventEmitter {
  on(event: 'jasmine-started', listener: (info: jasmine.JasmineStartedInfo) => void): this
  on(event: 'spec-done', listener: (result: jasmine.SpecResult) => void): this
  on(event: 'jasmine-done', listener: (result: jasmine.JasmineDoneInfo) => void): this
  on(event: 'close', listener: () => void): this
  on(event: 'error', listener: (error: Error) => void): this
}

export function attachCliReporter(
  connection: Connection,
  options: TestRunOptions & { specPattern: string | undefined; watch: boolean }
) {
  console.log('Browser connected')

  if (options.specPattern) {
    console.log(`Running specs matching: ${options.specPattern}`)
  }
  if (options.watch) {
    console.log('Watch mode enabled - server will stay running')
  }
  if (options.seed) {
    console.log(`Using seed: ${options.seed}`)
  }
  if (options.stopOnFailure) {
    console.log('Stop on failure enabled')
  }

  let totalSpecs = 0
  let completedSpecs = 0
  const specResults: jasmine.SpecResult[] = []

  connection.on('jasmine-started', (info: jasmine.JasmineStartedInfo) => {
    totalSpecs = info.totalSpecsDefined
    console.log(`\nStarting test execution: ${totalSpecs} specs`)
    if (info.order.random) {
      console.log(`Randomized with seed: ${info.order.seed}`)
    }
    console.log('')
  })

  connection.on('spec-done', (result: jasmine.SpecResult) => {
    completedSpecs++
    specResults.push(result)

    // Print progress indicator
    let indicator: string
    if (result.status === 'passed') {
      indicator = '.'
    } else if (result.status === 'failed') {
      indicator = 'F'
    } else if (result.status === 'pending') {
      indicator = '*'
    } else if (result.status === 'excluded') {
      indicator = '⊘'
    } else {
      indicator = '?'
    }

    process.stdout.write(indicator)

    // Print progress counter every 50 specs
    if (completedSpecs % 50 === 0) {
      process.stdout.write(` ${completedSpecs}/${totalSpecs}\n`)
    }
  })

  connection.on('jasmine-done', (_result: jasmine.JasmineDoneInfo) => {
    // Print newline if we didn't just print a progress line
    if (completedSpecs % 50 !== 0) {
      process.stdout.write('\n')
    }

    console.log('')
    console.log('============================================================')
    console.log('TEST RESULTS')
    console.log('============================================================')

    // Count specs by status
    const passedCount = specResults.filter((s) => s.status === 'passed').length
    const failedCount = specResults.filter((s) => s.status === 'failed').length
    const pendingCount = specResults.filter((s) => s.status === 'pending').length
    const excludedCount = specResults.filter((s) => s.status === 'excluded').length

    console.log(
      `✅ ${passedCount} passed | ❌ ${failedCount} failed | ⏭️  ${pendingCount} pending | ⊘ ${excludedCount} excluded`
    )

    // Print failed tests
    const failedSpecs = specResults.filter((s) => s.status === 'failed')
    if (failedSpecs.length > 0) {
      console.log('')
      console.log('Failed tests:')
      console.log('')
      for (const spec of failedSpecs) {
        console.log(`  ❌ ${spec.fullName}`)
        for (const expectation of spec.failedExpectations) {
          console.log(`     Error: ${expectation.message}`)
          if (expectation.stack) {
            // Print only the first few lines of stack trace
            const stackLines = expectation.stack.split('\n').slice(0, 5)
            for (const line of stackLines) {
              console.log(`    ${line}`)
            }
          }
        }
        console.log('')
      }
    }
    console.log('============================================================')
  })

  connection.on('close', () => {
    console.log('\nBrowser disconnected')
  })

  connection.on('error', (error: Error) => {
    console.error('Connection error:', error)
  })
}
