import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node'
import express from 'express'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { getSsrLeakReport } from './ssr-leak-probe'

const browserDistFolder = join(import.meta.dirname, '../browser')

const app = express()
const angularApp = new AngularNodeAppEngine()

/**
 * Test-only: forces a garbage collection and reports how many server renders are still in memory.
 */
app.get('/__ssr-leak', async (req, res) => {
  res.json(await getSsrLeakReport())
})

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  })
)

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next)
})

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000
  const server = app.listen(port, (error) => {
    if (error) {
      throw error
    }

    // The actual port, as the e2e tests start the server with PORT=0
    console.log(`Node Express server listening on http://localhost:${(server.address() as AddressInfo).port}`)
  })
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app)
