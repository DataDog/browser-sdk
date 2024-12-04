import { Text } from '@mantine/core'
import React from 'react'
import type { BackgroundTestResult } from 'src/common/extension.types'
import { sanitize } from '../../../hooks/useTest'
import type { Test } from '../../../hooks/useTest'

export function TestResult({
  test,
  results,
}: {
  test: Test | Test[]
  results: { [key: string]: BackgroundTestResult }
}) {
  if (Array.isArray(test)) {
    return test.map((test) => <TestResult key={test.name} test={test} results={results} />)
  }

  if (test.subtests) {
    return (
      <>
        <Text fw={500}>{test.name}</Text>
        <div style={{ marginLeft: 20 }}>
          <TestResult test={test.subtests} results={results} />
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
