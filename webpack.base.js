const path = require('path')
const { BannerPlugin } = require('webpack')
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin')
const buildEnv = require('./scripts/build-env')

const tsconfigPath = path.join(__dirname, 'tsconfig.base.json')
const SUFFIX_REGEXP = /-(us|eu)/

module.exports = ({ entry, mode, filename, datacenter }) => ({
  entry,
  mode,
  output: {
    filename,
    path: path.resolve('./bundle'),
  },
  devtool: mode === 'development' ? 'inline-source-map' : 'false',
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
          },
        },
      },
    ],
  },

  resolve: {
    extensions: ['.ts', '.js'],
    plugins: [new TsconfigPathsPlugin({ configFile: tsconfigPath })],
  },

  plugins: [
    new BannerPlugin({
      banner({ filename: fileName }) {
        const env = fileName.match(SUFFIX_REGEXP)[1]
        const newFileName = fileName.replace(SUFFIX_REGEXP, '')
        return `\n${fileName} IS DEPRECATED, USE ${newFileName} WITH { site: 'datadoghq.${
          env === 'eu' ? 'eu' : 'com'
        }' } INIT CONFIGURATION INSTEAD\n`
      },
      include: SUFFIX_REGEXP,
    }),
  ],
})
