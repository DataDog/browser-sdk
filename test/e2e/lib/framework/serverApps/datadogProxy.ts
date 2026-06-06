import express from 'express'
import cors from 'cors'
import { createIntakeProxyMiddleware } from '../intakeProxyMiddleware.ts'
import type { IntakeRegistry } from '../intakeRegistry'
import { addDebuggerDatadogProxy } from './debuggerDatadogProxy'

export function createDatadogProxyServer(intakeRegistry: IntakeRegistry) {
  const app = express()

  app.use(cors())

  app.post('/', createIntakeProxyMiddleware({ onRequest: (request) => intakeRegistry.push(request) }))

  // Quota admission check — always admit in the test environment.
  // Triggered via proxy-as-string with ddforwardSubdomain=quota.
  app.get('/', (req, res) => {
    if (req.query.ddforwardSubdomain === 'quota') {
      res.json({ data: { id: 'test', type: 'profiling-quota', attributes: { admitted: true, reason: 'quota_ok' } } })
    } else {
      res.status(404).end()
    }
  })

  return addDebuggerDatadogProxy({ app })
}
