import type { WebSocket } from 'ws'

type JasmineMessage =
  | { type: 'jasmine-started'; data: jasmine.JasmineStartedInfo }
  | { type: 'suite-started'; data: jasmine.SuiteResult }
  | { type: 'spec-started'; data: jasmine.SpecResult }
  | { type: 'spec-done'; data: jasmine.SpecResult }
  | { type: 'suite-done'; data: jasmine.SuiteResult }
  | { type: 'jasmine-done'; data: jasmine.JasmineDoneInfo }

export interface RunTestsOptions {
  specPattern: string | null
  seed?: string
  stopOnFailure?: boolean
}

type CLIMessage = { type: 'run-tests'; options: RunTestsOptions }

export function handleTestExecution(ws: WebSocket, options: RunTestsOptions): Promise<{ success: boolean }> {
  return new Promise((resolve, reject) => {
    // Send run-tests message to browser
    const runTestsMessage: CLIMessage = { type: 'run-tests', options }
    ws.send(JSON.stringify(runTestsMessage))

    // Test execution state - independent per connection
    const testState = {
      total: 0,
      specResults: [] as jasmine.SpecResult[],
      suiteResults: [] as jasmine.SuiteResult[],
      overallResult: null as jasmine.JasmineDoneInfo | null,
    }

    function countSpecsByStatus(status: string) {
      return testState.specResults.reduce((count, spec) => (spec.status === status ? count + 1 : count), 0)
    }

    function handleJasmineStarted(data: jasmine.JasmineStartedInfo) {
      testState.total = data.totalSpecsDefined
      console.log(`\nStarting test execution: ${data.totalSpecsDefined} specs`)
      if (data.order.random) {
        console.log(`Randomized with seed: ${data.order.seed}`)
      }
      console.log('')
    }

    function handleSpecStarted(data: jasmine.SpecResult) {
      // Optional: Could log spec start if desired
    }

    function handleSpecDone(data: jasmine.SpecResult) {
      testState.specResults.push(data)

      // Display progress indicator
      if (data.status === 'passed') {
        process.stdout.write('.')
      } else if (data.status === 'failed') {
        process.stdout.write('F')
      } else if (data.status === 'pending') {
        process.stdout.write('*')
      } else if (data.status === 'excluded') {
        process.stdout.write('-')
      }

      // Show progress every 50 specs
      if (testState.specResults.length % 50 === 0) {
        process.stdout.write(` ${testState.specResults.length}/${testState.total}\n`)
      }
    }

    function handleSuiteStarted(data: jasmine.SuiteResult) {
      // Optional: Could log suite start if desired
    }

    function handleSuiteDone(data: jasmine.SuiteResult) {
      testState.suiteResults.push(data)
    }

    function handleJasmineDone(data: jasmine.JasmineDoneInfo) {
      testState.overallResult = data

      // Calculate counts from collected results
      const passed = countSpecsByStatus('passed')
      const failed = countSpecsByStatus('failed')
      const pending = countSpecsByStatus('pending')
      const excluded = countSpecsByStatus('excluded')

      // Print final summary
      console.log('\n\n' + '='.repeat(60))
      console.log('TEST RESULTS')
      console.log('='.repeat(60))
      console.log(`✅ ${passed} passed | ❌ ${failed} failed | ⏭️  ${pending} pending | ⊘ ${excluded} excluded`)

      const failedSpecs = testState.specResults.filter((spec) => spec.status === 'failed')
      if (failedSpecs.length > 0) {
        console.log('\nFailed tests:')
        failedSpecs.forEach((spec) => {
          console.log(`\n  ❌ ${spec.fullName}`)
          spec.failedExpectations.forEach((expectation) => {
            console.log(`     ${expectation.stack || expectation.message}`)
          })
        })
      }

      const failedSuites = testState.suiteResults.filter((suite) => suite.status === 'failed')
      if (failedSuites.length > 0) {
        console.log('\nFailed suites:')
        failedSuites.forEach((suite) => {
          console.log(`\n  ❌ ${suite.fullName}`)
          suite.failedExpectations.forEach((expectation) => {
            console.log(`     ${expectation.stack || expectation.message}`)
          })
        })
      }

      if (data.failedExpectations.length > 0) {
        console.log('\nGlobal failures:')
        data.failedExpectations.forEach((expectation) => {
          console.log(`  ${expectation.stack || expectation.message}`)
        })
      }

      console.log('='.repeat(60))

      // Resolve promise with test results
      const success = failed === 0 && data.failedExpectations.length === 0
      resolve({ success })
    }

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as JasmineMessage

        switch (message.type) {
          case 'jasmine-started':
            handleJasmineStarted(message.data)
            break
          case 'spec-started':
            handleSpecStarted(message.data)
            break
          case 'spec-done':
            handleSpecDone(message.data)
            break
          case 'suite-started':
            handleSuiteStarted(message.data)
            break
          case 'suite-done':
            handleSuiteDone(message.data)
            break
          case 'jasmine-done':
            handleJasmineDone(message.data)
            break
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error)
        reject(error)
      }
    })

    ws.on('close', () => {
      console.log('\nBrowser disconnected')
    })

    ws.on('error', (error) => {
      console.error('WebSocket error:', error)
      reject(error)
    })
  })
}
