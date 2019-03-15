const path = require('path')
const webpack = require('webpack')
const packageJson = require('./package.json')

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
        case 'core':
          return 'browser-agent-core.js'
        default:
          return 'browser-agent.js'
      }
    },
    path: path.resolve(__dirname, 'dist'),
  },
})
