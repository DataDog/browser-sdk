const path = require('path')

const webpackBase = require('../../webpack.base')

const targetDC = process.env.TARGET_DC || 'us'

module.exports = (env, argv) => ({
  entry: {
    logs: path.resolve(__dirname, 'src/logs.entry.ts'),
  },
  ...webpackBase(argv.mode),
  output: {
    filename: `datadog-logs-${targetDC}.js`,
    path: path.resolve(__dirname, 'bundle'),
  },
})
