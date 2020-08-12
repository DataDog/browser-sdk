const path = require('path')

const webpackBase = require('../../webpack.base')

const datacenter = process.env.TARGET_DATACENTER || 'us'
const withSuffix = process.env.WITH_SUFFIX || false

const suffix = withSuffix ? `-${datacenter}` : ''

module.exports = (env, argv) => ({
  entry: {
    rum: path.resolve(__dirname, 'src/rum.entry.ts'),
  },
  ...webpackBase(argv.mode),
  output: {
    filename: `datadog-rum${suffix}.js`,
    path: path.resolve(__dirname, 'bundle'),
  },
})
