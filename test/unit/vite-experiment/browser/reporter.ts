import type { ClientMessage } from '../types/messages'

export function createJasmineReporter(ws: WebSocket) {
  const specResults: jasmine.SpecResult[] = []
  const suitesResults: jasmine.SuiteResult[] = []
  let overallResult: jasmine.JasmineDoneInfo | undefined

  function sendMessage(message: ClientMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  return {
    jasmineStarted(data: jasmine.JasmineStartedInfo) {
      sendMessage({
        type: 'jasmine-started',
        data,
      })
    },

    jasmineDone(result: jasmine.JasmineDoneInfo) {
      overallResult = result
      sendMessage({
        type: 'jasmine-done',
        data: result,
      })

      console.group('Test execution complete')

      if (overallResult?.order.random) {
        console.log(`Jasmine randomized with seed: ${overallResult.order.seed}`)
      }

      function countSpecsByStatus(status: string) {
        return specResults.reduce((count, spec) => (spec.status === status ? count + 1 : count), 0)
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

      const failedSpecs = specResults.filter((spec: any) => spec.status === 'failed')
      if (failedSpecs.length > 0) {
        console.group('\nFailed tests:')
        failedSpecs.forEach((spec: any) => {
          console.group(`\n❌ ${spec.fullName}`)
          printFailedExpectations(spec.failedExpectations)
          console.groupEnd()
        })
        console.groupEnd()
      }

      const failedSuites = suitesResults.filter((suite: any) => suite.status === 'failed')
      if (failedSuites.length > 0) {
        console.group('\nFailed suites:')
        failedSuites.forEach((suite: any) => {
          console.group(`\n❌ ${suite.fullName}`)
          printFailedExpectations(suite.failedExpectations)
          console.groupEnd()
        })
        console.groupEnd()
      }

      if (overallResult?.failedExpectations.length ?? 0 > 0) {
        console.group('\nGlobal failed expectations:')
        printFailedExpectations(overallResult.failedExpectations)
        console.groupEnd()
      }

      function printFailedExpectations(expectations: any[]) {
        expectations.forEach((expectation: any) => {
          console.error(expectation.stack)
        })
      }
    },

    suiteStarted(result: jasmine.SuiteResult) {
      sendMessage({
        type: 'suite-started',
        data: result,
      })
    },

    suiteDone(result: jasmine.SuiteResult) {
      suitesResults.push(result)
      sendMessage({
        type: 'suite-done',
        data: result,
      })
    },

    specStarted(result: jasmine.SpecResult) {
      sendMessage({
        type: 'spec-started',
        data: result,
      })
    },

    specDone(specResult: jasmine.SpecResult) {
      specResults.push(specResult)

      if (specResult.status === 'passed') {
        console.log(specResult.fullName, '✅')
      } else if (specResult.status === 'failed') {
        console.error(specResult.fullName, '❌')
      }

      sendMessage({
        type: 'spec-done',
        data: specResult,
      })
    },
  }
}
