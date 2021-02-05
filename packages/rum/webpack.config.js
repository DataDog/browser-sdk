const path = require('path')

const webpackBase = require('../../webpack.base')

const entry = path.resolve(__dirname, 'src/boot/rum.entry.ts')

module.exports = (_env, argv) => [
  webpackBase({ mode: argv.mode, entry, datacenter: 'us', filename: 'datadog-rum.js' }),
  webpackBase({ mode: argv.mode, entry, datacenter: 'us', filename: 'datadog-rum-us.js' }),
  webpackBase({ mode: argv.mode, entry, datacenter: 'eu', filename: 'datadog-rum-eu.js' }),
]
