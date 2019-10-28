const webpack = require('webpack')
const execSync = require('child_process').execSync
const packageJson = require('./package.json')
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin')

const targetDC = process.env.TARGET_DC || 'us'

module.exports = (mode) => ({
  mode,
  devtool: mode === 'development' ? 'inline-source-map' : 'false',
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      buildEnv: {
        TARGET_DC: JSON.stringify(targetDC),
        TARGET_ENV: JSON.stringify(process.env.TARGET_ENV || 'staging'),
        VERSION: JSON.stringify(
          `${mode === 'development' ? 'dev' : packageJson.version}-${execSync('git rev-parse HEAD')
            .toString()
            .trim()}`
        ),
      },
    }),
  ],
  resolve: {
    extensions: ['.ts', '.js'],
    plugins: [new TsconfigPathsPlugin()],
  },
})
