const path = require('path')
const { BannerPlugin } = require('webpack')
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin')
const TerserPlugin = require('terser-webpack-plugin')
const buildEnv = require('./scripts/build-env')

const tsconfigPath = path.join(__dirname, 'tsconfig.webpack.json')
const SUFFIX_REGEXP = /-(us|eu)/

module.exports = ({ entry, mode, filename, datacenter, types }) => ({
  entry,
  mode,
  output: {
    filename,
    path: path.resolve('./bundle'),
  },
  target: ['web', 'es5'],
  devtool: mode === 'development' ? 'inline-source-map' : false,
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'string-replace-loader',
        options: {
          multiple: [
            { search: '<<< TARGET_DATACENTER >>>', replace: datacenter || 'us' },
            { search: '<<< SDK_VERSION >>>', replace: buildEnv.SDK_VERSION },
            { search: '<<< BUILD_MODE >>>', replace: buildEnv.BUILD_MODE },
            { search: '<<< SYSTEM CLOCK >>>', replace: buildEnv.SYSTEM_CLOCK || 'false' },
          ],
        },
      },

      {
        test: /\.(ts|js)$/,
        loader: 'ts-loader',
        exclude: /node_modules/,
        options: {
          configFile: tsconfigPath,
          onlyCompileBundledFiles: true,
          compilerOptions: {
            module: 'es6',
            allowJs: true,
            types: types || [],
          },
        },
      },
    ],
  },

  resolve: {
    extensions: ['.ts', '.js'],
    plugins: [new TsconfigPathsPlugin({ configFile: tsconfigPath })],
    alias: {
      // The default "pako.esm.js" build is not transpiled to es5
      pako: 'pako/dist/pako.es5.js',
      // By default, a non-bundled version of sinon is pulled in, which require the nodejs 'util'
      // module. Since v5, webpack doesn't provide nodejs polyfills. Use a bundled version of sinon
      // which have its own 'util' module polyfill.
      sinon: 'sinon/pkg/sinon.js',
    },
  },

  optimization: {
    minimizer: [
      new TerserPlugin({
        extractComments: false,
      }),
    ],
  },

  plugins: [
    new BannerPlugin({
      banner({ filename }) {
        const env = SUFFIX_REGEXP.exec(filename)[1]
        const newFileName = filename.replace(SUFFIX_REGEXP, '')
        return `\n${filename} IS DEPRECATED, USE ${newFileName} WITH { site: 'datadoghq.${
          env === 'eu' ? 'eu' : 'com'
        }' } INIT CONFIGURATION INSTEAD\n`
      },
      include: SUFFIX_REGEXP,
    }),
  ],
})
