import fs from 'node:fs/promises'
import { parseArgs } from 'node:util'
import path from 'node:path'
import { globSync } from 'node:fs'
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
