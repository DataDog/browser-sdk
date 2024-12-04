import { useReducer, useCallback, useEffect } from 'react'
import type { BackgroundTestResult } from 'src/common/extension.types'
import { createLogger } from '../../../common/logger'
import type { Test } from './type'
import { sanitize } from './sanitize'
import { extractTestCode, startTestResultCollection, testScriptAsync, testScriptSync } from './setup'

const ASYNC_TEST_REGEX = /asyncTestPassed/
const logger = createLogger('useTest')

function resultReducer(state: { [key: string]: BackgroundTestResult }, action: BackgroundTestResult | 'reset') {
  if (action === 'reset') {
    return {}
  }

  return {
    ...state,
    [action.id]: {
      ...state[action.id],
      ...action,
    },
  }
}

export function useTest() {
  const [results, dispatchResult] = useReducer(resultReducer, {})
  const reset = useCallback(() => dispatchResult('reset'), [])
  const run = useCallback((test: Test | Test[]) => {
    if (Array.isArray(test)) {
      return test.forEach((test) => run(test))
    }

    if (test.subtests) {
      return test.subtests.forEach((subtest) => run(subtest))
    }

    if (test.exec) {
      const name = test.name
      const id = sanitize(name)

      dispatchResult({ id, status: 'running' })
      const expr = extractTestCode(test.exec)

      if (!expr) {
        logger.error('Failed to extract test code from:', test.exec)
        return
      }

      const status = ASYNC_TEST_REGEX.test(expr) ? testScriptAsync(expr, id) : testScriptSync(expr, id)

      if (status === false) {
        dispatchResult({ id, status: 'failed' })
      }
    }
  }, [])

  useEffect(() => {
    const { stop } = startTestResultCollection(dispatchResult)

    return stop
  }, [])

  return { results, reset, run }
}
