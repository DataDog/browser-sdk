import type { AddressInfo } from 'node:net'
import { appendFileSync, writeFileSync } from 'node:fs'
import express from 'express'
import middleware from 'webpack-dev-middleware'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import webpack from 'webpack'
import cors from 'cors'
import webpackBase from '../../../webpack.base.ts'
import { printLog } from '../../lib/executionUtils.ts'
// eslint-disable-next-line local-rules/disallow-test-import-export-from-src, local-rules/disallow-protected-directory-import
import { createIntakeProxyMiddleware } from '../../../test/e2e/lib/framework/intakeProxyMiddleware.ts'
import { INTAKE_REQUESTS_FILE } from './state.ts'

const sandboxPath = './sandbox'
const START_PORT = 8080
const MAX_PORT = 8180
const PACKAGES_WITH_BUNDLE = ['rum', 'rum-slim', 'logs', 'flagging', 'worker']

export function runServer({ writeIntakeFile = true }: { writeIntakeFile?: boolean } = {}): void {
  if (writeIntakeFile) {
    writeFileSync(INTAKE_REQUESTS_FILE, '')
  }

  process.on('SIGTERM', () => {
    printLog('Dev server exiting.')
    process.exit(0)
  })

  const app = express()

  app.use((_req, res, next) => {
    res.setHeader('Document-Policy', 'js-profiling')
    next()
  })

  app.post(
    '/proxy',
    createIntakeProxyMiddleware({
      onRequest: (request) => {
        let message: string
        if (request.intakeType === 'replay') {
          message = `${request.segment.records.length} records`
        } else if (request.intakeType === 'profile') {
          message = '1 profile'
        } else {
          message = `${request.events.length} events`
        }
        printLog(`${request.intakeType} request:`.padEnd(16), message)
        if (writeIntakeFile) {
          appendFileSync(INTAKE_REQUESTS_FILE, `${JSON.stringify(request)}\n`)
        }
      },
    })
  )

  app.use(createStaticSandboxApp())

  app.use('/react-app', createReactApp())

  listenOnAvailablePort(app, START_PORT)
}

function listenOnAvailablePort(app: express.Application, port: number): void {
  const server = app.listen(port)
  server.on('listening', () => {
    const actualPort = (server.address() as AddressInfo).port
    printLog(`Dev server listening on port ${actualPort}.`)
    if (process.send) {
      process.send({ port: actualPort })
    }
  })
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && port < MAX_PORT) {
      printLog(`Port ${port} is already in use, trying ${port + 1}...`)
      server.close(() => listenOnAvailablePort(app, port + 1))
    } else {
      throw err
    }
  })
}

function createStaticSandboxApp(): express.Application {
  const app = express()
  app.use(cors())
  app.use(express.static(sandboxPath))
  for (const packageName of PACKAGES_WITH_BUNDLE) {
    const packagePath = `./packages/${packageName}`
    app.use(
      middleware(
        webpack(
          webpackBase({
            mode: 'development',
            entry: `${packagePath}/src/entries/main.ts`,
            filename: packageName === 'worker' ? 'worker.js' : `datadog-${packageName}.js`,
          })
        ),
        { stats: 'minimal' }
      )
    )
  }

  // Redirect suffixed files
  app.use((req, res, next) => {
    const matches = /(.*)-(canary|staging|v\d*)\.js/.exec(req.url)
    if (matches) {
      res.redirect(`${matches[1]}.js`)
    } else {
      next()
    }
  })

  return app
}

function createReactApp(): express.Application {
  const app = express()

  // Redirect requests to the "index.html" file, so that the React app can handle routing
  app.use((req, _, next) => {
    if (req.url !== '/main.js') {
      req.url = '/index.html'
    }
    next()
  })

  app.use(
    middleware(
      webpack(
        webpackBase({
          entry: `${sandboxPath}/react-app/main.tsx`,
          plugins: [new HtmlWebpackPlugin({ publicPath: '/react-app/' })],
          mode: 'development',
        })
      ),
      { stats: 'minimal' }
    )
  )

  return app
}
