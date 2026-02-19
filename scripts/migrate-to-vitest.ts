#!/usr/bin/env node
/**
 * Automated Jasmine → Vitest migration script for spec files.
 *
 * Handles the mechanical API transformations. Run with:
 * node scripts/migrate-to-vitest.ts [glob-pattern]
 *
 * Default pattern: packages/**\/*.spec.{ts,tsx} + developer-extension/**\/*.spec.{ts,tsx}
 */

import { readFileSync, writeFileSync, globSync } from 'node:fs'
import { runMain } from './lib/executionUtils.ts'

runMain(() => {
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const verbose = args.includes('--verbose')

const patterns = args.filter((a) => !a.startsWith('--'))

const files =
  patterns.length > 0
    ? patterns.flatMap((p) => globSync(p))
    : [
        ...globSync('packages/*/{src,test}/**/*.spec.{ts,tsx}'),
        ...globSync('developer-extension/{src,test}/**/*.spec.{ts,tsx}'),
      ]

const specFiles = files

let totalChanged = 0

for (const file of specFiles) {
  const original = readFileSync(file, 'utf-8')
  let content = original
  const needsVi = new Set<string>()

  // ─── jasmine.createSpy() → vi.fn() ───
  // jasmine.createSpy<Type>() → vi.fn<Type>()
  // jasmine.createSpy('name') → vi.fn()  (name discarded, Vitest doesn't support spy names the same way)
  content = content.replace(/jasmine\.createSpy<([^>]+)>\(\)/g, (_match, type) => {
    needsVi.add('vi')
    return `vi.fn<${type}>()`
  })
  content = content.replace(/jasmine\.createSpy<([^>]+)>\([^)]*\)/g, (_match, type) => {
    needsVi.add('vi')
    return `vi.fn<${type}>()`
  })
  content = content.replace(/jasmine\.createSpy\([^)]*\)/g, () => {
    needsVi.add('vi')
    return 'vi.fn()'
  })

  // ─── jasmine.Spy<T> type → Mock<T> ───
  if (/jasmine\.Spy\b/.test(content)) {
    needsVi.add('Mock')
    content = content.replace(/jasmine\.Spy<([^>]+)>/g, 'Mock<$1>')
    content = content.replace(/jasmine\.Spy\b/g, 'Mock')
  }

  // ─── jasmine.Func → (...args: any[]) => any ───
  content = content.replace(/jasmine\.Func/g, '(...args: any[]) => any')

  // ─── spy.and.callFake(fn) → spy.mockImplementation(fn) ───
  content = content.replace(/\.and\.callFake\(/g, '.mockImplementation(')

  // ─── spy.and.returnValue(v) → spy.mockReturnValue(v) ───
  content = content.replace(/\.and\.returnValue\(/g, '.mockReturnValue(')

  // ─── spy.and.returnValues(...v) → spy.mockReturnValueOnce sequences ───
  // This is complex; handle simple cases
  content = content.replace(/\.and\.returnValues\(/g, '.mockReturnValueOnce(')

  // ─── spy.and.throwError(e) → spy.mockImplementation(() => { throw e }) ───
  content = content.replace(/\.and\.throwError\(([^)]+)\)/g, '.mockImplementation(() => { throw $1 })')

  // ─── spy.calls.mostRecent().args → spy.mock.lastCall ───
  content = content.replace(/\.calls\.mostRecent\(\)\.args/g, '.mock.lastCall')

  // ─── spy.calls.mostRecent() → { args: spy.mock.lastCall } ───
  // Only if not followed by .args (handled above)
  content = content.replace(/\.calls\.mostRecent\(\)(?!\.args)/g, '.mock.lastCall')

  // ─── spy.calls.argsFor(n) → spy.mock.calls[n] ───
  content = content.replace(/\.calls\.argsFor\(([^)]+)\)/g, '.mock.calls[$1]')

  // ─── spy.calls.count() → spy.mock.calls.length ───
  content = content.replace(/\.calls\.count\(\)/g, '.mock.calls.length')

  // ─── spy.calls.all() → spy.mock.invocationCallOrder.map(...)  ───
  // This returns {args, returnValue}[] — complex. Convert to mock.calls-based patterns.
  // spy.calls.all().map(c => c.args[0]) → spy.mock.calls.map(c => c[0])
  content = content.replace(
    /\.calls\.all\(\)\.map\(\((\w+)\)\s*=>\s*\1\.args\[(\d+)\]\)/g,
    '.mock.calls.map((c) => c[$2])'
  )
  // spy.calls.all().forEach(([eventName, listener]) => ...) — needs manual review
  // spy.calls.allArgs() → spy.mock.calls
  content = content.replace(/\.calls\.allArgs\(\)/g, '.mock.calls')
  // spy.calls.all() → spy.mock.calls.map((args, i) => ({ args, returnValue: spy.mock.results[i]?.value }))
  // This is too complex for regex, leave as calls.all() for manual fix

  // ─── spy.calls.first().args → spy.mock.calls[0] ───
  content = content.replace(/\.calls\.first\(\)\.args/g, '.mock.calls[0]')

  // ─── spy.calls.reset() → spy.mockClear() ───
  content = content.replace(/\.calls\.reset\(\)/g, '.mockClear()')

  // ─── jasmine.objectContaining() → expect.objectContaining() ───
  content = content.replace(/jasmine\.objectContaining\(/g, 'expect.objectContaining(')

  // ─── jasmine.arrayContaining() → expect.arrayContaining() ───
  content = content.replace(/jasmine\.arrayContaining\(/g, 'expect.arrayContaining(')

  // ─── jasmine.stringContaining() → expect.stringContaining() ───
  content = content.replace(/jasmine\.stringContaining\(/g, 'expect.stringContaining(')

  // ─── jasmine.stringMatching() → expect.stringMatching() ───
  content = content.replace(/jasmine\.stringMatching\(/g, 'expect.stringMatching(')

  // ─── jasmine.any(Type) → expect.any(Type) ───
  content = content.replace(/jasmine\.any\(/g, 'expect.any(')

  // ─── spyOn(obj, method) → vi.spyOn(obj, method) ───
  // Only match standalone spyOn, not vi.spyOn
  content = content.replace(/(?<!vi\.)(?<!\w)spyOn\(/g, () => {
    needsVi.add('vi')
    return 'vi.spyOn('
  })

  // ─── spyOnProperty(obj, prop, accessor) → vi.spyOn(obj, prop, accessor) ───
  content = content.replace(/(?<!\w)spyOnProperty\(/g, () => {
    needsVi.add('vi')
    return 'vi.spyOn('
  })

  // ─── toHaveBeenCalledOnceWith(...) → toHaveBeenCalledTimes(1) + separate assertion ───
  // This is tricky because we need to split into two assertions.
  // For now, replace with toHaveBeenCalledExactlyOnceWith which exists in Vitest via jest-extended
  // Actually, Vitest doesn't have this by default. Let's use a custom approach.
  // Simple approach: toHaveBeenCalledOnceWith() (no args) → toHaveBeenCalledTimes(1)
  content = content.replace(/\.toHaveBeenCalledOnceWith\(\)/g, '.toHaveBeenCalledTimes(1)')
  // With args: .toHaveBeenCalledOnceWith(args) is harder. Let me create a helper pattern.
  // For now, transform to .toHaveBeenCalledWith(args) and add a manual TODO.
  // Actually, let me just do both assertions inline:
  // expect(spy).toHaveBeenCalledOnceWith(arg1, arg2)
  // →
  // expect(spy).toHaveBeenCalledTimes(1)
  // expect(spy).toHaveBeenCalledWith(arg1, arg2)
  // This is complex with regex because the args can contain nested parens.
  // Simpler: use a function-based approach
  content = replaceCalledOnceWith(content)

  // ─── pending('reason') → context.skip() ───
  // In Vitest, pending() doesn't exist. The closest is return/skip.
  // Replace pending('...') with a return statement since Vitest doesn't have pending()
  // Actually, it's better to use `return` since `context.skip()` requires the test context
  content = content.replace(/\bpending\(([^)]*)\)/g, 'return // skip: $1')

  // ─── fail(msg) → throw new Error(msg) / expect.fail(msg) ───
  content = content.replace(/\bfail\(([^)]+)\)/g, 'throw new Error($1)')

  // ─── Add vi import if needed ───
  if (needsVi.size > 0 && content !== original) {
    const imports = Array.from(needsVi)
    const hasViImport = /import\s+\{[^}]*\bvi\b[^}]*\}\s+from\s+['"]vitest['"]/.test(content)
    const hasMockImport = /import\s+.*\bMock\b.*from\s+['"]vitest['"]/.test(content)

    if (imports.includes('vi') && !hasViImport) {
      if (imports.includes('Mock') && !hasMockImport) {
        content = `import { vi, type Mock } from 'vitest'\n${content}`
      } else {
        content = `import { vi } from 'vitest'\n${content}`
      }
    } else if (imports.includes('Mock') && !hasMockImport) {
      // Add Mock to existing vitest import
      if (hasViImport) {
        content = content.replace(
          /import\s+\{([^}]*)\}\s+from\s+['"]vitest['"]/,
          (_match, imports) => `import {${imports}, type Mock } from 'vitest'`
        )
      } else {
        content = `import { type Mock } from 'vitest'\n${content}`
      }
    }
  }

  if (content !== original) {
    totalChanged++
    if (verbose) {
      console.log(`  [changed] ${file}`)
    }
    if (!dryRun) {
      writeFileSync(file, content)
    }
  }
}

console.log(`\n${dryRun ? '[DRY RUN] Would change' : 'Changed'} ${totalChanged} of ${specFiles.length} files`)
}) // runMain

/**
 * Replace .toHaveBeenCalledOnceWith(args) with two assertions:
 * .toHaveBeenCalledTimes(1) and .toHaveBeenCalledWith(args)
 */
function replaceCalledOnceWith(content: string): string {
  // Match: expect(expr).toHaveBeenCalledOnceWith(args)
  // This needs to handle nested parentheses in args
  const regex = /(expect\([^)]+\))\.toHaveBeenCalledOnceWith\(/g
  let result = ''
  let lastIndex = 0
  let match

  while ((match = regex.exec(content)) !== null) {
    const expectPart = match[1]
    const argsStart = match.index + match[0].length
    const argsEnd = findMatchingParen(content, argsStart - 1)

    if (argsEnd === -1) {
      // Couldn't find matching paren, skip
      result += content.slice(lastIndex, match.index + match[0].length)
      lastIndex = match.index + match[0].length
      continue
    }

    const args = content.slice(argsStart, argsEnd)
    result += content.slice(lastIndex, match.index)

    if (args.trim() === '') {
      // No args: just use toHaveBeenCalledTimes(1)
      result += `${expectPart}.toHaveBeenCalledTimes(1)`
    } else {
      // Get the indentation of the current line
      const lineStart = content.lastIndexOf('\n', match.index) + 1
      const indent = content.slice(lineStart, match.index).match(/^(\s*)/)?.[1] || ''
      result += `${expectPart}.toHaveBeenCalledTimes(1)\n${indent}${expectPart}.toHaveBeenCalledWith(${args})`
    }

    lastIndex = argsEnd + 1 // skip closing paren
  }

  result += content.slice(lastIndex)
  return result
}

function findMatchingParen(str: string, openPos: number): number {
  let depth = 1
  let i = openPos + 1
  while (i < str.length && depth > 0) {
    if (str[i] === '(') {
      depth++
    } else if (str[i] === ')') {
      depth--
    }
    i++
  }
  return depth === 0 ? i - 1 : -1
}
