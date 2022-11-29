const fs = require('fs').promises
const path = require('path')
const babel = require('@babel/core')

const cache = new Map()

// Esbuild plugin for aliasing + babel pass
module.exports = {
  name: 'transform-to-es5',

  /**
   * @param pluginBuild {esbuild.PluginBuild}
   */
  setup(build) {
    // Apply babel pass whenever we load a .ts file
    build.onLoad({ filter: /\.[tj]sx?$/ }, async (args) => {
      if (args.path.includes('node_modules')) return undefined

      const contents = await fs.readFile(args.path, 'utf-8')

      let cached = cache.get(args.path)

      if (!cached || cached.contents !== contents) {
        cached = {
          contents,
          promise: transformToEs5(args.path, contents).then((transformedContent) => ({
            contents: transformedContent,
            resolveDir: path.dirname(args.path),
            loader: 'ts',
          })),
        }
        cache.set(args.path, cached)
      }

      return cached.promise
    })
  },
}

/**
 * @param code {string}
 */
async function transformToEs5(filename, input) {
  const babelResult = await babel.transformAsync(input, {
    filename,
    presets: [
      [
        '@babel/preset-env',
        {
          // Setting `loose: true` will make `for of` more verbose than necessary (the
          // `iterableIsArray` assumption is ignored)
          // But setting `loose: false` will make classes more verbose than necessary and no
          // assumption can fix that.
          // loose: true,
          exclude: [
            // We don't use a "Symbol" polyfill, so we don't need to transform 'typeof' to support it
            'transform-typeof-symbol',
          ],
        },
      ],
    ],
    plugins: [
      ['@babel/plugin-syntax-typescript'],
      // FIXME Including helpers does not pull the helpers code
      // ['@babel/plugin-external-helpers']
      // TODO make istanbul optional/configurable
      [
        'istanbul',
        {
          include: '**/packages/**/*.ts',
        },
      ],
    ],
    targets: '> 0.5%, IE 11',
    caller: {
      name: 'browser-sdk-build-script',
      supportsStaticESM: true,
      // We don't use dynamic import, but make sure babel doesn't print a warning about it
      // https://github.com/babel/babel/issues/14227
      supportsDynamicImport: true,
    },
    assumptions: {
      noClassCalls: true,
      noDocumentAll: true,
      iterableIsArray: true,
      setClassMethods: true,
      setPublicClassFields: true,
      setComputedProperties: true,
      setSpreadProperties: true,
      constantSuper: true,
      ignoreFunctionLength: true,
    },
    sourceMaps: 'inline',
  })
  return babelResult.code
}
