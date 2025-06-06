import { StandardResolutionReasons, type EvaluationContext, type Logger } from '@openfeature/core'
import { DatadogProvider } from './provider'

describe('DatadogProvider', () => {
  let provider: DatadogProvider
  let mockLogger: Logger
  let mockContext: EvaluationContext

  beforeEach(() => {
    provider = new DatadogProvider({
      applicationId: 'xxx',
      clientToken: 'xxx',
      baseUrl: 'http://localhost:8000',
    })
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
      expect(provider.metadata).toEqual({
        name: 'datadog',
      })
    })

    it('should run on client', () => {
      expect(provider.runsOn).toBe('client')
    })
  })

  describe('resolveBooleanEvaluation', () => {
    it('should return default value with DEFAULT reason', () => {
      const result = provider.resolveBooleanEvaluation('test-flag', true, mockContext, mockLogger)
      expect(result).toEqual({
        value: true,
        reason: StandardResolutionReasons.DEFAULT,
      })
    })
  })

  describe('resolveStringEvaluation', () => {
    it('should return default value with DEFAULT reason', () => {
      const result = provider.resolveStringEvaluation('test-flag', 'default', mockContext, mockLogger)
      expect(result).toEqual({
        value: 'default',
        reason: StandardResolutionReasons.DEFAULT,
      })
    })
  })

  describe('resolveNumberEvaluation', () => {
    it('should return default value with DEFAULT reason', () => {
      const result = provider.resolveNumberEvaluation('test-flag', 42, mockContext, mockLogger)
      expect(result).toEqual({
        value: 42,
        reason: StandardResolutionReasons.DEFAULT,
      })
    })
  })

  describe('resolveObjectEvaluation', () => {
    it('should return default value with DEFAULT reason', () => {
      const defaultValue = { key: 'value' }
      const result = provider.resolveObjectEvaluation('test-flag', defaultValue, mockContext, mockLogger)
      expect(result).toEqual({
        value: defaultValue,
        reason: StandardResolutionReasons.DEFAULT,
      })
    })
  })
})
