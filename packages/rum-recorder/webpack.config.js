const path = require('path')

const webpackBase = require('../../webpack.base')

module.exports = (env, argv) =>
  webpackBase({
    mode: argv.mode,
    entry: path.resolve(__dirname, 'src/boot/recorder.entry.ts'),
    filename: 'datadog-rum-recorder.js',
  })
