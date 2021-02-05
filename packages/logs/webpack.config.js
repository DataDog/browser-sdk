const path = require('path')

const webpackBase = require('../../webpack.base')

const entry = path.resolve(__dirname, 'src/boot/logs.entry.ts')

module.exports = (_env, argv) => [
  webpackBase({ mode: argv.mode, entry, datacenter: 'us', filename: 'datadog-logs.js' }),
  webpackBase({ mode: argv.mode, entry, datacenter: 'us', filename: 'datadog-logs-us.js' }),
  webpackBase({ mode: argv.mode, entry, datacenter: 'eu', filename: 'datadog-logs-eu.js' }),
]
