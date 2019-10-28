const bodyParser = require('body-parser')
const cors = require('cors')
const express = require('express')
const middleware = require('webpack-dev-middleware')
const path = require('path')
const webpack = require('webpack')

const logsConfig = require('../../packages/logs/webpack.config')
const rumConfig = require('../../packages/rum/webpack.config')
const fakeBackend = require('./fake-backend')

let port = 3000
const app = express()
app.use(express.static(path.join(__dirname, '../static')))

if (process.env.ENV === 'development') {
  port = 8080
  app.use(middleware(webpack(rumConfig(null, { mode: 'development' }))))
  app.use(middleware(webpack(logsConfig(null, { mode: 'development' }))))
} else {
  // e2e tests
  app.use(express.static(path.join(__dirname, '../../packages/logs/bundle')))
  app.use(express.static(path.join(__dirname, '../../packages/rum/bundle')))
  app.use(bodyParser.text())
  app.use(cors())
  fakeBackend(app)
}

app.listen(port, () => console.log(`server listening on port ${port}.`))
