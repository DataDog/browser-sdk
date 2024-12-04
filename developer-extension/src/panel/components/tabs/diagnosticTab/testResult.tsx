import { Text } from '@mantine/core'
import React from 'react'
import type { BackgroundTestResult } from 'src/common/extension.types'
import { sanitize } from '../../../hooks/useTest'
import type { Test } from '../../../hooks/useTest'

export function TestResult({
  test,
  results,
  prefix = '',
}: {
  test: Test | Test[]
  results: { [key: string]: BackgroundTestResult }
  prefix?: string
}) {
  if (Array.isArray(test)) {
    return test.map((test) => <TestResult key={test.name} test={test} results={results} prefix={prefix} />)
  }

  if (test.subtests) {
    return (
      <>
        <Text fw={500}>{test.name}</Text>
        <div style={{ marginLeft: 20 }}>
          <TestResult test={test.subtests} results={results} prefix={`${prefix}${test.name} > `} />
        </div>
      </>
    )
  }

  return (
    <Text>
      {test.name}: <Status status={results[sanitize(prefix + test.name)]?.status} />
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

export function TestSummary({ results }: { results: { [key: string]: BackgroundTestResult } }) {
  const counts = countTestbyStatus(results)

  return (
    <Text component="span">{`Test Run: ${Object.keys(results).length} (${counts.passed} passed, ${counts.running} running, ${counts.failed} failed)`}</Text>
  )
}

export function countTestbyStatus(results: { [key: string]: BackgroundTestResult }) {
  const counts = {
    passed: 0,
    failed: 0,
    running: 0,
  }

  for (const result of Object.values(results)) {
    counts[result.status]++
  }

  return counts
}
