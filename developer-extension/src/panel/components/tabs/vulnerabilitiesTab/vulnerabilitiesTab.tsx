import React, { useState } from 'react'
import { Center, Text } from '@mantine/core'

import { TabBase } from '../../tabBase'
import { VulnerabilitiesList } from './vulnerabilitiesList'
import { VulnerabilitiesListColumn } from './columnUtils'
import { RumActionEvent } from '@datadog/browser-rum-core'
import { VulnerabilitiesTabTop } from './vulnerabilitiesTabTop'

interface VulnerabilitiesTabProps {
  vulnerabilities: RumActionEvent[],
  columns: VulnerabilitiesListColumn[],
  columnsFromTracer: VulnerabilitiesListColumn[],
  clear: () => void
}

export function VulnerabilitiesTab({
  vulnerabilities,
  columns,
  columnsFromTracer,
  clear
}: VulnerabilitiesTabProps) {

  const [vulnerabilitiesFromTracer, setVulnerabilitiesFromTracer] = useState<any[]>([])

  function readVulnerabilities(path: string) {
    fetch(path)
      .then(response => response.text())
      .then(text => setVulnerabilitiesFromTracer(parseTraces(text)))
      .catch(console.error)
  }
  
  return (
    <TabBase
      top={<VulnerabilitiesTabTop clear={clear} readVulnerabilities={readVulnerabilities} />}
    >
      {vulnerabilities.length === 0 && vulnerabilitiesFromTracer.length === 0? (
        <Center>
          <Text size="xl" c="dimmed" fw="bold">
            No vulnerabilities
          </Text>
        </Center>
      ) : <></>
      }
      {vulnerabilities.length > 0 ? (
        <VulnerabilitiesList
          title={"Client vulnerabilities"}
          vulnerabilities={vulnerabilities}
          columns={columns}
        />
        ) : <></>
      }
      {vulnerabilitiesFromTracer.length > 0 ? (
        <VulnerabilitiesList
          title={"App vulnerabilities"}
          vulnerabilities={vulnerabilitiesFromTracer}
          columns={columnsFromTracer}
        />
      ) : <></>
      }
    </TabBase>
  )
}

function parseTraces(data: string): any[] {
  const lines = data.split(/(?:\r\n|\r|\n)/g);

  const traces: any[] = []
  lines.forEach(line => {
    try {
      if (line) {
        traces.push(JSON.parse(line))
      }
    } catch (e) {
      console.log(`discarding "${line}"`)
    }
  });
  
  const vulns: any[] = []
  const hashes: any[] = []
  traces.forEach((t :any) => {
    t.traces.forEach((t2: any) => {
      t2.forEach((t3: any) => {
        if (t3.meta['_dd.iast.json'] !== undefined) {
          [...JSON.parse(t3.meta['_dd.iast.json']).vulnerabilities].forEach(v => {
            if (!hashes.includes(v.hash)) {
              hashes.push(v.hash)
              vulns.push(v)
            }
          })
        }
      })
    })
  })
  
  return vulns
}


