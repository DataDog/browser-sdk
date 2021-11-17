const path = require('path')

const webpackBase = require('../../webpack.base')

const entry = path.resolve(__dirname, 'src/boot/rum.entry.ts')

module.exports = (_env, argv) => [
  webpackBase({
    mode: argv.mode,
    entry,
    filename: 'datadog-rum.js',
  }),
  webpackBase({
    mode: argv.mode,
    entry,
    filename: 'datadog-rum-synthetics.js',
  }),
]
