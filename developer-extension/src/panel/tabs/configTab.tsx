import { Table } from 'bumbag'
import React from 'react'
import { useStore } from '../useStore'

export function ConfigTab(props: { product: string }) {
  const [{ local }] = useStore()
  const currentTabStore = local[chrome.devtools.inspectedWindow.tabId]
  const config = props.product === 'rum' ? currentTabStore?.rumConfig : currentTabStore?.logsConfig
  return config ? (
    <Table isStriped>
      <Table.Head>
        <Table.Row>
          <Table.HeadCell>Attribute</Table.HeadCell>
          <Table.HeadCell>Value</Table.HeadCell>
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {Object.entries(config).map(([attribute, value]) => (
          <Table.Row key={attribute}>
            <Table.Cell>{attribute}</Table.Cell>
            <Table.Cell>{JSON.stringify(value)}</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  ) : null
}
