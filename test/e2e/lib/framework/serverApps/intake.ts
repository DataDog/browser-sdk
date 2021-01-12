import express from 'express'
import { EventRegistry } from '../eventsRegistry'

export function createIntakeServerApp(events: EventRegistry) {
  const app = express()

  app.use(express.text())

  app.post('/v1/input/:endpoint', (req, res) => {
    const endpoint = req.params.endpoint
    if (endpoint === 'rum' || endpoint === 'logs' || endpoint === 'internalMonitoring') {
      ;(req.body as string).split('\n').map((rawEvent) => events.push(endpoint, JSON.parse(rawEvent)))
    }
    res.end()
  })

  return app
}
