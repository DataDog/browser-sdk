import { makeBaseNPMConfig, makeNPMConfigVariants } from './scripts/npmHelpers.mjs'

const variants = makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: ['src/index.server.ts', 'src/index.client.ts'],
    packageSpecificConfig: {
      output: {
        dynamicImportInCjs: true,
        exports: 'named',
      },
    },
    // Astro is Node 18+ no need to add polyfills
    addPolyfills: false,
  })
)

export default variants
