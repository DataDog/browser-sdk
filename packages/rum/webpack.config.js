const path = require('path')

const webpackBase = require('../../webpack.base')

const datacenter = process.env.TARGET_DATACENTER || 'us'

module.exports = (env, argv) => ({
  entry: {
    rum: path.resolve(__dirname, 'src/rum.entry.ts'),
  },
  ...webpackBase(argv.mode),
  output: {
    filename: `datadog-rum-${datacenter}.js`,
    path: path.resolve(__dirname, 'bundle'),
  },
})
