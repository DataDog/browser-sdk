import * as path from 'path'
import express from 'express'
import middleware from 'webpack-dev-middleware'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import webpack from 'webpack'
import cors from 'cors'
import { printLog, runMain } from './lib/executionUtils'

const logsConfig = require('../packages/logs/webpack.config') as (env: any, args: any) => webpack.Configuration
const rumSlimConfig = require('../packages/rum-slim/webpack.config') as (env: any, args: any) => webpack.Configuration
const rumConfig = require('../packages/rum/webpack.config') as (env: any, args: any) => webpack.Configuration
const flaggingConfig = require('../packages/flagging/webpack.config') as (env: any, args: any) => webpack.Configuration
const workerConfig = require('../packages/worker/webpack.config') as (env: any, args: any) => webpack.Configuration
const webpackBase = require('../webpack.base') as (config: webpack.Configuration) => webpack.Configuration

const sandboxPath = path.join(__dirname, '../sandbox')
const port = 8080

runMain(() => {
  const app = express()
  app.use(createStaticSandboxApp())
  app.use('/react-app', createReactApp())
  app.listen(port, () => printLog(`Server listening on port ${port}.`))
})

function createStaticSandboxApp(): express.Application {
  const app = express()
  app.use(cors())
  app.use(express.static(sandboxPath))
  for (const config of [rumConfig, logsConfig, rumSlimConfig, workerConfig, flaggingConfig]) {
    app.use(middleware(webpack(config(null, { mode: 'development' }))))
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
      )
    )
  )

  return app
}
