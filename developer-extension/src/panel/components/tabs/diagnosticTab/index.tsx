import React from 'react'
import { Box, Button, Flex, Grid } from '@mantine/core'
import { setupTestResultCallback, useTest } from '../../../hooks/useTest'
import { TabBase } from '../../tabBase'
import { Columns } from '../../columns'
import { data as testData } from './data'
import { ApiDiagnosticsTable } from './apiDiagnosticsTable'
import { EnvironmentInfoTable } from './environmentInfoTable'

// This is not a unit test
// eslint-disable-next-line local-rules/disallow-test-import-export-from-src
import { TestResult, TestSummary } from './testResult'

export function DiagnosticsTab() {
  const { reset, results, run } = useTest()

  function onClickRunDiagnostic() {
    reset()
    setupTestResultCallback()
    run(testData)
  }

  return (
    <TabBase>
      <Columns>
        <Columns.Column title='Behavior'>
          <Grid mt="sm" mx="sm">
            <Grid.Col span={{ md: 8, sm: 12 }}>
              <Flex direction='column'>
                <Button onClick={onClickRunDiagnostic}>Run Diagnostic</Button>
                <Box style={{ width: '1px', height: '1em ' }}></Box>
                <TestSummary results={results} />
                <Box style={{ width: '1px', height: '1em ' }}></Box>
                <TestResult test={testData} results={results} />
              </Flex>
            </Grid.Col>
          </Grid>
        </Columns.Column>
        <Columns.Column title='Environment'>
          <EnvironmentInfoTable />
          <ApiDiagnosticsTable />
        </Columns.Column>
      </Columns>
    </TabBase>
  )
}
