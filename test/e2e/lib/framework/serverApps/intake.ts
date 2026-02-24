import connectBusboy from 'connect-busboy'
import express from 'express'
import cors from 'cors'
import { createIntakeProxyMiddleware } from '../intakeProxyMiddleware.ts'
import type { IntakeRegistry } from '../intakeRegistry'

export function createIntakeServerApp(intakeRegistry: IntakeRegistry) {
  const app = express()

  app.use(cors())
  app.use(connectBusboy({ immediate: true }))

  app.post('/', createIntakeProxyMiddleware({ onRequest: (request) => intakeRegistry.push(request) }))

  return app
}
