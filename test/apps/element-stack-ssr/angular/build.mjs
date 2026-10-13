import { build } from 'esbuild'

await build({
  entryPoints: ['client.ts'],
  outfile: 'dist/client.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  sourcemap: true,
})
await build({
  entryPoints: ['server.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  packages: 'external',
  format: 'esm',
  platform: 'node',
})
