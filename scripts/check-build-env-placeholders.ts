import fs, { globSync } from 'node:fs'
import path from 'node:path'
import { printError, printLog, runMain } from './lib/executionUtils.ts'

const PLACEHOLDER_RE = /__BUILD_ENV__[A-Z_]+__/g
const SCAN_DIRS = ['cjs', 'esm', 'bundle']

export interface PlaceholderHit {
  file: string
  placeholders: string[]
}

export interface ScanResult {
  hits: PlaceholderHit[]
  scannedFiles: number
}

export function findUnreplacedPlaceholders(packagesRoot: string): ScanResult {
  const hits: PlaceholderHit[] = []
  let scannedFiles = 0
  for (const packageDir of globSync(path.join(packagesRoot, '*'))) {
    for (const dir of SCAN_DIRS) {
      const baseDir = path.join(packageDir, dir)
      if (!fs.existsSync(baseDir)) {
        continue
      }
      for (const relative of globSync('**/*.js', { cwd: baseDir })) {
        const file = path.join(baseDir, relative)
        const content = fs.readFileSync(file, 'utf8')
        scannedFiles += 1
        const matches = content.match(PLACEHOLDER_RE)
        if (matches) {
          hits.push({ file, placeholders: matches })
        }
      }
    }
  }
  return { hits, scannedFiles }
}

if (!process.env.NODE_TEST_CONTEXT) {
  runMain(() => {
    const { hits, scannedFiles } = findUnreplacedPlaceholders('packages')

    if (scannedFiles === 0) {
      printError(
        'No built files were scanned — expected packages/*/{cjs,esm,bundle}/**/*.js to exist. ' +
          'Run `yarn build` first, or check whether output directories have been renamed.'
      )
      process.exit(1)
    }

    if (hits.length === 0) {
      printLog(`No unreplaced __BUILD_ENV__ placeholders found (${scannedFiles} files scanned).`)
      return
    }

    printError('Found unreplaced __BUILD_ENV__ placeholders in built packages:')
    for (const { file, placeholders } of hits) {
      printError(`  ${file}: ${placeholders.join(', ')}`)
    }
    printError(
      '\nThis usually means the build-env replacement step (scripts/build/build-package.ts) ' +
        'missed an output file or a placeholder name.'
    )
    process.exit(1)
  })
}
