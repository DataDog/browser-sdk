const HtmlWebpackPlugin = require('html-webpack-plugin')
const WebextensionPlugin = require('webpack-webextension-plugin')
const CopyPlugin = require('copy-webpack-plugin')
const { DefinePlugin } = require('webpack')

module.exports = (_env, argv) => {
  return [
    baseConfig({
      entry: './src/background',
      output: {
        filename: 'background.js',
      },
      plugins: [
        new WebextensionPlugin({
          manifestDefaults: {
            version: require('./package.json').version,
          },
        }),
        new CopyPlugin({
          patterns: [{ from: './icons/' }],
        }),
      ],
    }),
    baseConfig({
      entry: './src/panel',
      output: {
        filename: 'panel.js',
      },
      plugins: [
        new HtmlWebpackPlugin({
          filename: 'panel.html',
        }),
        new DefinePlugin({
          'process.env.BUMBAG_ENV': JSON.stringify('production'),
        }),
      ],
    }),
    baseConfig({
      entry: './src/devtools',
      output: {
        filename: 'devtools.js',
      },
      plugins: [
        new HtmlWebpackPlugin({
          filename: 'devtools.html',
        }),
      ],
    }),
  ]

  function baseConfig({ entry, output, plugins }) {
    return {
      entry,
      output,
      devtool: argv.mode === 'development' ? 'inline-source-map' : false,

      module: {
        rules: [
          {
            test: /\.tsx?$/,
            loader: 'ts-loader',
            exclude: /node_modules/,
            options: {
              onlyCompileBundledFiles: true,
            },
          },
        ],
      },

      resolve: {
        extensions: ['.ts', '.tsx', '.js'],
      },

      plugins,
    }
  }
}
