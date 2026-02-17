import { beforeEach, describe, expect, it } from 'vitest'
import { isAdoptedStyleSheetsSupported } from '@datadog/browser-core/test'
import { createSerializationTransactionForTesting } from '../test/serialization.specHelper'
import { serializeStyleSheets } from './serializeStyleSheets'
import type { SerializationStats } from './serializationStats'
import { createSerializationStats } from './serializationStats'
import type { SerializationTransaction } from './serializationTransaction'

describe('serializeStyleSheets', () => {
  let stats: SerializationStats
  let transaction: SerializationTransaction

  beforeEach((ctx) => {
    if (!isAdoptedStyleSheetsSupported()) {
      ctx.skip()
      return
    }
    stats = createSerializationStats()
    transaction = createSerializationTransactionForTesting({ stats })
  })

  it('should return undefined if no stylesheets', () => {
    expect(serializeStyleSheets(undefined, transaction)).toBe(undefined)
    expect(stats.cssText).toEqual({ count: 0, max: 0, sum: 0 })
    expect(serializeStyleSheets([], transaction)).toBe(undefined)
    expect(stats.cssText).toEqual({ count: 0, max: 0, sum: 0 })
  })

  it('should return serialized stylesheet', () => {
    const disabledStylesheet = new CSSStyleSheet({ disabled: true })
    disabledStylesheet.insertRule('div { width: 100%; }')
    const printStylesheet = new CSSStyleSheet({ disabled: false, media: 'print' })
    printStylesheet.insertRule('a { color: red; }')

    expect(serializeStyleSheets([disabledStylesheet, printStylesheet], transaction)).toEqual([
      { cssRules: ['div { width: 100%; }'], disabled: true, media: undefined },
      { cssRules: ['a { color: red; }'], disabled: undefined, media: ['print'] },
    ])
    expect(stats.cssText).toEqual({ count: 2, max: 20, sum: 37 })
  })
})
