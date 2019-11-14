const path = require('path')

const webpackBase = require('../../webpack.base')

const targetDC = process.env.TARGET_DC || 'us'

module.exports = (env, argv) => ({
  entry: {
    rum: path.resolve(__dirname, 'src/rum.entry.ts'),
  },
  ...webpackBase(argv.mode),
  output: {
    filename: `datadog-rum-${targetDC}.js`,
    path: path.resolve(__dirname, 'bundle'),
  },
})
