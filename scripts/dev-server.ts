import express from 'express'
import middleware from 'webpack-dev-middleware'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import webpack from 'webpack'
import cors from 'cors'
import webpackBase from '../webpack.base.ts'
import logsConfig from '../packages/logs/webpack.config.ts'
import rumSlimConfig from '../packages/rum-slim/webpack.config.ts'
import rumConfig from '../packages/rum/webpack.config.ts'
import flaggingConfig from '../packages/flagging/webpack.config.ts'
import workerConfig from '../packages/worker/webpack.config.ts'
import { printLog, runMain } from './lib/executionUtils.ts'

const sandboxPath = './sandbox'
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
  for (const config of [rumConfig, rumSlimConfig, logsConfig, flaggingConfig, workerConfig]) {
    app.use(middleware(webpack(config(null, { mode: 'development' }))!))
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
      )!
    )
  )

  return app
}
