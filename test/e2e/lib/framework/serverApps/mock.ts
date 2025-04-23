import type { ServerResponse } from 'http'
import * as url from 'url'
import cors from 'cors'
import express from 'express'
import { getSdkBundlePath, getTestAppBundlePath } from '../sdkBuilds'
import type { MockServerApp, Servers } from '../httpServers'
import { DEV_SERVER_BASE_URL } from '../../helpers/playwright'

export const LARGE_RESPONSE_MIN_BYTE_SIZE = 100_000

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
    generateLargeResponse(res, chunkText)
  })

  app.get('/large-response', (_req, res) => {
    const chunkText = 'foofoobarbar\n'.repeat(50)
    generateLargeResponse(res, chunkText)
  })

  function generateLargeResponse(res: ServerResponse, chunkText: string) {
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
  }

  app.get('/unknown', (_req, res) => {
    res.status(404).send('Not found')
  })

  app.get('/empty.css', (_req, res) => {
    res.header('content-type', 'text/css').end()
  })

  app.get('/ok', (req, res) => {
    res.header('Content-Type', 'text/plain')
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

  app.get('/no-blob-worker-csp', (_req, res) => {
    res.header(
      'Content-Security-Policy',
      [
        `connect-src ${servers.intake.url} ${servers.base.url} ${servers.crossOrigin.url}`,
        "script-src 'self' 'unsafe-inline'",
      ].join(';')
    )
    res.send(setup)
    res.end()
  })

  app.get(/datadog-(?<packageName>[a-z-]*)\.js/, (req, res) => {
    const { originalUrl, params } = req

    if (process.env.CI) {
      res.sendFile(getSdkBundlePath(params.packageName, originalUrl))
    } else {
      forwardToDevServer(req.originalUrl, res)
    }
  })

  app.get('/worker.js', (req, res) => {
    if (process.env.CI) {
      res.sendFile(getSdkBundlePath('worker', req.originalUrl))
    } else {
      forwardToDevServer(req.originalUrl, res)
    }
  })

  app.get(/(?<appName>app|react-app).js$/, (req, res) => {
    const { originalUrl, params } = req
    res.sendFile(getTestAppBundlePath(params.appName, originalUrl))
  })

  return Object.assign(app, {
    getLargeResponseWroteSize() {
      return largeResponseBytesWritten
    },
  })
}

// We fetch and pipe the file content instead of redirecting to avoid creating different behavior between CI and local dev
// This way both environments serve the files from the same origin with the same CSP rules
function forwardToDevServer(originalUrl: string, res: ServerResponse) {
  const url = `${DEV_SERVER_BASE_URL}${originalUrl}`

  fetch(url)
    .then(({ body, headers }) => {
      void body?.pipeTo(
        new WritableStream({
          start() {
            headers.forEach((value, key) => res.setHeader(key, value))
          },
          write(chunk) {
            res.write(chunk)
          },
          close() {
            res.end()
          },
        })
      )
    })
    .catch(() => console.error(`Error fetching ${url}, did you run 'yarn dev'?`))
}
