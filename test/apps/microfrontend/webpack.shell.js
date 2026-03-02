const { datadogWebpackPlugin } = require('@datadog/webpack-plugin')
const { ModuleFederationPlugin } = require('@module-federation/enhanced/webpack')
const webpackBase = require('./webpack.base')

module.exports = webpackBase({
  name: 'shell',
  entry: './bootstrap.ts',
  plugins: [
    new ModuleFederationPlugin({
      name: 'shell',
      remotes: {
        app1: 'app1@/microfrontend/app1Entry.js',
        app2: 'app2@/microfrontend/app2Entry.js',
      },
    }),
    datadogWebpackPlugin({
      rum: {
        enable: true,
        sourceCodeContext: {
          service: 'mf-shell-service',
          version: '2.0.0',
        },
      },
    }),
  ],
})
