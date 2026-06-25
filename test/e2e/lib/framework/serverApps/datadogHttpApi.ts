import express from 'express'
import cors from 'cors'
import { createIntakeProxyMiddleware } from '../intakeProxyMiddleware.ts'
import type { IntakeRegistry } from '../intakeRegistry'
import { createDebuggerHttpApi } from './debuggerHttpApi'
import type { DebuggerHttpApiControl } from './debuggerHttpApi'

export interface DatadogHttpApiControl {
  debugger: DebuggerHttpApiControl
}

export interface DatadogHttpApi {
  app: express.Express
  control: DatadogHttpApiControl
}

export function createDatadogHttpApi(intakeRegistry: IntakeRegistry): DatadogHttpApi {
  const app = express()
  const debuggerHttpApi = createDebuggerHttpApi()

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

  app.use(debuggerHttpApi.router)

  return {
    app,
    control: {
      debugger: debuggerHttpApi.control,
    },
  }
}
