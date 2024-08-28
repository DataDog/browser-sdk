const path = require('path')
const express = require('express')
const middleware = require('webpack-dev-middleware')
const webpack = require('webpack')
const cors = require('cors')

const logsConfig = require('../packages/logs/webpack.config')
const rumSlimConfig = require('../packages/rum-slim/webpack.config')
const rumConfig = require('../packages/rum/webpack.config')
const workerConfig = require('../packages/worker/webpack.config')
const { printLog } = require('./lib/execution-utils')

const sandboxPath = path.join(__dirname, '../sandbox')
const port = 8080

const ROOT = path.join(__dirname, '../')

const app = express()
app.use(createStaticSandboxApp())
app.listen(port, () => printLog(`Server listening on port ${port}.`))

function createStaticSandboxApp() {
  const app = express()
  app.use(cors())
  app.use(express.static(sandboxPath))
  for (const config of [rumConfig, logsConfig, rumSlimConfig, workerConfig]) {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    app.use(middleware(webpack(config(null, { mode: 'development' }))))
  }

  // CDN cjs main and chunks (with webpack)
  app.get('/datadog-rum.js', (_req, res) => {
    res.sendFile(path.join(ROOT, 'packages/rum/bundle/datadog-rum.js'))
  })
  app.get('/long-task.datadog-rum.js', (_req, res) => {
    res.sendFile(path.join(ROOT, 'packages/rum/bundle/long-task.datadog-rum.js'))
  })

  // CDN esm main and chunks (with esbuild because I could not make it work with webpack :))
  app.get('/datadog-rum-esm.js', (_req, res) => {
    res.sendFile(path.join(ROOT, 'packages/rum/bundle-esm/datadog-rum.js'))
  })
  app.get('/chunk-HOS4BT2D.js', (_req, res) => {
    res.sendFile(path.join(ROOT, 'packages/rum/bundle-esm/chunk-HOS4BT2D.js'))
  })
  app.get('/longTaskCollection-TUXOHJME.js', (_req, res) => {
    res.sendFile(path.join(ROOT, 'packages/rum/bundle-esm/longTaskCollection-TUXOHJME.js'))
  })

  // App with the SDK using NPM that serves the main bundle (app.js) or any chunks (*.app.js)
  app.get(/.*app.js$/, (req, res) => {
    res.sendFile(path.join(ROOT, `test/app/dist/${req.url.split('/').at(-1)}`))
  })

  return app
}
