const path = require('path')
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin

const webpackBase = require('../../webpack.base')

module.exports = (_env, argv) =>
  webpackBase({
    mode: argv.mode,
    entry: path.resolve(__dirname, 'src/entries/main.ts'),
    filename: 'datadog-rum.js',
    plugins: [new BundleAnalyzerPlugin({ generateStatsFile: true })],
  })
