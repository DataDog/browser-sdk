import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts', processor: 'src/processor/index.ts', extension: 'src/extension/index.ts' },
  format: ['esm', 'cjs'],
  dts: { build: true },
  clean: true,
})
