import fs from 'node:fs/promises'
import { parseArgs } from 'node:util'
import path from 'node:path'
import { globSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import ts from 'typescript'
import webpack from 'webpack'
import webpackBase from '../../webpack.base.ts'

import { printLog, runMain } from '../lib/executionUtils.ts'
import { modifyFile } from '../lib/filesUtils.ts'
import { buildEnvKeys, getBuildEnvValue } from '../lib/buildEnv.ts'

runMain(async () => {
  const { values } = parseArgs({
    options: {
      modules: {
        type: 'boolean',
      },
      bundle: {
        type: 'string',
      },
      verbose: {
        type: 'boolean',
        default: false,
      },
    },
  })

  // Generate WASM base64 file if this is the electron package
  await generateWasmBase64IfNeeded({ verbose: values.verbose })

  if (values.modules) {
    printLog('Building modules...')
    await buildModules({
      outDir: './cjs',
      module: 'commonjs',
      verbose: values.verbose,
    })
    await buildModules({
      outDir: './esm',
      module: 'es2020',
      verbose: values.verbose,
    })
  }

  if (values.bundle) {
    printLog('Building bundle...')
    await buildBundle({
      filename: values.bundle,
      verbose: values.verbose,
    })
  }

  printLog('Done.')
})

async function generateWasmBase64IfNeeded({ verbose }: { verbose: boolean }) {
  // Check if this is the electron package by looking for the WASM generation script
  const wasmGeneratorScript = './scripts/generate-wasm-base64.js'

  if (existsSync(wasmGeneratorScript)) {
    printLog('Generating WASM base64...')
    try {
      execSync(`node ${wasmGeneratorScript}`, {
        stdio: verbose ? 'inherit' : 'pipe',
        encoding: 'utf-8'
      })
      if (verbose) {
        printLog('WASM base64 generation completed')
      }
    } catch (error) {
      throw new Error(`Failed to generate WASM base64: ${error}`)
    }
  }
}

async function buildBundle({ filename, verbose }: { filename: string; verbose: boolean }) {
  await fs.rm('./bundle', { recursive: true, force: true })
  return new Promise<void>((resolve, reject) => {
    webpack(
      webpackBase({
        mode: 'production',
        entry: './src/entries/main.ts',
        filename,
      }),
      (error, stats) => {
        if (error) {
          reject(error)
        } else if (!stats) {
          reject(new Error('Webpack did not return stats'))
        } else if (stats.hasErrors()) {
          printStats(stats)
          reject(new Error('Failed to build bundle due to Webpack errors'))
        } else {
          if (verbose) {
            printStats(stats)
          }
          resolve()
        }
      }
    )
  })

  function printStats(stats: webpack.Stats) {
    console.log(stats.toString({ colors: true }))
  }
}

async function buildModules({ outDir, module, verbose }: { outDir: string; module: string; verbose: boolean }) {
  await fs.rm(outDir, { recursive: true, force: true })

  // TODO: in the future, consider building packages with something else than typescript (ex:
  // rspack, tsdown...)

  const diagnostics = buildWithTypeScript({
    extends: '../../tsconfig.base.json',
    compilerOptions: {
      baseUrl: '.',
      declaration: true,
      allowJs: true,
      module,
      rootDir: './src/',
      outDir,
    },
    include: ['./src'],
    exclude: ['./src/**/*.spec.*', './src/**/*.specHelper.*'],
  })

  if (diagnostics.length) {
    printTypeScriptDiagnostics(diagnostics)
    throw new Error('Failed to build package due to TypeScript errors')
  }

  await replaceBuildEnvInDirectory(outDir, { verbose })
}

async function replaceBuildEnvInDirectory(dir: string, { verbose }: { verbose: boolean }) {
  for (const relativePath of globSync('**/*.js', { cwd: dir })) {
    const absolutePath = path.resolve(dir, relativePath)
    if (await modifyFile(absolutePath, (content: string) => replaceBuildEnv(content))) {
      if (verbose) {
        printLog(`Replaced BuildEnv in ${absolutePath}`)
      }
    }
  }

  function replaceBuildEnv(content: string): string {
    return buildEnvKeys.reduce(
      (content, key) => content.replaceAll(`__BUILD_ENV__${key}__`, () => JSON.stringify(getBuildEnvValue(key))),
      content
    )
  }
}

function buildWithTypeScript(configuration: { [key: string]: unknown }) {
  const parsedConfiguration = ts.parseJsonConfigFileContent(
    configuration,
    ts.sys,
    process.cwd(),
    undefined,
    'tsconfig.json' // just used in messages
  )

  const host = ts.createCompilerHost(parsedConfiguration.options)
  const program = ts.createProgram({
    rootNames: parsedConfiguration.fileNames,
    options: parsedConfiguration.options,
    host,
  })

  const emitResult = program.emit()
  if (emitResult.emitSkipped) {
    throw new Error('No files were emitted')
  }

  return [...ts.getPreEmitDiagnostics(program), ...emitResult.diagnostics]
}

function printTypeScriptDiagnostics(diagnostics: ts.Diagnostic[]) {
  const formatHost: ts.FormatDiagnosticsHost = {
    getCanonicalFileName: (f) => f,
    // eslint-disable-next-line @typescript-eslint/unbound-method
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => ts.sys.newLine,
  }
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost))
}
