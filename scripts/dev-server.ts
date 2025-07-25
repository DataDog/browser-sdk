import express from 'express'
import middleware from 'webpack-dev-middleware'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import webpack from 'webpack'
import cors from 'cors'
import { printLog, runMain } from './lib/executionUtils.ts'

const sandboxPath = './sandbox'
const port = 8080

runMain(async () => {
  const app = express()
  app.use(await createStaticSandboxApp())
  app.use('/react-app', await createReactApp())
  app.listen(port, () => printLog(`Server listening on port ${port}.`))
})

async function createStaticSandboxApp(): Promise<express.Application> {
  // TODO: use normal imports when converting those files to typescript
  const logsConfig = (await import('../packages/logs/webpack.config.js' as string)).default
  const rumSlimConfig = (await import('../packages/rum-slim/webpack.config.js' as string)).default
  const rumConfig = (await import('../packages/rum/webpack.config.js' as string)).default
  const flaggingConfig = (await import('../packages/flagging/webpack.config.js' as string)).default
  const workerConfig = (await import('../packages/worker/webpack.config.js' as string)).default

  const app = express()
  app.use(cors())
  app.use(express.static(sandboxPath))
  for (const config of [rumConfig, logsConfig, rumSlimConfig, workerConfig, flaggingConfig]) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
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

async function createReactApp(): Promise<express.Application> {
  // TODO: use normal imports when converting those files to typescript
  const webpackBase = (await import('../webpack.base.js' as string)).default

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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
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
