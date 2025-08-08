import HtmlWebpackPlugin from 'html-webpack-plugin'
import WebextensionPlugin from '@webextension-toolbox/webpack-webextension-plugin'
import CopyPlugin from 'copy-webpack-plugin'
import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin'
import type webpack from 'webpack'

// Keep CommonJS import for compatibility with current export style in webpack.base
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createDefinePlugin } = require('../webpack.base') as { createDefinePlugin: (opts?: { keepBuildEnvVariables?: string[] }) => webpack.WebpackPluginInstance }

export default (_env: unknown, argv: { mode?: webpack.Configuration['mode'] }) => {
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
            {
              from: './manifest.json',
              to: 'manifest.json',
              transform(content: Buffer) {
                const manifest = JSON.parse(content.toString())
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const packageJson = require('./package.json')

                manifest.version = packageJson.version
                manifest.version_name = packageJson.version

                if (isDevelopment) {
                  manifest.content_security_policy = {
                    extension_pages: "script-src 'self' http://localhost:3001; object-src 'self'",
                  }
                  manifest.name = `${manifest.name} (DEV)`
                }

                return JSON.stringify(manifest, null, 2)
              },
            },
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
            allowedHosts: 'auto',
            liveReload: false,
            client: {
              overlay: {
                errors: true,
                warnings: false,
              },
              webSocketTransport: 'ws',
            },
            devMiddleware: {
              writeToDisk: (filePath: string) => filePath.endsWith('panel.html'),
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
          inject: false,
          templateContent: ({ isDevelopment }: { isDevelopment: boolean }) => `
            <!doctype html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>Datadog Browser SDK Panel</title>
              <meta name="viewport" content="width=device-width,initial-scale=1">
            </head>
            <body>
              <div id="root"></div>
              ${
                isDevelopment
                  ? "<script src='http://localhost:3001/panel.js'></script>"
                  : "<script src='panel.js'></script>"
              }
            </body>
            </html>
          `,
          templateParameters: { isDevelopment },
        }),
        createDefinePlugin(),
        ...(isDevelopment ? [new (require('webpack').HotModuleReplacementPlugin)(), new ReactRefreshWebpackPlugin()] : []),
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

  function baseConfig({
    name,
    entry,
    output,
    plugins,
    devServer,
  }: {
    name: string
    entry: string
    output?: webpack.Configuration['output']
    plugins?: webpack.Configuration['plugins']
    devServer?: any
  }): webpack.Configuration {
    return {
      name,
      entry,
      output,
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
                  // eslint-disable-next-line @typescript-eslint/no-var-requires
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
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const version = require('./package.json').version as string

  return {
    version: version.replace(/-(alpha|beta)/, ''),
    version_name: version,
  }
}

