import configurationWire from '../test/data/precomputed-v1-wire.json'

import { configurationFromString } from './configuration'
import { evaluate } from './evaluation'

const configuration = configurationFromString(
  // Adding stringify because import has parsed JSON
  JSON.stringify(configurationWire)
)

describe('evaluate', () => {
  it('returns default for missing configuration', () => {
    const result = evaluate({}, 'boolean', 'boolean-flag', true, {})
    expect(result).toEqual({
      value: true,
      reason: 'DEFAULT',
    })
  })

  it('returns default for unknown flag', () => {
    const result = evaluate(configuration, 'string', 'unknown-flag', 'default', {})
    expect(result).toEqual({
      value: 'default',
      reason: 'ERROR',
      errorCode: 'FLAG_NOT_FOUND' as any,
    })
  })

  it('resolves boolean flag', () => {
    const result = evaluate(configuration, 'boolean', 'boolean-flag', true, {})
    expect(result).toEqual({
      value: true,
      variant: 'variation-124',
      reason: 'TARGETING_MATCH',
    })
  })

  it('resolves string flag', () => {
    const result = evaluate(configuration, 'string', 'string-flag', 'default', {})
    expect(result).toEqual({
      value: 'red',
      variant: 'variation-123',
      reason: 'TARGETING_MATCH',
    })
  })

  it('resolves object flag', () => {
    const result = evaluate<any>(configuration, 'object', 'json-flag', { hello: 'world' }, {})
    expect(result).toEqual({
      value: { key: 'value', prop: 123 },
      variant: 'variation-127',
      reason: 'TARGETING_MATCH',
    })
  })
})
