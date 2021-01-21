import cors from 'cors'
import express from 'express'
import * as url from 'url'
import { buildLogs, buildNpm, buildRum, buildRumRecorder, Endpoints } from '../sdkBuilds'

export function createMockServerApp(endpoints: Endpoints, setup: string) {
  const app = express()

  app.use(cors())
  app.disable('etag') // disable automatic resource caching

  app.get('/empty', (req, res) => {
    res.end()
  })

  app.get('/favicon.ico', (req, res) => {
    res.end()
  })

  app.get('/throw', (req, res) => {
    res.status(500).send('Server error')
  })

  app.get('/unknown', (req, res) => {
    res.status(404).send('Not found')
  })

  app.get('/empty.css', (req, res) => {
    res.header('content-type', 'text/css').end()
  })

  app.get('/ok', (req, res) => {
    if (req.query['timing-allow-origin'] === 'true') {
      res.set('Timing-Allow-Origin', '*')
    }
    const timeoutDuration = req.query.duration ? Number(req.query.duration) : 0
    setTimeout(() => res.send('ok'), timeoutDuration)
  })

  app.get('/redirect', (req, res) => {
    const redirectUri = url.parse(req.originalUrl)
    res.redirect(`ok${redirectUri.search}`)
  })

  app.get('/headers', (req, res) => {
    res.send(JSON.stringify(req.headers))
  })

  app.get('/', (req, res) => {
    res.send(setup)
    res.end()
  })

  app.get('/datadog-logs.js', async (req, res) => {
    res.header('content-type', 'application/javascript').send(await buildLogs(endpoints))
  })

  app.get('/datadog-rum.js', async (req, res) => {
    res.header('content-type', 'application/javascript').send(await buildRum(endpoints))
  })

  app.get('/datadog-rum-recorder.js', async (req, res) => {
    res.header('content-type', 'application/javascript').send(await buildRumRecorder(endpoints))
  })

  app.get('/app.js', async (req, res) => {
    res.header('content-type', 'application/javascript').send(await buildNpm(endpoints))
  })

  return app
}
