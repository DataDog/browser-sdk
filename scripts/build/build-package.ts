import fs from 'node:fs/promises'
import { readFileSync, globSync } from 'node:fs'
import { parseArgs } from 'node:util'
import ts from 'typescript'
import webpack from 'webpack'
import { build as tsdownBuild } from 'tsdown'
import webpackBase from '../../webpack.base.ts'

import { printLog, runMain } from '../lib/executionUtils.ts'
import { buildEnvKeys, getBuildEnvValue } from '../lib/buildEnv.ts'

runMain(async () => {
  const { values } = parseArgs({
    options: {
      modules: {
        type: 'boolean',
      },
      bundle: {
        type: 'string',
        multiple: true,
      },
      verbose: {
        type: 'boolean',
        default: false,
      },
    },
  })

  if (values.modules) {
    printLog('Building modules...')
    await buildModules({ verbose: values.verbose })
  }

  if (values.bundle?.length) {
    printLog('Building bundle...')
    await buildBundles({ bundles: values.bundle.map(parseBundleOption), verbose: values.verbose })
  }

  printLog('Done.')
})

interface Bundle {
  filename: string
  entry: string
}

function parseBundleOption(bundle: string): Bundle {
  const separatorIndex = bundle.indexOf('=')
  if (separatorIndex === -1) {
    return { filename: bundle, entry: './src/entries/main.ts' }
  }
  return {
    filename: bundle.slice(0, separatorIndex),
    entry: bundle.slice(separatorIndex + 1),
  }
}

async function buildBundles({ bundles, verbose }: { bundles: Bundle[]; verbose: boolean }) {
  await fs.rm('./bundle', { recursive: true, force: true })
  await Promise.all(bundles.map(buildBundle))

  function buildBundle({ filename, entry }: Bundle) {
    return new Promise<void>((resolve, reject) => {
      webpack(
        webpackBase({
          mode: 'production',
          entry,
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
  }

  function printStats(stats: webpack.Stats) {
    console.log(stats.toString({ colors: true }))
  }
}

// Returns only the build-env keys actually referenced in this package's sources. tsdown's `define`
// is eager: every listed key is computed up front, for every package. WORKER_STRING reads (and may
// rebuild) packages/browser-worker/bundle/worker.js, so computing it for packages that don't use it
// makes them race against browser-worker's own concurrent rebuild. Filtering to referenced keys
// mirrors webpack's lazy DefinePlugin.runtimeValue, so only browser-rum (the sole consumer) touches
// the worker bundle.
function referencedBuildEnvKeys() {
  const files = globSync('./src/**/*.ts', { exclude: ['**/*.spec.*', '**/*.specHelper.*'] })
  const content = files.map((file) => readFileSync(file, 'utf8')).join('\n')
  return buildEnvKeys.filter((key) => content.includes(`__BUILD_ENV__${key}__`))
}

async function buildModules({ verbose }: { verbose: boolean }) {
  // Transpile the source with tsdown (Rolldown). We let TypeScript emit the declaration files (see
  // emitDeclarations) rather than tsdown, because Rolldown's declaration bundler restructures
  // modules in ways that break compatibility with older TypeScript versions (e.g. inline `type`
  // modifiers, rewritten re-exports).
  // TODO: once we drop support for TypeScript < 4.7, let tsdown emit the declarations (`dts: true`)
  // and remove emitDeclarations. The bundler output needs inline `type` modifiers (TS 4.5+) and
  // `.mjs`/`.js` extensioned import paths that only resolve under `node16`/`bundler` module
  // resolution (TS 4.7+), so 4.7 is the floor where it works.
  await tsdownBuild({
    clean: true,
    // Every package exposes its public surface through `src/entries/*.ts` and/or a single
    // `src/index.ts`. Restricting entries to those (rather than every source file) lets Rolldown
    // tree-shake code only reachable from specs.
    entry: ['./src/index.ts', './src/entries/*.ts', '!**/*.spec.*', '!**/*.specHelper.*'],
    // In unbundle mode `root` is the preserveModulesRoot: it pins the output layout to mirror `src/`
    // so e.g. `src/entries/main.ts` emits to `cjs/entries/main.js`. Without it, the output would be
    // rooted at the entries' common ancestor and flatten `entries/main.ts` to `cjs/main.js`.
    root: './src',
    format: {
      cjs: {
        outDir: './cjs',
      },
      esm: {
        outDir: './esm',
      },
    },
    platform: 'neutral',
    unbundle: true,
    dts: false,
    tsconfig: '../../tsconfig.base.json',
    define: Object.fromEntries(
      referencedBuildEnvKeys().map((key) => [`__BUILD_ENV__${key}__`, JSON.stringify(getBuildEnvValue(key))])
    ),
    sourcemap: true,
    logLevel: verbose ? 'info' : 'error',
  })

  emitDeclarations()
}

// Declarations only need to live next to the CommonJS output: every package's `types` field (and
// the `types` condition in `exports`) points at `./cjs`, so both CJS and ESM consumers resolve
// the same declaration files.
function emitDeclarations() {
  const { options, fileNames } = ts.parseJsonConfigFileContent(
    {
      extends: '../../tsconfig.base.json',
      compilerOptions: {
        declaration: true,
        emitDeclarationOnly: true,
        allowJs: true,
        rootDir: './src/',
        outDir: './cjs',
        paths: {},
      },
      include: ['./src'],
      exclude: ['./src/**/*.spec.*', './src/**/*.specHelper.*'],
    },
    ts.sys,
    process.cwd(),
    undefined,
    'tsconfig.json' // just used in messages
  )

  const program = ts.createProgram({ rootNames: fileNames, options })
  const emitResult = program.emit()
  const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emitResult.diagnostics]

  if (diagnostics.length) {
    printTypeScriptDiagnostics(diagnostics)
    throw new Error('Failed to build package due to TypeScript errors')
  }
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
