const express = require('express')
const middleware = require('webpack-dev-middleware')
const webpack = require('webpack')
const path = require('path')

const logsConfig = require('../packages/logs/webpack.config')
const rumConfig = require('../packages/rum/webpack.config')
const rumRecorderConfig = require('../packages/rum-recorder/webpack.config')
const buildEnv = require('./build-env')

const app = express()

app.use(express.static(path.join(__dirname, '../sandbox')))
for (const config of [rumConfig, logsConfig, rumRecorderConfig]) {
  app.use(middleware(webpack(withBuildEnv(config(null, { mode: 'development' })))))
}

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
