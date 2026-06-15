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

  // Two separate entry points: the main page and the worker script.
  // Webpack produces two independent bundles so each one resolves its own globals.
  entry: {
    main: './src/main.ts',
    worker: './src/profilingWorker.ts',
  },

  target: ['web', 'es2020'],

  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: tsconfigPath,
              onlyCompileBundledFiles: true,
            },
          },
        ],
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
    globalObject: 'self', // Required for workers bundled with webpack
  },

  plugins: [
    // Replace the build-time env constants that the SDK source references.
    new webpack.DefinePlugin({
      __BUILD_ENV__SDK_VERSION__: JSON.stringify('dev'),
      __BUILD_ENV__SDK_SETUP__: JSON.stringify('npm'),
      // WORKER_STRING is the deflate worker bundle inlined as a string.
      // Empty string: deflate worker simply won't load (no session replay needed).
      __BUILD_ENV__WORKER_STRING__: JSON.stringify(''),
    }),

    new HtmlWebpackPlugin({
      template: './src/index.html',
      // Only inject the main bundle; worker.js is loaded explicitly
      chunks: ['main'],
      filename: 'index.html',
    }),
  ],

  devServer: {
    port: 8081,
    static: { directory: path.resolve(__dirname, 'dist') },
    headers: {
      // Required for JS Self-Profiling API on the document
      'Document-Policy': 'js-profiling',
    },
    setupMiddlewares(middlewares, devServer) {
      if (!devServer) throw new Error('webpack-dev-server is not defined')
      // Serve worker.js with the Document-Policy header required for profiling inside the worker
      devServer.app.get('/worker.js', (_req, res, next) => {
        res.setHeader('Document-Policy', 'js-profiling')
        next()
      })
      return middlewares
    },
  },

  optimization: {
    splitChunks: false,
    runtimeChunk: false,
  },
}
