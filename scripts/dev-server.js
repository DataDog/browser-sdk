const path = require('path')
const express = require('express')
const middleware = require('webpack-dev-middleware')
const webpack = require('webpack')

const logsConfig = require('../packages/logs/webpack.config')
const rumSlimConfig = require('../packages/rum-slim/webpack.config')
const rumConfig = require('../packages/rum/webpack.config')
const { printLog } = require('./lib/execution-utils')

const port = 8080
const app = express()

app.use(express.static(path.join(__dirname, '../sandbox')))
for (const config of [rumConfig, logsConfig, rumSlimConfig]) {
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.use(middleware(webpack(config(null, { mode: 'development' }))))
}
app.use(redirectSuffixedFiles)

app.listen(port, () => printLog(`Server listening on port ${port}.`))

function redirectSuffixedFiles(req, res, next) {
  const matches = /(.*)-(canary|staging|v4)\.js/.exec(req.url)
  if (matches) {
    res.redirect(`${matches[1]}.js`)
  } else {
    next()
  }
}
