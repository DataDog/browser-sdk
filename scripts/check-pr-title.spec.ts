import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isValidPrTitle } from './check-pr-title.ts'

describe('isValidPrTitle', () => {
  it('accepts titles starting with an allowed emoji', () => {
    assert.equal(isValidPrTitle('✨ Add new feature'), true)
    assert.equal(isValidPrTitle('🐛 Fix bug'), true)
    assert.equal(isValidPrTitle('👷 Update CI'), true)
    assert.equal(isValidPrTitle('♻️ Refactor module'), true)
  })

  it('accepts the performance emoji with or without the variation selector', () => {
    assert.equal(isValidPrTitle('⚡️ Speed up'), true)
    assert.equal(isValidPrTitle('⚡ Speed up'), true)
  })

  it('accepts version bump titles like v7.2.0', () => {
    assert.equal(isValidPrTitle('v7.2.0'), true)
    assert.equal(isValidPrTitle('v1.0.0'), true)
    assert.equal(isValidPrTitle('v10.12.34'), true)
  })

  it('rejects titles without any allowed emoji prefix', () => {
    assert.equal(isValidPrTitle('Add new feature'), false)
    assert.equal(isValidPrTitle('feat: add thing'), false)
    assert.equal(isValidPrTitle(''), false)
  })

  it('rejects titles where the emoji is not at the start', () => {
    assert.equal(isValidPrTitle('Fix ✨ thing'), false)
  })

  it('rejects emojis that are not in the allowed list', () => {
    assert.equal(isValidPrTitle('🚀 Launch'), false)
    assert.equal(isValidPrTitle('📦 Package'), false)
  })
})
