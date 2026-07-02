const { datadogWebpackPlugin } = require('@datadog/webpack-plugin')
const { ModuleFederationPlugin } = require('@module-federation/enhanced/webpack')
const webpackBase = require('./webpack.base')

module.exports = webpackBase({
  name: 'lib',
  plugins: [
    new ModuleFederationPlugin({
      name: 'lib',
      filename: 'libEntry.js',
      exposes: {
        './lib': './lib.ts',
      },
    }),
    datadogWebpackPlugin({
      rum: {
        enable: true,
        sourceCodeContext: {
          service: 'mf-lib-service',
          version: '3.0.0',
          debugId: true,
        },
      },
    }),
  ],
})
