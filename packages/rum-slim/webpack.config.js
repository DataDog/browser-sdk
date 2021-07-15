const path = require('path')

const webpackBase = require('../../webpack.base')

const entry = path.resolve(__dirname, 'src/boot/rumSlim.entry.ts')

module.exports = (_env, argv) => [
  webpackBase({ mode: argv.mode, entry, datacenter: 'us', filename: 'datadog-rum-slim.js' }),
]
