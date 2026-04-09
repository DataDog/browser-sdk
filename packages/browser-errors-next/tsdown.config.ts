import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/collectors/index.ts'],
  format: ['esm', 'cjs'],
  dts: { build: true },
  clean: true,
})
