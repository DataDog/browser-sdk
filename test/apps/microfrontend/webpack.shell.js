const path = require('node:path')
const { datadogWebpackPlugin } = require('@datadog/webpack-plugin')
const { ModuleFederationPlugin } = require('@module-federation/enhanced/webpack')

module.exports = {
  mode: 'development',
  entry: './bootstrap.ts',
  devtool: 'source-map',
  module: {
    rules: [{ test: /\.ts$/, use: 'ts-loader' }],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'shell.js',
    chunkFilename: 'chunks/[name]-[contenthash]-shell.js',
    publicPath: 'auto',
  },
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
}
