// @ts-check
const path = require('node:path')
const webpack = require('webpack')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin')

const tsconfigPath = path.resolve(__dirname, 'tsconfig.json')

/** @type {import('webpack').Configuration} */
module.exports = {
  mode: 'development',
  devtool: 'inline-source-map',

  entry: {
    main: './src/main.ts',
    worker: './src/profilingWorker.ts',
  },

  target: ['web', 'es2020'],

  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [{ loader: 'ts-loader', options: { configFile: tsconfigPath, onlyCompileBundledFiles: true } }],
        exclude: /node_modules/,
      },
    ],
  },

  resolve: {
    extensions: ['.ts', '.js'],
    plugins: [new TsconfigPathsPlugin({ configFile: tsconfigPath })],
  },

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    globalObject: 'self',
  },

  plugins: [
    new webpack.DefinePlugin({
      __BUILD_ENV__SDK_VERSION__: JSON.stringify('dev'),
      __BUILD_ENV__SDK_SETUP__: JSON.stringify('npm'),
      __BUILD_ENV__WORKER_STRING__: JSON.stringify(''),
    }),

    new HtmlWebpackPlugin({
      template: './src/index.html',
      chunks: ['main'],
      filename: 'index.html',
    }),
  ],

  devServer: {
    port: 8081,
    headers: { 'Document-Policy': 'js-profiling' },
  },

  optimization: { splitChunks: false, runtimeChunk: false },
}
