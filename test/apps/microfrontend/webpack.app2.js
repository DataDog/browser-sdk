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
    filename: 'app2.js',
    chunkFilename: 'chunks/[name]-[contenthash]-app2.js',
    publicPath: 'auto',
  },
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
          service: 'mf-app2-service',
          version: '0.2.0',
        },
      },
    }),
  ],
}
