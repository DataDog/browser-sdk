import fs, { globSync } from 'node:fs'
import path from 'node:path'
import { printError, printLog, runMain } from './lib/executionUtils.ts'

const PLACEHOLDER_RE = /__BUILD_ENV__[A-Z_]+__/g
const SCAN_DIRS = ['cjs', 'esm', 'bundle']

export interface PlaceholderHit {
  file: string
  placeholders: string[]
}

export function findUnreplacedPlaceholders(packagesRoot: string): PlaceholderHit[] {
  const hits: PlaceholderHit[] = []
  for (const packageDir of globSync(path.join(packagesRoot, '*'))) {
    for (const dir of SCAN_DIRS) {
      const baseDir = path.join(packageDir, dir)
      if (!fs.existsSync(baseDir)) {
        continue
      }
      for (const relative of globSync('**/*.js', { cwd: baseDir })) {
        const file = path.join(baseDir, relative)
        const content = fs.readFileSync(file, 'utf8')
        const matches = content.match(PLACEHOLDER_RE)
        if (matches) {
          hits.push({ file, placeholders: [...new Set(matches)] })
        }
      }
    }
  }
  return hits
}

if (!process.env.NODE_TEST_CONTEXT) {
  runMain(() => {
    const hits = findUnreplacedPlaceholders('packages')

    if (hits.length === 0) {
      printLog('No unreplaced __BUILD_ENV__ placeholders found in built packages.')
      return
    }

    printError('Found unreplaced __BUILD_ENV__ placeholders in built packages:')
    for (const { file, placeholders } of hits) {
      printError(`  ${file}: ${placeholders.join(', ')}`)
    }
    printError(
      '\nThis usually means the build-env replacement step (scripts/build/build-package.ts) ' +
        'missed an output file or a placeholder name. See incident 14078 for context.'
    )
    process.exit(1)
  })
}
