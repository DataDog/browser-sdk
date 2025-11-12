import express from 'express'
import middleware from 'webpack-dev-middleware'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import webpack from 'webpack'
import cors from 'cors'
import webpackBase from '../webpack.base.ts'
import { printLog, runMain } from './lib/executionUtils.ts'

const sandboxPath = './sandbox'
const port = 8080

const PACKAGES_WITH_BUNDLE = ['rum', 'rum-slim', 'logs', 'flagging', 'worker']

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
        )!
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
      )!
    )
  )

  return app
}
