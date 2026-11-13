// Converts spec files from the Jasmine API to the Vitest API.
//
// Usage: node scripts/test/jasmine-to-vitest.ts <file or directory>...
//
// Converted files are formatted with Prettier. Constructs that can't be converted safely are left
// untouched and listed at the end, to be fixed by hand. The conversion is deterministic: on a merge
// conflict, take the file from `main` and run the script again.

import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import * as prettier from 'prettier'
import { printError, printLog, printWarning, runMain } from '../lib/executionUtils.ts'
import { transformJasmineToVitest } from './lib/jasmineToVitest.ts'

const SPEC_FILE_PATTERN = '**/*.spec.{ts,tsx}'

runMain(async () => {
  const { positionals } = parseArgs({ allowPositionals: true })
  if (positionals.length === 0) {
    printError('Usage: node scripts/test/jasmine-to-vitest.ts <file or directory>...')
    process.exit(1)
  }

  const files = positionals.flatMap(findSpecFiles)
  let convertedCount = 0
  let unsupportedCount = 0

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    const { code, unsupported } = transformJasmineToVitest(source, file)

    if (code !== source) {
      const options = await prettier.resolveConfig(file)
      fs.writeFileSync(file, await prettier.format(code, { ...options, filepath: file }))
      convertedCount++
    }

    for (const { line, text, reason } of unsupported) {
      printWarning(`${file}:${line}: ${reason}\n    ${text}`)
      unsupportedCount++
    }
  }

  printLog(`Converted ${convertedCount} of ${files.length} spec files.`)
  if (unsupportedCount) {
    printWarning(`${unsupportedCount} construct(s) to convert by hand (see above).`)
  }
})

function findSpecFiles(target: string): string[] {
  if (fs.statSync(target).isDirectory()) {
    return fs
      .globSync(SPEC_FILE_PATTERN, { cwd: target })
      .map((file) => path.join(target, file))
      .sort()
  }
  return [target]
}
