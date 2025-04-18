const path = require('path')
const express = require('express')
const middleware = require('webpack-dev-middleware')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const webpack = require('webpack')
const cors = require('cors')

const logsConfig = require('../packages/logs/webpack.config')
const rumSlimConfig = require('../packages/rum-slim/webpack.config')
const rumConfig = require('../packages/rum/webpack.config')
const workerConfig = require('../packages/worker/webpack.config')
const webpackBase = require('../webpack.base')
const { printLog, runMain } = require('./lib/executionUtils')

const sandboxPath = path.join(__dirname, '../sandbox')

// Development server configuration
const DEFAULT_DEVELOPMENT_PORT = 8080

runMain(() => {
  const app = express()
  app.use(createStaticSandboxApp())
  app.use('/react-app', createReactApp())
  app.listen(DEFAULT_DEVELOPMENT_PORT, () => printLog(`Server listening on port ${DEFAULT_DEVELOPMENT_PORT}.`))
})

function createStaticSandboxApp() {
  const app = express()
  app.use(cors())
  app.use(express.static(sandboxPath))
  for (const config of [rumConfig, logsConfig, rumSlimConfig, workerConfig]) {
    app.use(
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      middleware(
        // Set publicPath for development mode. Fixes issue when using the developer extension with NPM package override.
        webpack(config(null, { mode: 'development', publicPath: `http://localhost:${DEFAULT_DEVELOPMENT_PORT}/` }))
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

function createReactApp() {
  const app = express()

  // Redirect requests to the "index.html" file, so that the React app can handle routing
  app.use((req, _, next) => {
    if (req.url !== '/main.js') {
      req.url = '/index.html'
    }
    next()
  })

  app.use(
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    middleware(
      webpack(
        webpackBase({
          entry: `${sandboxPath}/react-app/main.tsx`,
          plugins: [new HtmlWebpackPlugin({ publicPath: '/react-app/' })],
          mode: 'development',
          publicPath: `http://localhost:${DEFAULT_DEVELOPMENT_PORT}/`,
        })
      )
    )
  )

  return app
}
