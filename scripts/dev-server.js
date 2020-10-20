const express = require('express')
const middleware = require('webpack-dev-middleware')
const webpack = require('webpack')
const path = require('path')

const logsConfig = require('../packages/logs/webpack.config')
const rumConfig = require('../packages/rum/webpack.config')
const buildEnv = require('./build-env')

const app = express()

app.use(express.static(path.join(__dirname, '../sandbox')))
app.use(middleware(webpack(withBuildEnv(rumConfig(null, { mode: 'development' })))))
app.use(middleware(webpack(withBuildEnv(logsConfig(null, { mode: 'development' })))))

const port = 8080
app.listen(port, () => console.log(`server listening on port ${port}.`))

function withBuildEnv(webpackConf) {
  webpackConf.module = {
    ...webpackConf.module,
    rules: [
      ...webpackConf.module.rules,
      ...Object.keys(buildEnv).map((key) => ({
        test: /\.ts$/,
        loader: 'string-replace-loader',
        options: {
          search: `<<< ${key} >>>`,
          replace: buildEnv[key],
        },
      })),
    ],
  }
  return webpackConf
}
