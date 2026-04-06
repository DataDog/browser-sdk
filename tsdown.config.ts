import { defineConfig } from 'tsdown'

export default defineConfig({
  workspace: ['packages/*-next', 'packages/browser-sdk'],
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: { build: true },
  clean: true,
})
