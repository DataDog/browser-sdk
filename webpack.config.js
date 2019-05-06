const path = require('path')
const webpack = require('webpack')
const packageJson = require('./package.json')

const targetDC = process.env.TARGET_DC || 'us'

module.exports = (env, argv) => ({
  entry: {
    logs: './src/logs/logs.entry.ts',
    rum: './src/rum/rum.entry.ts',
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
        VERSION: JSON.stringify(argv.mode === 'development' ? 'dev' : packageJson.version),
      },
    }),
  ],
  resolve: {
    extensions: ['.ts', '.js'],
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
