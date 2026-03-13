import type { AddressInfo } from 'node:net'
import { spawnSync } from 'node:child_process'
import * as path from 'node:path'
import express from 'express'
import middleware from 'webpack-dev-middleware'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import webpack from 'webpack'
import cors from 'cors'
import webpackBase from '../webpack.base.ts'
import { printLog, runMain } from './lib/executionUtils.ts'

const sandboxPath = './sandbox'
const START_PORT = 8080
const MAX_PORT = 8180

const PACKAGES_WITH_BUNDLE = ['rum', 'rum-slim', 'logs', 'flagging', 'worker', 'remote-config']

runMain(() => {
  const app = express()
  app.use((_req, res, next) => {
    res.setHeader('Document-Policy', 'js-profiling')
    next()
  })
  app.use(createStaticSandboxApp())
  app.use('/react-app', createReactApp())
  app.use('/generated-bundle', createGeneratedBundleApp())
  listenOnAvailablePort(app, START_PORT)
})

function listenOnAvailablePort(app: express.Application, port: number): void {
  const server = app.listen(port)
  server.on('listening', () => printLog(`Server listening on port ${(server.address() as AddressInfo).port}.`))
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
        )
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

const VITE_NODE = path.resolve('./node_modules/.bin/vite-node')
const GENERATE_SCRIPT = path.resolve('./demo.ts')

function createGeneratedBundleApp(): express.Application {
  const app = express()

  app.get('/bundle.js', (_req, res) => {
    printLog('Generating bundle...')
    const result = spawnSync(VITE_NODE, [GENERATE_SCRIPT], { encoding: 'utf-8' })
    if (result.status !== 0) {
      const err = result.stderr || result.stdout
      printLog(`Bundle generation failed: ${err}`)
      res.status(500).send(`/* Bundle generation failed:\n${err}\n*/`)
      return
    }
    // demo.ts prints "=== N. ... ===" sections — extract just the bundle (section 3)
    const output = result.stdout
    const bundleStart = output.indexOf('(function()')
    const bundle = bundleStart >= 0 ? output.slice(bundleStart) : output
    printLog('Bundle generated successfully.')
    res.setHeader('Content-Type', 'application/javascript')
    res.send(bundle)
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
      )
    )
  )

  return app
}
