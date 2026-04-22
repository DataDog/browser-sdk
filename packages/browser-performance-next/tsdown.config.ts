import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts', collectors: 'src/collectors/index.ts' },
  format: 'esm',
  dts: true,
})
