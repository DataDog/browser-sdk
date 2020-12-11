const path = require('path')

const webpackBase = require('../../webpack.base')

module.exports = (env, argv) => ({
  entry: {
    rum: path.resolve(__dirname, 'src/boot/recorder.entry.ts'),
  },
  ...webpackBase(argv.mode),
  output: {
    filename: `datadog-rum-recorder.js`,
    path: path.resolve(__dirname, 'bundle'),
  },
})
