import React from 'react'
import { Button, Grid, Text } from '@mantine/core'
import { setupTestResultCallback, useTest } from '../../../hooks/useTest'
import { useEnvInfo } from '../../../hooks/useEnvInfo'
import { TabBase } from '../../tabBase'
import { data as testData } from './data'

// This is not a unit test
// eslint-disable-next-line local-rules/disallow-test-import-export-from-src
import { TestResult } from './testResult'

export function DiagnosticTab() {
  const { reset, results, run } = useTest()
  const env = useEnvInfo()

  function onClickRunDiagnostic() {
    reset()
    setupTestResultCallback()
    run(testData)
  }

  return (
    <TabBase>
      <Grid mt="sm" mx="sm">
        <Grid.Col span={{ md: 8, sm: 12 }}>
          <Text size={'xl'}>Libraries:</Text>
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
          <Button onClick={onClickRunDiagnostic}>Run Diagnostic</Button>
          Test run: {Object.keys(results).length} (
          {Object.values(results).filter((result) => result.status === 'passed').length} passed,{' '}
          {Object.values(results).filter((result) => result.status === 'failed').length} failed)
          <TestResult test={testData} results={results} />
        </Grid.Col>
      </Grid>
    </TabBase>
  )
}
