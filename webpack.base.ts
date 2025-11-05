import path from 'path'
import webpack from 'webpack'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import TerserPlugin from 'terser-webpack-plugin'
import { buildEnvKeys, getBuildEnvValue } from './scripts/lib/buildEnv.ts'

const tsconfigPath = path.join(import.meta.dirname, 'tsconfig.webpack.json')

const packagesRoot = path.resolve(import.meta.dirname, 'packages')

// Those modules are known to have side effects when evaluated
const pathsWithSideEffect = new Set([
  `${packagesRoot}/logs/src/entries/main.ts`,
  `${packagesRoot}/flagging/src/entries/main.ts`,
  `${packagesRoot}/rum/src/entries/main.ts`,
  `${packagesRoot}/rum-slim/src/entries/main.ts`,
  `${packagesRoot}/rum-next/src/entries/bundle.ts`,
  `${packagesRoot}/core-next/src/entries/bundle.ts`,
  `${packagesRoot}/core-next/src/entries/main.ts`,
])

export default ({
  entry,
  mode,
  filename,
  plugins,
  types,
  keepBuildEnvVariables,
}: Pick<webpack.Configuration, 'entry' | 'mode' | 'plugins'> & {
  filename?: string
  types?: string[]
  keepBuildEnvVariables?: string[]
}): webpack.Configuration => ({
  entry,
  mode,
  output: {
    filename,
    chunkFilename:
      mode === 'development'
        ? // Use a fixed name for each chunk during development so that the developer extension
          // can redirect requests for them reliably.
          `chunks/[name]-${filename}`
        : // Include a content hash in chunk names in production.
          'chunks/[name]-[contenthash].js',
    chunkLoading: 'import',
    chunkFormat: 'module',
    path: path.resolve('./bundle'),
  },
  target: ['web', 'es2018'],
  devtool: false,
  module: {
    rules: [
      {
        test: (request) => !pathsWithSideEffect.has(request),
        sideEffects: false,
      },
      {
        test: /\.(ts|tsx|js)$/,
        loader: 'ts-loader',
        exclude: /node_modules/,
        options: {
          configFile: tsconfigPath,
          onlyCompileBundledFiles: true,
          compilerOptions: {
            module: 'es2020',
            allowJs: true,
            types: types || [],
          },
        },
      },
    ],
  },

  resolve: {
    extensions: ['.ts', '.js', '.tsx'],
    plugins: [new TsconfigPathsPlugin({ configFile: tsconfigPath })],
    alias: {
      // The default "pako.esm.js" build is not transpiled to es5
      pako: 'pako/dist/pako.es5.js',
    },
  },
  optimization: {
    chunkIds: 'named',

    splitChunks: {
      chunks: 'async',
      cacheGroups: {
        defaultVendors: false,
        default: false,
        common: {
          test: /core/,
          name: 'common',
          chunks: 'async',
          minChunks: 3, // Every modules used at least 3 times are put in a common chunk
        },
      },
    },

    minimizer: [
      new TerserPlugin({
        extractComments: false,
        terserOptions: {
          ecma: 2018,
          module: true,
          compress: {
            passes: 4,
            unsafe: true,
            unsafe_methods: true,
          },
        },
      }),
    ],
  },

  plugins: [
    new webpack.SourceMapDevToolPlugin(
      mode === 'development'
        ? // Use an inline source map during development (default options)
          {}
        : // When bundling for release, produce a source map file so it can be used for source code integration,
          // but don't append the source map comment to bundles as we don't upload the source map to
          // the CDN (yet).
          {
            filename: '[file].map',
            // append: false,
          }
    ),
    createDefinePlugin({ keepBuildEnvVariables }),
    ...(plugins || []),
  ],
})

export function createDefinePlugin({ keepBuildEnvVariables }: { keepBuildEnvVariables?: string[] } = {}) {
  return new webpack.DefinePlugin(
    Object.fromEntries(
      buildEnvKeys
        .filter((key) => !keepBuildEnvVariables?.includes(key))
        .map((key) => [
          `__BUILD_ENV__${key}__`,
          webpack.DefinePlugin.runtimeValue(() => JSON.stringify(getBuildEnvValue(key))),
        ])
    )
  )
}
