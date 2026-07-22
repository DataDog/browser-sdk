import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { createContext, runInContext } from 'node:vm'

const polyfillsSource = readFileSync(new URL('../../../test/unit/vitestBrowserPolyfills.js', import.meta.url), 'utf8')

describe('Vitest browser polyfills', () => {
  it('installs the APIs needed by the Vitest client in legacy browsers', () => {
    const crypto = {
      getRandomValues(bytes: Uint8Array) {
        for (let index = 0; index < bytes.length; index += 1) {
          bytes[index] = index
        }
        return bytes
      },
    }
    const context = createContext({ crypto })

    runInContext(
      `
        delete Object.hasOwn
        delete Array.prototype.at
        delete Array.prototype.findLastIndex
      `,
      context
    )
    runInContext(polyfillsSource, context)

    assert.equal(runInContext("Object.hasOwn({ value: true }, 'value')", context), true)
    assert.equal(runInContext("Object.hasOwn(Object.create({ inherited: true }), 'inherited')", context), false)
    assert.equal(runInContext("['first', 'last'].at(-1)", context), 'last')
    assert.equal(runInContext('[1, 2, 3, 4].findLastIndex((value) => value % 2 === 1)', context), 2)
    assert.equal(runInContext('crypto.randomUUID()', context), '00010203-0405-4607-8809-0a0b0c0d0e0f')
    assert.equal(runInContext("Object.prototype.propertyIsEnumerable.call(Object, 'hasOwn')", context), false)
    assert.equal(runInContext("Array.prototype.propertyIsEnumerable('at')", context), false)
    assert.equal(runInContext("Array.prototype.propertyIsEnumerable('findLastIndex')", context), false)
  })
})
