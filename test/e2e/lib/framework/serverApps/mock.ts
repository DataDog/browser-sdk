import * as url from 'url'
import cors from 'cors'
import express from 'express'
import { buildLogs, buildNpm, buildRum, buildRumSlim } from '../sdkBuilds'
import type { MockServerApp, Servers } from '../httpServers'

const LARGE_RESPONSE_MIN_BYTE_SIZE = 100_000

export function createMockServerApp(servers: Servers, setup: string): MockServerApp {
  const app = express()
  let largeResponseBytesWritten = 0

  app.use(cors())
  app.disable('etag') // disable automatic resource caching

  app.get('/empty', (_req, res) => {
    res.end()
  })

  app.get('/favicon.ico', (_req, res) => {
    res.end()
  })

  app.get('/throw', (_req, res) => {
    res.status(500).send('Server error')
  })

  app.get('/throw-large-response', (_req, res) => {
    res.status(500)

    const chunkText = 'Server error\n'.repeat(50)
    let bytesWritten = 0
    let timeoutId: NodeJS.Timeout

    res.on('close', () => {
      largeResponseBytesWritten = bytesWritten
      clearTimeout(timeoutId)
    })

    function writeMore() {
      res.write(chunkText, (error) => {
        if (error) {
          console.log('Write error', error)
        } else {
          bytesWritten += chunkText.length
          if (bytesWritten < LARGE_RESPONSE_MIN_BYTE_SIZE) {
            timeoutId = setTimeout(writeMore, 10)
          } else {
            res.end()
          }
        }
      })
    }

    writeMore()
  })

  app.get('/unknown', (_req, res) => {
    res.status(404).send('Not found')
  })

  app.get('/empty.css', (_req, res) => {
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
    res.redirect(`ok${redirectUri.search!}`)
  })

  app.get('/headers', (req, res) => {
    res.send(JSON.stringify(req.headers))
  })

  app.get('/', (_req, res) => {
    res.header(
      'Content-Security-Policy',
      [
        `connect-src ${servers.intake.url} ${servers.base.url} ${servers.crossOrigin.url}`,
        "script-src 'self' 'unsafe-inline'",
        'worker-src blob:',
      ].join(';')
    )
    res.send(setup)
    res.end()
  })

  app.get('/datadog-logs.js', async (_req, res) => {
    res.header('content-type', 'application/javascript').send(await buildLogs(servers.intake.url))
  })

  app.get('/datadog-rum.js', async (_req, res) => {
    res.header('content-type', 'application/javascript').send(await buildRum(servers.intake.url))
  })

  app.get('/datadog-rum-slim.js', async (_req, res) => {
    res.header('content-type', 'application/javascript').send(await buildRumSlim(servers.intake.url))
  })

  app.get('/app.js', async (_req, res) => {
    res.header('content-type', 'application/javascript').send(await buildNpm(servers.intake.url))
  })

  return Object.assign(app, {
    getLargeResponseWroteSize() {
      return largeResponseBytesWritten
    },
  })
}
