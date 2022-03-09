import { copyFile, rm, mkdir } from 'fs/promises'
import esbuild from 'esbuild'
import { htmlPlugin } from '@craftamap/esbuild-plugin-html'
import reloaderPlugin from 'esbuild-reloader'

const shouldWatch = process.argv.includes('--watch')

const outdir = 'dist'

await rm(outdir, { recursive: true, force: true })
await mkdir(outdir)
await copyFile('manifest.json', `${outdir}/manifest.json`)
await copyFile('icons/icon.png', `${outdir}/icon.png`)

try {
  await esbuild.build({
    entryPoints: {
      devtools: 'src/devtools/index.tsx',
      panel: 'src/panel/index.tsx',
      background: 'src/background/index.ts',
      contentscript: 'src/contentscript/index.ts',
    },
    outdir,
    bundle: true,
    metafile: true,
    logLevel: 'info',
    plugins: [
      htmlPlugin({
        files: [
          {
            entryPoints: ['src/devtools/index.tsx'],
            filename: 'devtools.html',
          },
          {
            entryPoints: ['src/panel/index.tsx'],
            filename: 'panel.html',
          },
        ],
      }),
      ...(shouldWatch ? [reloaderPlugin()] : []),
    ],
    watch: shouldWatch,
  })
} catch {
  // The error is already displayed by esbuild
  process.exit(1)
}
