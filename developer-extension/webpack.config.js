const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const { default: WebextensionPlugin } = require('@webextension-toolbox/webpack-webextension-plugin')
const CopyPlugin = require('copy-webpack-plugin')
const { createDefinePlugin } = require('../webpack.base')

const tsconfigPath = path.join(__dirname, '../tsconfig.webpack.json')

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
            ...getVersion(),
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
        createDefinePlugin(),
      ],
    }),
    baseConfig({
      entry: './src/content-scripts/main.ts',
      output: {
        filename: 'content-script-main.js',
      },
    }),
    baseConfig({
      entry: './src/content-scripts/isolated.ts',
      output: {
        filename: 'content-script-isolated.js',
      },
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
              configFile: tsconfigPath,
              onlyCompileBundledFiles: true,
            },
          },
          {
            test: /\.css$/,
            use: [
              'style-loader',
              {
                loader: 'css-loader',
                options: {
                  importLoaders: 1,
                  modules: {
                    auto: true,
                    localIdentName: '[name]_[local]_[hash:base64:5]',
                  },
                },
              },
            ],
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

function getVersion() {
  const version = require('./package.json').version

  return {
    version: version.replace(/-(alpha|beta)/, ''),
    version_name: version,
  }
}
