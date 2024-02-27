import * as fs from 'fs'
import * as path from 'path'
import deepMerge from 'deepmerge'
import { builtinModules } from 'module'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import sucrase from '@rollup/plugin-sucrase'

const packageDotJSON = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), './package.json'), { encoding: 'utf8' }))

export function makeBaseNPMConfig(options = {}) {
  const {
    entrypoints = ['src/index.ts'],
    esModuleInterop = false,
    packageSpecificConfig = {},
    addPolyfills = true,
  } = options

  const nodeResolvePlugin = nodeResolve()
  const sucrasePlugin = sucrase({
    transforms: ['typescript', 'jsx'],
    disableESTransforms: !addPolyfills,
  })

  const defaultBaseConfig = {
    input: entrypoints,

    output: {
      dir: 'build',

      sourcemap: true,

      preserveModules: true,

      generatedCode: {
        preset: 'es2015',
        symbols: false,
      },

      strict: false,

      externalLiveBindings: false,

      freeze: false,

      interop: esModuleInterop ? 'auto' : 'esModule',
    },

    plugins: [nodeResolvePlugin, sucrasePlugin],

    external: [
      ...builtinModules,
      ...Object.keys(packageDotJSON.dependencies || {}),
      ...Object.keys(packageDotJSON.peerDependencies || {}),
    ],
  }

  if (addPolyfills) {
    defaultBaseConfig.plugins.push(extractPolyfillsPlugin)
  }

  return deepMerge(defaultBaseConfig, packageSpecificConfig, {
    customMerge: (key) => (key === 'plugins' ? mergePlugins : undefined),
  })
}

export function makeNPMConfigVariants(baseConfig) {
  const variantSpecificConfigs = [
    { output: { format: 'cjs', dir: path.join(baseConfig.output.dir, 'cjs') } },
    { output: { format: 'esm', dir: path.join(baseConfig.output.dir, 'esm') } },
  ]

  return variantSpecificConfigs.map((variant) => deepMerge(baseConfig, variant))
}
