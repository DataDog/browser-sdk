const babel = require('@babel/core')

module.exports = {
  name: 'transform-to-es5',

  /**
   * @param pluginBuild {esbuild.PluginBuild}
   */
  setup(pluginBuild) {
    pluginBuild.onEnd(async (result) => {
      const newOutputFiles = []
      await Promise.all(
        result.outputFiles.map(async (outputFile) => {
          if (outputFile.path.endsWith('.js')) {
            const sourceMapFile = result.outputFiles.find((other) => other.path === `${outputFile.path}.map`)
            const babelResult = await transformToEs5(outputFile.text, sourceMapFile && JSON.parse(sourceMapFile.text))
            if (babelResult.map) {
              newOutputFiles.push(createOutputFileFromText(sourceMapFile.path, JSON.stringify(babelResult.map)))
            }
            newOutputFiles.push(createOutputFileFromText(outputFile.path, babelResult.code))
          } else if (outputFile.path.endsWith('.js.map')) {
            // ignore
          } else {
            newOutputFiles.push(outputFile)
          }
        })
      )
      result.outputFiles = newOutputFiles
    })
  },
}

/**
 * @param code {string}
 */
async function transformToEs5(input, inputSourceMap) {
  const babelResult = await babel.transformAsync(input, {
    presets: [
      [
        '@babel/preset-env',
        {
          exclude: [
            // We don't use a "Symbol" polyfill, so we don't need to transform 'typeof' to support it
            'transform-typeof-symbol',
          ],
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
    inputSourceMap,
    sourceMaps: Boolean(inputSourceMap),
  })
  return babelResult
}

function createOutputFileFromText(path, text) {
  return {
    text,
    path,
    get contents() {
      return new TextEncoder().encode(text)
    },
  }
}
