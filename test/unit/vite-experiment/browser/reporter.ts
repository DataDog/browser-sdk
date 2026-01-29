export function createJasmineReporter(ws: WebSocket) {
  const specResults: jasmine.SpecResult[] = []
  const suitesResults: jasmine.SuiteResult[] = []
  let overallResult: jasmine.JasmineDoneInfo | undefined

  function sendMessage(message: any) {
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

    specResults,
    suitesResults,
    get overallResult() {
      return overallResult
    },
  }
}
