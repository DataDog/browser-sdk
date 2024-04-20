import React, { useState } from 'react'
import { Center, Text } from '@mantine/core'

import type { RumActionEvent } from '@datadog/browser-rum-core'
import { TabBase } from '../../tabBase'
import { VulnerabilitiesList } from './vulnerabilitiesList'
import type { VulnerabilitiesListColumn } from './columnUtils'
import { VulnerabilitiesTabTop } from './vulnerabilitiesTabTop'
import { useSettings } from '../../../hooks/useSettings'

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
  const [{ appVulnerabilities }] = useSettings()


  let timeout: number
  function readVulnerabilities(path: string = 'file:///tmp/_dd_trace_log') {
    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(() => {
      fetch(path)
        .then(response => response.text())
        .then(text => setVulnerabilitiesFromTracer(parseTraces(text)))
        .then(() => readVulnerabilities())
        .catch(console.error)
    }, 1000)
  }
  
  readVulnerabilities()
  return (
    <TabBase
      // top={<VulnerabilitiesTabTop clear={clear} readVulnerabilities={readVulnerabilities} />}
    >
      {vulnerabilities.length === 0 && !(appVulnerabilities && vulnerabilitiesFromTracer.length > 0) ? (
        <Center>
          <Text size="xl" c="dimmed" fw="bold" mt={"md"}>
            No vulnerabilities
          </Text>
        </Center>
      ) : <></>
      }
      {vulnerabilities.length > 0 ? (
        <VulnerabilitiesList
          title={'Client vulnerabilities'}
          vulnerabilities={vulnerabilities}
          columns={columns}
        />
        ) : <></>
      }
      {vulnerabilitiesFromTracer.length > 0 && appVulnerabilities ? (
        <VulnerabilitiesList
          title={'App vulnerabilities'}
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


