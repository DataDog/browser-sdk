const path = require('path')

const webpackBase = require('../../webpack.base')

const datacenter = process.env.TARGET_DATACENTER || 'us'

module.exports = (env, argv) => ({
  entry: {
    logs: path.resolve(__dirname, 'src/logs.entry.ts'),
  },
  ...webpackBase(argv.mode),
  output: {
    filename: `datadog-logs-${datacenter}.js`,
    path: path.resolve(__dirname, 'bundle'),
  },
})
