import React, { useEffect, useReducer, useState } from 'react'
import { Button, Grid, Text } from '@mantine/core'
import type { BackgroundTestResult } from 'src/common/extension.types'
import { useEnvInfo } from '../../../hooks/useEnvInfo'
import { onBackgroundMessage } from '../../../backgroundScriptConnection'
import { evalInWindow } from '../../../evalInWindow'
import { TabBase } from '../../tabBase'
import { createLogger } from '../../../../common/logger'
import type { Test } from './data'
import { data } from './data'

const TEST_RESULT_CALLBACK = '__dd_testResultCallback'
const ASYNC_TEST_REGEX = /asyncTestPassed/

const logger = createLogger('DiagnosticTab')

function testScriptSync(expr: string, id: string) {
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

function testScriptAsync(expr: string, id: string) {
  try {
    void evalInWindow(`
      (function () {
        var asyncTestPassed = () => ${TEST_RESULT_CALLBACK}('${id}', 'passed')
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

function useSetupTestInBackgroundScript(dispatchResult: React.Dispatch<BackgroundTestResult>) {
  const [ready, setReady] = useState<boolean>(false)

  useEffect(() => {
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
        }`).then(() => setReady(true))
    } catch (error) {
      logger.error('Failed to setup tests in background script:', error)
    }
  }, [])

  useEffect(() => {
    if (ready) {
      return
    }

    onBackgroundMessage.subscribe((backgroundMessage) => {
      if (backgroundMessage.type !== 'sdk-message' || backgroundMessage.message.type !== 'test-result') {
        return
      }

      dispatchResult(backgroundMessage.message.payload)
    })
  }, [ready])
}

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

function extractTestCode(exec: () => void): string | undefined {
  // see if the code is encoded in a comment
  let expr = String(exec).match(/[^]*\/\*([^]*)\*\/\s*\}$/)?.[1]

  if (!expr) {
    expr = `return (function ${String(exec)})()`
  }

  return expr
}

const sanitize = function (s: string) {
  return s.replace(/[^a-zA-Z0-9 ]/g, '').replace(/ /g, '-')
}

export function DiagnosticTab() {
  const [results, dispatchResult] = useReducer(resultReducer, {})
  const env = useEnvInfo()
  useSetupTestInBackgroundScript(dispatchResult)

  function runTest(test: Test | Test[]) {
    if (Array.isArray(test)) {
      return test.forEach((test) => runTest(test))
    }

    if (test.subtests) {
      test.subtests.forEach((subtest) => runTest(subtest))
    }

    if (test.exec) {
      const name = test.name
      const id = sanitize(name)

      const expr = extractTestCode(test.exec)

      if (!expr) {
        logger.error('Failed to extract test code from:', test.exec)
        return
      }

      dispatchResult({ id, status: 'running' })

      const status = ASYNC_TEST_REGEX.test(expr) ? testScriptAsync(expr, id) : testScriptSync(expr, id)

      if (status === false) {
        dispatchResult({ id, status: 'failed' })
      }
    }
  }

  function onClick() {
    dispatchResult('reset')
    runTest(data)
  }

  return (
    <TabBase>
      <Grid mt="sm" mx="sm">
        <Grid.Col span={{ md: 8, sm: 12 }}>
          <Text size={'xl'}>Framework</Text>
          {env?.map((e) => (
            <Text>
              {e.name} : {e.version}
            </Text>
          ))}
        </Grid.Col>
      </Grid>

      <Grid mt="sm" mx="sm">
        <Grid.Col span={{ md: 8, sm: 12 }}>
          <Text size={'xl'}>Diagnostic</Text>
          <Button onClick={onClick}>Run Diagnostic</Button>
          Test run: {Object.keys(results).length} (
          {Object.values(results).filter((result) => result.status === 'passed').length} passed,{' '}
          {Object.values(results).filter((result) => result.status === 'failed').length} failed)
          <Test test={data} results={results} />
        </Grid.Col>
      </Grid>
    </TabBase>
  )
}

function Test({ test, results }: { test: Test | Test[]; results: { [key: string]: BackgroundTestResult } }) {
  if (Array.isArray(test)) {
    return test.map((test) => <Test key={test.name} test={test} results={results} />)
  }

  if (test.subtests) {
    return (
      <>
        <Text fw={500}>{test.name}</Text>
        <div style={{ marginLeft: 20 }}>
          <Test test={test.subtests} results={results} />
        </div>
      </>
    )
  }

  return (
    <Text>
      {test.name}: <Status status={results[sanitize(test.name)]?.status} />
    </Text>
  )
}

const STATUS_TO_EMOJI = {
  passed: '✅',
  failed: '❌',
  running: '⏳',
}

function Status({ status }: { status: BackgroundTestResult['status'] }) {
  return <Text component="span">{STATUS_TO_EMOJI[status] || '❓'}</Text>
}
