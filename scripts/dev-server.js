const path = require('path')
const express = require('express')
const middleware = require('webpack-dev-middleware')
const webpack = require('webpack')

const logsConfig = require('../packages/logs/webpack.config')
const rumSlimConfig = require('../packages/rum-slim/webpack.config')
const rumConfig = require('../packages/rum/webpack.config')

const app = express()

app.use(express.static(path.join(__dirname, '../sandbox')))
for (const config of [rumConfig, logsConfig, rumSlimConfig]) {
  app.use(middleware(webpack(config(null, { mode: 'development' }))))
}

const port = 8080
app.listen(port, () => console.log(`server listening on port ${port}.`))
