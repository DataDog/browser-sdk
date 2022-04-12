import { SegmentedControl, Table } from '@mantine/core'
import React, { useState } from 'react'
import { useSdkConfig } from '../useSdkConfig'

export function ConfigTab() {
  const [sdk, setSdk] = useState<'rum' | 'logs'>('rum')
  const { rumConfig, logsConfig } = useSdkConfig()
  const config = sdk === 'rum' ? rumConfig : logsConfig

  return (
    <>
      <SegmentedControl
        value={sdk}
        onChange={(sdk: 'rum' | 'logs') => setSdk(sdk)}
        data={[
          { label: 'RUM', value: 'rum' },
          { label: 'Logs', value: 'logs' },
        ]}
      />
      {config && (
        <Table striped>
          <thead>
            <tr>
              <th>Attribute</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(config).map(([attribute, value]) => (
              <tr key={attribute}>
                <td>{attribute}</td>
                <td>{JSON.stringify(value)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  )
}
