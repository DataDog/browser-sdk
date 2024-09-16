const fs = require('fs')
const esbuild = require('esbuild')

esbuild
  .build({
    entryPoints: ['src/entries/main.ts'],
    outdir: './bundle',
    bundle: true,
    minify: true,
    metafile: true,
    sourcemap: true,
    splitting: true,
    format: 'esm',
  })
  .then((result) => {
    fs.writeFileSync('meta.json', JSON.stringify(result.metafile))
  })
  .catch(() => {
    console.log('error')
  })
