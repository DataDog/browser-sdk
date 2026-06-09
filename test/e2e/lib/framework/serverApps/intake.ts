import express from 'express'
import cors from 'cors'
import { createIntakeProxyMiddleware } from '../intakeProxyMiddleware.ts'
import type { IntakeRegistry } from '../intakeRegistry'

export function createIntakeServerApp(intakeRegistry: IntakeRegistry) {
  const app = express()
  let debuggerProbes: object[] = []

  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
    next()
  })
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

  app.post('/api/unstable/debugger/frontend/probes', (_req, res) => {
    res.json({ nextCursor: '', updates: debuggerProbes, deletions: [] })
  })

  return Object.assign(app, {
    setDebuggerProbes(probes: object[]) {
      debuggerProbes = probes
    },
  })
}
