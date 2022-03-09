import { relative, dirname } from 'path'
import * as fs from 'fs/promises'
import esbuild from 'esbuild'
import * as buildEnv from '../build-env.js'
import esbuildPluginTransformToEs5 from './esbuildPluginTransformToEs5.js'

export default async function build({ entryPoint, outputFilePath }) {
  try {
    console.log(`Bundle ${entryPoint}...`)
    const bundleResult = await bundle({
      entryPoints: [entryPoint],
      outfile: outputFilePath,
      format: 'esm',
    })
    const minifyResult = await minify(bundleResult.outputFiles)
    await write(minifyResult)
    console.log('Success!')
  } catch (error) {
    // Errors should already be displayed
    if (!error.errors) {
      console.error(error.message)
    }
    process.exitCode = 1
  }
}

/**
 * @param entryPoint {string}
 * @param outputFilePath {string}
 */
export function bundle({ entryPoints, outfile, watch, outdir, format, sourcemap }) {
  return esbuild.build({
    entryPoints,
    outfile,
    watch,
    outdir,
    format,
    sourcemap,
    bundle: true,
    target: ['es6'],
    write: false,
    logLevel: 'info',
    define: {
      __BUILD_ENV__BUILD_MODE__: JSON.stringify(buildEnv.BUILD_MODE),
      __BUILD_ENV__SDK_VERSION__: JSON.stringify(buildEnv.SDK_VERSION),
    },
    plugins: [esbuildPluginTransformToEs5],
  })
}

/**
 * @param inputFiles {Array<{text: string, path: string}>}
 */
async function minify(inputFiles) {
  return Promise.all(
    inputFiles.map(async ({ path, text }) => {
      console.log(`Minify ${relative(process.cwd(), path)}...`)
      const transformResult = await esbuild.transform(text, {
        minify: true,
        target: ['es5'],
        logLevel: 'info',
        format: 'iife',
      })
      return { path, text: transformResult.code }
    })
  )
}

/**
 * @param inputFiles {Array<{text: string, path: string}>}
 */
async function write(inputFiles) {
  return Promise.all(
    inputFiles.map(async ({ path, text }) => {
      console.log(`Write ${relative(process.cwd(), path)}...`)
      await fs.mkdir(dirname(path), { recursive: true, force: true })
      await fs.writeFile(path, text, { flag: 'w' })
    })
  )
}
