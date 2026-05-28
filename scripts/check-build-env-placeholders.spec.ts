import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { findUnreplacedPlaceholders } from './check-build-env-placeholders.ts'

describe('findUnreplacedPlaceholders', () => {
  let tmpDir: string

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-build-env-'))
  })

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns empty when no placeholders are present', () => {
    const root = path.join(tmpDir, 'clean')
    writeFile(path.join(root, 'pkg-a/cjs/index.js'), 'export const version = "1.2.3"')
    writeFile(path.join(root, 'pkg-a/esm/index.js'), 'export const version = "1.2.3"')

    assert.deepEqual(findUnreplacedPlaceholders(root), [])
  })

  it('detects unreplaced placeholders and deduplicates within a file', () => {
    const root = path.join(tmpDir, 'dirty')
    const file = path.join(root, 'pkg-a/cjs/init.js')
    writeFile(file, 'const v = "__BUILD_ENV__SDK_VERSION__"; const v2 = "__BUILD_ENV__SDK_VERSION__"')

    const hits = findUnreplacedPlaceholders(root)
    assert.equal(hits.length, 1)
    assert.equal(hits[0].file, file)
    assert.deepEqual(hits[0].placeholders, ['__BUILD_ENV__SDK_VERSION__'])
  })

  it('scans cjs, esm and bundle output directories', () => {
    const root = path.join(tmpDir, 'all-dirs')
    writeFile(path.join(root, 'pkg-a/cjs/a.js'), '__BUILD_ENV__SDK_VERSION__')
    writeFile(path.join(root, 'pkg-a/esm/b.js'), '__BUILD_ENV__SDK_SETUP__')
    writeFile(path.join(root, 'pkg-a/bundle/c.js'), '__BUILD_ENV__WORKER_STRING__')

    const files = findUnreplacedPlaceholders(root)
      .map((hit) => path.relative(root, hit.file))
      .sort()
    assert.deepEqual(files, [
      path.join('pkg-a', 'bundle', 'c.js'),
      path.join('pkg-a', 'cjs', 'a.js'),
      path.join('pkg-a', 'esm', 'b.js'),
    ])
  })

  it('ignores source files outside cjs/esm/bundle directories', () => {
    const root = path.join(tmpDir, 'src-only')
    writeFile(path.join(root, 'pkg-a/src/init.ts'), 'const v = "__BUILD_ENV__SDK_VERSION__"')

    assert.deepEqual(findUnreplacedPlaceholders(root), [])
  })
})

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}
