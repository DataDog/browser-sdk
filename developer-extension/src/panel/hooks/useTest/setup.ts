import type { BackgroundTestResult } from 'src/common/extension.types'
import { evalInWindow } from '../../evalInWindow'
import { createLogger } from '../../../common/logger'
import { onBackgroundMessage } from '../../backgroundScriptConnection'

const TEST_RESULT_CALLBACK = '__dd_testResultCallback'

const logger = createLogger('DiagnosticTab')

export function testScriptSync(expr: string, id: string) {
  try {
    void evalInWindow(`
      (function () {
        try {
          ${expr}
        } catch(err) {
          return false
        }
      })() ? ${TEST_RESULT_CALLBACK}('${id}', 'passed') : ${TEST_RESULT_CALLBACK}('${id}', 'failed')
      `)
  } catch (error) {
    logger.error('Failed to test script:', error)
    return false
  }
}

export function testScriptAsync(expr: string, id: string) {
  try {
    void evalInWindow(`
      (function () {
        var asyncTestPassed = () => ${TEST_RESULT_CALLBACK}('${id}', 'passed')
        var asyncTestFailed = () => ${TEST_RESULT_CALLBACK}('${id}', 'failed')
        try {
          ${expr}
        } catch(err) {
          return false
        }
      })()
    `)
  } catch (error) {
    logger.error('Failed to test script:', error)
    return false
  }
}

export function setupTestResultCallback() {
  try {
    void evalInWindow(`
      window.${TEST_RESULT_CALLBACK} = function (id, status) {
        const callback = window.__ddBrowserSdkExtensionCallback
        if (callback) {
          callback({
            type: 'test-result',
            payload: { status, id }
          })
        }
      }`)
  } catch (error) {
    logger.error('Failed to setup tests in background script:', error)
  }
}

export function startTestResultCollection(onTestResult: (result: BackgroundTestResult) => void) {
  const subscription = onBackgroundMessage.subscribe((backgroundMessage) => {
    if (backgroundMessage.type !== 'sdk-message' || backgroundMessage.message.type !== 'test-result') {
      return
    }

    onTestResult(backgroundMessage.message.payload)
  })

  return {
    stop: subscription.unsubscribe,
  }
}

export function extractTestCode(exec: () => void): string | undefined {
  // see if the code is encoded in a comment
  let expr = String(exec).match(/[^]*\/\*([^]*)\*\/\s*\}$/)?.[1]

  if (!expr) {
    expr = `return (function ${String(exec)})()`
  }

  return expr
}
