const HtmlWebpackPlugin = require('html-webpack-plugin')
const { default: WebextensionPlugin } = require('@webextension-toolbox/webpack-webextension-plugin')
const CopyPlugin = require('copy-webpack-plugin')
const { HotModuleReplacementPlugin } = require('webpack')
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin')
const { createDefinePlugin } = require('../webpack.base')

module.exports = (_env, argv) => {
  const isDevelopment = argv.mode === 'development'

  return [
    baseConfig({
      name: 'background',
      entry: './src/background',
      output: {
        filename: 'background.js',
      },
      plugins: [
        ...(isDevelopment
          ? []
          : [
              new WebextensionPlugin({
                manifestDefaults: {
                  ...getVersion(),
                },
              }),
            ]),
        new CopyPlugin({
          patterns: [
            { from: './icons/' },
            ...(isDevelopment
              ? [{ from: './manifest-dev.json', to: 'manifest.json', force: true }]
              : [{ from: './manifest.json', to: 'manifest.json' }]),
          ],
        }),
      ],
    }),
    baseConfig({
      name: 'panel',
      entry: './src/panel/index.tsx',
      devServer: isDevelopment
        ? {
            hot: true,
            port: 3001,
            static: false,
            headers: {
              'Access-Control-Allow-Origin': '*',
            },
            allowedHosts: 'all',
            liveReload: false,
            client: {
              overlay: {
                errors: true,
                warnings: false,
              },
              // Disable webpack hot client injection to avoid CSP issues
              webSocketTransport: 'ws',
            },
            devMiddleware: {
              writeToDisk: (filePath) => filePath.endsWith('panel.html'),
            },
          }
        : undefined,
      output: {
        filename: 'panel.js',
        publicPath: isDevelopment ? 'http://localhost:3001/' : './',
      },
      plugins: [
        new HtmlWebpackPlugin({
          filename: 'panel.html',
          template: 'src/panel/panel.html.template',
          inject: false, // Disable auto script injection - we handle it manually
          templateParameters: {
            isDevelopment,
            devServerUrl: 'http://localhost:3001/',
          },
        }),
        createDefinePlugin(),
        ...(isDevelopment ? [new HotModuleReplacementPlugin(), new ReactRefreshWebpackPlugin()] : []),
      ],
    }),
    baseConfig({
      name: 'content-main',
      entry: './src/content-scripts/main.ts',
      output: {
        filename: 'content-script-main.js',
      },
    }),
    baseConfig({
      name: 'content-isolated',
      entry: './src/content-scripts/isolated.ts',
      output: {
        filename: 'content-script-isolated.js',
      },
    }),
    baseConfig({
      name: 'devtools',
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

  function baseConfig({ name, entry, output, plugins, devServer }) {
    return {
      name,
      entry,
      output,
      // Use source-map instead of eval-based devtools for CSP compatibility
      devtool: isDevelopment ? 'source-map' : false,
      devServer,

      module: {
        rules: [
          {
            test: /\.tsx?$/,
            loader: 'ts-loader',
            exclude: /node_modules/,
            options: {
              onlyCompileBundledFiles: true,
              ...(isDevelopment && {
                getCustomTransformers: () => ({
                  before: [require('react-refresh-typescript').default()],
                }),
                transpileOnly: true,
              }),
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
