const { datadogWebpackPlugin } = require('@datadog/webpack-plugin')
const { ModuleFederationPlugin } = require('@module-federation/enhanced/webpack')
const webpackBase = require('./webpack.base')

module.exports = webpackBase({
  name: 'app1',
  plugins: [
    new ModuleFederationPlugin({
      name: 'app1',
      filename: 'app1Entry.js',
      exposes: {
        './app1': './app1.ts',
      },
    }),
    datadogWebpackPlugin({
      rum: {
        enable: true,
        sourceCodeContext: {
          service: 'mfe-app1-service',
          version: '1.0.0',
        },
      },
    }),
  ],
})
