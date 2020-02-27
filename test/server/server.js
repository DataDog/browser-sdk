const bodyParser = require('body-parser')
const cors = require('cors')
const express = require('express')
const middleware = require('webpack-dev-middleware')
const path = require('path')
const fs = require('fs')
const webpack = require('webpack')
const morgan = require('morgan')

const logsConfig = require('../../packages/logs/webpack.config')
const rumConfig = require('../../packages/rum/webpack.config')
const fakeBackend = require('./fake-backend')
const buildEnv = require('../../scripts/build-env')

let port = process.env.PORT || 3000

morgan.token('body', (req, res) => extractBody(req, res))
const stream = fs.createWriteStream(path.join(__dirname, 'test-server.log'))

const app = express()
app.use(cors())
app.use(morgan(':method :url :status :body', { stream }))
app.use(express.static(path.join(__dirname, '../static')))
app.use(express.static(path.join(__dirname, '../app/dist')))

if (process.env.ENV === 'development') {
  port = 8080
  app.use(middleware(webpack(withBuildEnv(rumConfig(null, { mode: 'development' })))))
  app.use(middleware(webpack(withBuildEnv(logsConfig(null, { mode: 'development' })))))
} else {
  // e2e tests
  app.use(express.static(path.join(__dirname, '../../packages/logs/bundle')))
  app.use(express.static(path.join(__dirname, '../../packages/rum/bundle')))
}
app.use(bodyParser.text())
fakeBackend(app)

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

function extractBody(req, res) {
  if (isValidBody(req.body)) {
    return `\n${req.body}`
  }
  if (isValidBody(res.body)) {
    return `\n${res.body}`
  }
}

function isValidBody(body) {
  return body && JSON.stringify(body) !== '{}'
}
