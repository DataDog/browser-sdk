import { Table } from '@mantine/core'
import React, { useRef } from 'react'

import { isRumViewEvent, SdkEvent } from '../../../sdkEvent'
import classes from './vulnerabilitiesList.module.css'
import { VulnerabilitiesListColumn } from './columnUtils'
import { VulnerabilitiesListHeader } from './vulnerabilitiesListHeader'
import { VulnerabilityRow } from './vulnerabilityRow'
import { RumActionEvent } from '@datadog/browser-rum-core'
import { VulnerabilityFromTracerRow } from './vulnerabilityFromTracerRow'

export function VulnerabilitiesList({
  vulnerabilitiesFromTracer,
  vulnerabilities,
  columns
}: {
  vulnerabilitiesFromTracer: any[],
  vulnerabilities: RumActionEvent[],
  columns: VulnerabilitiesListColumn[]
}) {
  const headerRowRef = useRef<HTMLTableRowElement>(null)
  
  return (
    <div className={classes.root}>
      <Table stickyHeader>
        <colgroup>
          {columns.map((_, index) => (
            <col
              key={index}
              data-growable={
                // Only the last column is allowed to grow
                index === columns.length - 1 || undefined
              }
            />
          ))}
        </colgroup>
        <VulnerabilitiesListHeader
          ref={headerRowRef}
          columns={columns}
        />

        <Table.Tbody>
          {vulnerabilities.map((vulnerability) => (
            <VulnerabilityRow
              key={getEventRenderingKey(vulnerability, false)}
              vulnerability={vulnerability}
              columns={columns}
            />
          ))}
          {vulnerabilitiesFromTracer.map((vulnerability) => (
            <VulnerabilityFromTracerRow
              key={vulnerability.hash}
              vulnerability={vulnerability}
              columns={columns}
            />
          ))}
        </Table.Tbody>
      </Table>
    </div>
  )
}

const eventRenderingKeys = new WeakMap<SdkEvent, number>()
let nextEventRenderingKey = 1

function getEventRenderingKey(event: SdkEvent, excludeOutdatedVersions: boolean): number | string {
  // If we are showing only the latest view updates, return the view.id as key so the component is
  // simply updated and not recreated when a new update comes up.
  if (isRumViewEvent(event) && excludeOutdatedVersions) {
    return event.view.id
  }

  // Else return an ever-increasing id identifying each event instance.
  let key = eventRenderingKeys.get(event)
  if (key === undefined) {
    key = nextEventRenderingKey
    nextEventRenderingKey += 1
    eventRenderingKeys.set(event, key)
  }
  return key
}
