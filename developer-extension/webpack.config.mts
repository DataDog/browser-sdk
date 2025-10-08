import HtmlWebpackPlugin from 'html-webpack-plugin'
import { WebextensionPlugin } from '@webextension-toolbox/webpack-webextension-plugin'
import CopyPlugin from 'copy-webpack-plugin'
import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin'
import reactRefreshTypeScript from 'react-refresh-typescript'
import webpack from 'webpack'
import { createDefinePlugin } from '../webpack.base.ts'
import packageJson from './package.json' with { type: 'json' }

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
          templateContent: () => `
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
        ...(isDevelopment ? [new webpack.HotModuleReplacementPlugin(), new ReactRefreshWebpackPlugin()] : []),
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
  }): webpack.Configuration & { devServer?: any } {
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
              configFile: 'tsconfig.webpack.json',
              onlyCompileBundledFiles: true,
              ...(isDevelopment && {
                getCustomTransformers: () => ({
                  before: [reactRefreshTypeScript()],
                }),
              }),
              transpileOnly: true,
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
  const version: string = packageJson.version

  return {
    version: version.replace(/-(alpha|beta)/, ''),
    version_name: version,
  }
}
