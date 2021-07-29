const path = require('path')

const webpackBase = require('../../webpack.base')

module.exports = (_env, argv) => [
  webpackBase({
    mode: argv.mode,
    entry: path.resolve(__dirname, 'src/boot/logs.entry.ts'),
    datacenter: 'us',
    filename: 'datadog-logs.js',
  }),
]
