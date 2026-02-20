const path = require('node:path')
const { datadogWebpackPlugin } = require('@datadog/webpack-plugin')
const { ModuleFederationPlugin } = require('@module-federation/enhanced/webpack')

module.exports = {
  mode: 'development',
  devtool: 'source-map',
  module: {
    rules: [{ test: /\.ts$/, use: 'ts-loader' }],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'app1.js',
    chunkFilename: 'chunks/[name]-[contenthash]-app1.js',
    publicPath: 'auto',
  },
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
          service: 'mf-app1-service',
          version: '1.0.0',
        },
      },
    }),
  ],
}
