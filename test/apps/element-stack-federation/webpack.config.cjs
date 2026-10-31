const path = require('node:path')
const webpack = require('webpack')
const { ModuleFederationPlugin } = require('@module-federation/enhanced/webpack')
const { datadogWebpackPlugin } = require('@datadog/webpack-plugin')
const { VueLoaderPlugin } = require('vue-loader')

const directory = __dirname
function configuration(name, service, version, federation, entry) {
  return {
    name,
    context: directory,
    mode: 'development',
    devtool: 'source-map',
    entry: entry ? { main: entry } : {},
    output: {
      path: path.join(directory, 'dist', name),
      filename: '[name].js',
      chunkFilename: '[name].[contenthash].js',
      publicPath: 'auto',
      uniqueName: name,
      clean: true,
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.mjs', '.vue'],
      // Each remote resolves its own framework runtime.
      modules: [path.join(directory, 'node_modules'), 'node_modules'],
    },
    module: {
      rules: [
        { test: /\.vue$/, loader: 'vue-loader' },
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
              configFile: path.join(directory, 'tsconfig.json'),
              appendTsSuffixTo: [/\.vue$/],
            },
          },
        },
      ],
    },
    plugins: [
      new VueLoaderPlugin(),
      new webpack.DefinePlugin({
        __VUE_OPTIONS_API__: true,
        __VUE_PROD_DEVTOOLS__: false,
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
      }),
      new ModuleFederationPlugin({ name, dts: false, ...federation }),
      // Instrument each remote with its own service and version.
      datadogWebpackPlugin({ rum: { enable: true, sourceCodeContext: { service, version } } }),
    ],
    stats: 'errors-warnings',
  }
}

module.exports = [
  configuration('reactMfe', 'checkout-react', '1.1.0', {
    filename: 'remoteEntry.js',
    exposes: { './mount': './react/mount.tsx' },
  }),
  configuration('vueMfe', 'catalog-vue', '2.2.0', {
    filename: 'remoteEntry.js',
    exposes: { './mount': './vue/mount.ts' },
  }),
  configuration('angularMfe', 'account-angular', '3.3.0', {
    filename: 'remoteEntry.js',
    exposes: { './mount': './angular/mount.ts' },
  }),
  configuration(
    'shell',
    'mfe-shell',
    '0.1.0',
    {
      remotes: {
        reactMfe: 'reactMfe@http://127.0.0.1:3111/remoteEntry.js',
        vueMfe: 'vueMfe@http://127.0.0.1:3112/remoteEntry.js',
        angularMfe: 'angularMfe@http://127.0.0.1:3113/remoteEntry.js',
      },
    },
    './shell/index.ts'
  ),
]
