const path = require('path')
const webpack = require('webpack')
const packageJson = require('./package.json')

const targetDC = process.env.TARGET_DC || 'us'

module.exports = (env, argv) => ({
  entry: {
    core: './src/entries/core.ts',
    rum: './src/entries/rum.ts',
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
      const dc = process.env
      switch (chunkData.chunk.name) {
        case 'core':
          return `browser-agent-core-${targetDC}.js`
        default:
          return `browser-agent-${targetDC}.js`
      }
    },
    path: path.resolve(__dirname, 'dist'),
  },
})
