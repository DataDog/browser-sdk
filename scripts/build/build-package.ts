import fs from 'node:fs/promises'
import path from 'node:path'
import { globSync } from 'node:fs'
import { createRequire } from 'node:module'
import { parseArgs } from 'node:util'
import ts from 'typescript'
import webpack from 'webpack'
import { build as tsdownBuild } from 'tsdown'
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
    await buildModules({ verbose: values.verbose })
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

async function buildModules({ verbose }: { verbose: boolean }) {
  await fs.rm('./cjs', { recursive: true, force: true })
  await fs.rm('./esm', { recursive: true, force: true })

  // Transpile the source with tsdown (Rolldown). We let TypeScript emit the declaration files (see
  // emitDeclarations) rather than tsdown, because Rolldown's declaration bundler restructures
  // modules in ways that break compatibility with older TypeScript versions (e.g. inline `type`
  // modifiers, rewritten re-exports). `define` inlines build-time constants at transpile time.
  await tsdownBuild({
    entry: ['./src/**/*.ts', '!./src/**/*.spec.ts', '!./src/**/*.specHelper.ts'],
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
    // Mark all non-relative imports as external (cross-package deps and node_modules)
    deps: { neverBundle: /^[^./]/ },
    define: Object.fromEntries(
      buildEnvKeys.map((key) => [`__BUILD_ENV__${key}__`, JSON.stringify(getBuildEnvValue(key))])
    ),
    sourcemap: true,
    logLevel: verbose ? 'info' : 'error',
  })

  await vendorOxcRuntimeHelpers('./cjs', { module: 'cjs' })
  await vendorOxcRuntimeHelpers('./esm', { module: 'esm' })

  // Declarations only need to live next to the CommonJS output: every package's `types` field (and
  // the `types` condition in `exports`) points at `./cjs`, so both CJS and ESM consumers resolve
  // the same declaration files.
  emitDeclarations('./cjs')
}

const OXC_HELPERS_DIRNAME = '_oxc-helpers'
const OXC_HELPER_IMPORT_RE = /@oxc-project\/runtime\/helpers\/([\w-]+)/g

// tsdown/Rolldown lowers TypeScript features (e.g. decorators) using helpers imported from
// `@oxc-project/runtime`, and oxc cannot inline them. To avoid shipping that runtime as a
// dependency, we vendor the few helpers actually used: copy them into the output directory and
// rewrite the bare imports to point at the local copies. The helpers are self-contained (the same
// snippets `tsc` would have inlined), so no transitive resolution is needed.
async function vendorOxcRuntimeHelpers(outDir: string, { module }: { module: 'cjs' | 'esm' }) {
  const ext = module === 'esm' ? '.mjs' : '.js'
  const files = globSync(`**/*${ext}`, { cwd: outDir }).map((file) => path.resolve(outDir, file))

  const usedHelpers = new Set<string>()
  for (const file of files) {
    for (const [, helper] of (await fs.readFile(file, 'utf8')).matchAll(OXC_HELPER_IMPORT_RE)) {
      usedHelpers.add(helper)
    }
  }

  if (usedHelpers.size === 0) {
    return
  }

  const require = createRequire(import.meta.url)
  const runtimeRoot = path.dirname(require.resolve('@oxc-project/runtime/package.json'))
  const helpersDir = path.resolve(outDir, OXC_HELPERS_DIRNAME)
  await fs.mkdir(helpersDir, { recursive: true })

  for (const helper of usedHelpers) {
    // The CJS and ESM helper variants live in separate directories within the runtime package.
    const source = path.join(runtimeRoot, 'src/helpers', module === 'esm' ? 'esm' : '', `${helper}.js`)
    await fs.copyFile(source, path.join(helpersDir, `${helper}${ext}`))
  }

  for (const file of files) {
    await modifyFile(file, (content: string) =>
      content.replace(OXC_HELPER_IMPORT_RE, (_, helper: string) => {
        const relativePath = path.relative(path.dirname(file), path.join(helpersDir, `${helper}${ext}`))
        const specifier = relativePath.startsWith('.') ? relativePath : `./${relativePath}`
        // CJS `require` resolves extensionless specifiers; ESM imports need the explicit extension.
        return module === 'esm' ? specifier : specifier.slice(0, -ext.length)
      })
    )
  }
}

function emitDeclarations(outDir: string) {
  const { options, fileNames } = ts.parseJsonConfigFileContent(
    {
      extends: '../../tsconfig.base.json',
      compilerOptions: {
        declaration: true,
        emitDeclarationOnly: true,
        allowJs: true,
        rootDir: './src/',
        outDir,
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
