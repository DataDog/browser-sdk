import express from 'express'
import cors from 'cors'
import type { RemoteConfiguration } from '@datadog/browser-rum-core'
import { createIntakeProxyMiddleware } from '../intakeProxyMiddleware.ts'
import type { IntakeRegistry } from '../intakeRegistry'

export function createIntakeServerApp(intakeRegistry: IntakeRegistry, remoteConfiguration?: RemoteConfiguration) {
  const app = express()
  let debuggerProbes: object[] = []

  app.use(cors())

  app.post('/', createIntakeProxyMiddleware({ onRequest: (request) => intakeRegistry.push(request) }))

  app.get('/', (req, res) => {
    // Quota admission check — always admit in the test environment.
    // Triggered via proxy-as-string with ddforwardSubdomain=quota.
    if (req.query.ddforwardSubdomain === 'quota') {
      res.json({ data: { id: 'test', type: 'profiling-quota', attributes: { admitted: true, reason: 'quota_ok' } } })
    } else if (req.query.ddforwardSubdomain === 'sdk-configuration') {
      // Remote configuration fetch — proxied via ddforwardSubdomain=sdk-configuration.
      res.send(JSON.stringify(remoteConfiguration))
    } else {
      res.status(404).end()
    }
  })

  app.post('/api/unstable/debugger/frontend/probes', (_req, res) => {
    res.json({ nextCursor: '', updates: debuggerProbes, deletions: [] })
  })

  return Object.assign(app, {
    setDebuggerProbes(probes: object[]) {
      debuggerProbes = probes
    },
  })
}
