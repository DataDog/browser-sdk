import { StandardResolutionReasons, type EvaluationContext, type Logger } from '@openfeature/core'
import mockPrecomputedConfig from '../../test/data/precomputed-v1-deobfuscated.json'
import { offlinePrecomputedInit } from '../precomputeClient'
import { DatadogProvider } from './provider'

describe('DatadogProvider', () => {
  let mockLogger: Logger
  let mockContext: EvaluationContext

  beforeEach(() => {
    mockLogger = {
      debug: jasmine.createSpy('debug'),
      info: jasmine.createSpy('info'),
      warn: jasmine.createSpy('warn'),
      error: jasmine.createSpy('error'),
    }
    mockContext = {}
  })

  describe('metadata', () => {
    it('should have correct metadata', () => {
      const provider = new DatadogProvider()
      expect(provider.metadata).toEqual({
        name: 'datadog',
      })
    })

    it('should run on client', () => {
      const provider = new DatadogProvider()
      expect(provider.runsOn).toBe('client')
    })
  })

  describe('without precompute client', () => {
    let provider: DatadogProvider

    beforeEach(() => {
      provider = new DatadogProvider()
    })

    it('should return default boolean with DEFAULT reason', () => {
      const result = provider.resolveBooleanEvaluation('test-flag', true, mockContext, mockLogger)
      expect(result).toEqual({ value: true, reason: StandardResolutionReasons.DEFAULT })
    })

    it('should return default string with DEFAULT reason', () => {
      const result = provider.resolveStringEvaluation('test-flag', 'default', mockContext, mockLogger)
      expect(result).toEqual({ value: 'default', reason: StandardResolutionReasons.DEFAULT })
    })

    it('should return default number with DEFAULT reason', () => {
      const result = provider.resolveNumberEvaluation('test-flag', 42, mockContext, mockLogger)
      expect(result).toEqual({ value: 42, reason: StandardResolutionReasons.DEFAULT })
    })

    it('should return default object with DEFAULT reason', () => {
      const defaultValue = { key: 'value' }
      const result = provider.resolveObjectEvaluation('test-flag', defaultValue, mockContext, mockLogger)
      expect(result).toEqual({ value: defaultValue, reason: StandardResolutionReasons.DEFAULT })
    })
  })

  describe('with precompute client', () => {
    let provider: DatadogProvider

    beforeEach(() => {
      const client = offlinePrecomputedInit({ precomputedConfiguration: JSON.stringify(mockPrecomputedConfig) })
      provider = new DatadogProvider(client!)
    })

    it('should resolve boolean flag with STATIC reason', () => {
      const result = provider.resolveBooleanEvaluation('boolean-flag', false, mockContext, mockLogger)
      expect(result).toEqual({ value: true, reason: StandardResolutionReasons.STATIC })
    })

    it('should resolve string flag with STATIC reason', () => {
      const result = provider.resolveStringEvaluation('string-flag', 'default', mockContext, mockLogger)
      expect(result).toEqual({ value: 'red', reason: StandardResolutionReasons.STATIC })
    })

    it('should resolve number flag with STATIC reason', () => {
      const result = provider.resolveNumberEvaluation('integer-flag', 0, mockContext, mockLogger)
      expect(result).toEqual({ value: 42, reason: StandardResolutionReasons.STATIC })
    })

    it('should resolve object flag with STATIC reason', () => {
      const result = provider.resolveObjectEvaluation('json-flag', {}, mockContext, mockLogger)
      expect(result).toEqual({ value: { key: 'value', prop: 123 }, reason: StandardResolutionReasons.STATIC })
    })

    it('should return DEFAULT reason for non-existent flag', () => {
      const result = provider.resolveBooleanEvaluation('non-existent', false, mockContext, mockLogger)
      expect(result).toEqual({ value: false, reason: StandardResolutionReasons.DEFAULT })
    })
  })
})
