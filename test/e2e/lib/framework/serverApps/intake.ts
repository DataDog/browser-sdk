import express from 'express'
import cors from 'cors'
import { createIntakeProxyMiddleware } from '../intakeProxyMiddleware.ts'
import type { IntakeRegistry } from '../intakeRegistry'

export function createIntakeServerApp(intakeRegistry: IntakeRegistry) {
  const app = express()
  let debuggerProbes: object[] = []

  app.use(cors())

  app.post('/', createIntakeProxyMiddleware({ onRequest: (request) => intakeRegistry.push(request) }))

  app.post('/api/unstable/debugger/frontend/probes', (_req, res) => {
    res.json({ nextCursor: '', updates: debuggerProbes, deletions: [] })
  })

  return Object.assign(app, {
    setDebuggerProbes(probes: object[]) {
      debuggerProbes = probes
    },
  })
}
