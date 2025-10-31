import fs from 'node:fs/promises'
import { parseArgs } from 'node:util'
import ts from 'typescript'
import { globSync } from 'glob'
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
})

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
          return
        }

        if (verbose) {
          console.log(stats!.toString({ colors: true }))
        }
        resolve()
      }
    )
  })
}

async function buildModules({ outDir, module, verbose }: { outDir: string; module: string; verbose: boolean }) {
  await fs.rm(outDir, { recursive: true, force: true })

  // TODO: in the future, consider building packages with something else than typescript (ex:
  // rspack, tsdown...)

  const parsed = ts.parseJsonConfigFileContent(
    {
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
    },
    ts.sys,
    process.cwd(),
    undefined,
    'tsconfig.json' // just used in messages
  )

  const host = ts.createCompilerHost(parsed.options)
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    host,
  })

  const emitResult = program.emit()
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics)

  if (diagnostics.length) {
    const formatHost: ts.FormatDiagnosticsHost = {
      getCanonicalFileName: (f) => f,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => ts.sys.newLine,
    }
    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost))
  }

  if (emitResult.emitSkipped) {
    throw new Error('Failed to build package')
  }

  for (const path of globSync('**/*.js', { cwd: outDir, absolute: true })) {
    if (await modifyFile(path, (content: string) => replaceBuildEnv(content))) {
      if (verbose) {
        printLog(`Replaced BuildEnv in ${path}`)
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
