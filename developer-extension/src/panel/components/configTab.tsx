import { Table } from '@mantine/core'
import React from 'react'
import { useStore } from '../hooks/useStore'

export function ConfigTab(props: { product: string }) {
  const [{ local }] = useStore()
  const currentTabStore = local[chrome.devtools.inspectedWindow.tabId]
  const config = props.product === 'rum' ? currentTabStore?.rumConfig : currentTabStore?.logsConfig
  return config ? (
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
  ) : null
}
