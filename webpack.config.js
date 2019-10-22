const path = require('path')
const webpack = require('webpack')
const execSync = require('child_process').execSync
const packageJson = require('./package.json')
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin')

const targetDC = process.env.TARGET_DC || 'us'

module.exports = (env, argv) => ({
  entry: {
    logs: './packages/logs/src/logs.entry.ts',
    rum: './packages/rum/src/rum.entry.ts',
  },
  devtool: argv.mode === 'development' ? 'inline-source-map' : 'false',
  devServer: {
    contentBase: './dist',
  },
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
          `${argv.mode === 'development' ? 'dev' : packageJson.version}-${execSync('git rev-parse HEAD')
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
  output: {
    filename: (chunkData) => {
      switch (chunkData.chunk.name) {
        case 'logs':
          return `datadog-logs-${targetDC}.js`
        default:
          return `datadog-rum-${targetDC}.js`
      }
    },
    path: path.resolve(__dirname, 'dist'),
  },
})
