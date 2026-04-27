const { datadogWebpackPlugin } = require('@datadog/webpack-plugin')
const { ModuleFederationPlugin } = require('@module-federation/enhanced/webpack')
const webpackBase = require('./webpack.base')

module.exports = webpackBase({
  name: 'app2',
  plugins: [
    new ModuleFederationPlugin({
      name: 'app2',
      filename: 'app2Entry.js',
      exposes: {
        './app2': './app2.ts',
      },
    }),
    datadogWebpackPlugin({
      rum: {
        enable: true,
        sourceCodeContext: {
          service: 'mfe-app2-service',
          version: '0.2.0',
        },
      },
    }),
  ],
})
