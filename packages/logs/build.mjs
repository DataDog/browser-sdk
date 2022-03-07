import build from '../../scripts/build/build.mjs'

await build({
  entryPoint: 'src/entries/main.ts',
  outputFilePath: 'bundle/datadog-logs.js',
})
