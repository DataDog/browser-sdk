import { display } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { initializeProbe, getProbes, addProbe, removeProbe, checkGlobalSnapshotBudget, clearProbes } from './probes'
import type { Probe } from './probes'

interface TemplateWithCache {
  createFunction: (params: string[]) => (...args: any[]) => any
  clearCache?: () => void
}

describe('probes', () => {
  beforeEach(() => {
    clearProbes()
  })

  afterEach(() => {
    registerCleanupTask(() => clearProbes())
  })

  describe('addProbe and getProbes', () => {
    it('should add and retrieve a probe', () => {
      const probe: Probe = {
        id: 'test-probe-1',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'test.js', methodName: 'testMethod' },
        template: 'Test message',
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'ENTRY',
      }

      addProbe(probe)
      const retrieved = getProbes('test.js;testMethod')

      expect(retrieved).toEqual([
        jasmine.objectContaining({
          id: 'test-probe-1',
          templateRequiresEvaluation: false,
        }),
      ])
    })

    it('should return undefined for non-existent probe', () => {
      const retrieved = getProbes('non-existent')
      expect(retrieved).toBeUndefined()
    })
  })

  describe('removeProbe', () => {
    it('should remove a probe', () => {
      const probe: Probe = {
        id: 'test-probe-1',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'testMethod' },
        template: 'Test',
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'ENTRY',
      }

      addProbe(probe)
      expect(getProbes('TestClass;testMethod')).toBeDefined()

      removeProbe('test-probe-1')
      expect(getProbes('TestClass;testMethod')).toBeUndefined()
    })

    it('should clear function cache when removing probe with dynamic template', () => {
      const probe: Probe = {
        id: 'test-probe-1',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'cacheTest' },
        template: '',
        segments: [{ dsl: 'x', json: { ref: 'x' } }],
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'ENTRY',
      }

      addProbe(probe)
      const retrieved = getProbes('TestClass;cacheTest')
      const template = retrieved![0].template as TemplateWithCache

      // Create some cached functions
      template.createFunction(['x', 'y'])
      template.createFunction(['x', 'z'])

      // Spy on clearCache method
      const clearCacheSpy = jasmine.createSpy('clearCache')
      template.clearCache = clearCacheSpy

      removeProbe('test-probe-1')

      // Verify clearCache was called
      expect(clearCacheSpy).toHaveBeenCalled()
    })

    it('should handle removing probe with static template without errors', () => {
      const probe: Probe = {
        id: 'test-probe-1',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'staticTest' },
        template: 'Static message',
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'ENTRY',
      }

      addProbe(probe)

      // Should not throw when removing probe with static template (no clearCache method)
      expect(() => removeProbe('test-probe-1')).not.toThrow()
    })
  })

  describe('initializeProbe', () => {
    it('should initialize probe with static template', () => {
      const probe: Probe = {
        id: 'test-probe-1',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'initStatic' },
        template: 'Static message',
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'ENTRY',
      }

      initializeProbe(probe)

      expect(probe).toEqual(
        jasmine.objectContaining({
          templateRequiresEvaluation: false,
          template: 'Static message',
          msBetweenSampling: jasmine.any(Number),
          lastCaptureMs: -Infinity,
        })
      )
    })

    it('should initialize probe with dynamic template', () => {
      const probe: Probe = {
        id: 'test-probe-1',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'initDynamic' },
        template: '',
        segments: [{ str: 'Value: ' }, { dsl: 'x', json: { ref: 'x' } }],
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'ENTRY',
      }

      initializeProbe(probe)

      expect(probe).toEqual(
        jasmine.objectContaining({
          templateRequiresEvaluation: true,
          template: {
            createFunction: jasmine.any(Function),
            clearCache: jasmine.any(Function),
          },
        })
      )
      expect(probe.segments).toBeUndefined() // Should be deleted after initialization
    })

    it('should compile condition when present', () => {
      const probe: Probe = {
        id: 'test-probe-1',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'conditionCompile' },
        when: {
          dsl: 'x > 5',
          json: { gt: [{ ref: 'x' }, 5] },
        },
        template: 'Message',
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'EXIT',
      }

      initializeProbe(probe)

      expect(probe.condition).toEqual(jasmine.any(String))
    })

    it('should handle condition compilation errors', () => {
      const displayErrorSpy = spyOn(display, 'error')
      const probe: Probe = {
        id: 'test-probe-1',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'conditionError' },
        when: {
          dsl: 'invalid',
          json: { invalidOp: 'bad' } as any,
        },
        template: 'Message',
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'EXIT',
      }

      initializeProbe(probe)

      expect(displayErrorSpy).toHaveBeenCalledWith(
        jasmine.stringContaining('Cannot compile condition'),
        jasmine.any(Error)
      )
    })

    it('should calculate msBetweenSampling for snapshot probes', () => {
      const probe: Probe = {
        id: 'test-probe-1',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'samplingCalc' },
        template: 'Message',
        captureSnapshot: true,
        capture: {},
        sampling: { snapshotsPerSecond: 10 },
        evaluateAt: 'ENTRY',
      }

      initializeProbe(probe)

      expect(probe.msBetweenSampling).toBe(100) // 1000ms / 10 = 100ms
    })

    it('should use default sampling rate for snapshot probes without explicit rate', () => {
      const probe: Probe = {
        id: 'test-probe-1',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'samplingDefault' },
        template: 'Message',
        captureSnapshot: true,
        capture: {},
        sampling: {},
        evaluateAt: 'ENTRY',
      }

      initializeProbe(probe)

      expect(probe.msBetweenSampling).toBe(1000) // 1 snapshot per second by default
    })

    it('should use high default sampling rate for non-snapshot probes', () => {
      const probe: Probe = {
        id: 'test-probe-1',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'samplingHigh' },
        template: 'Message',
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'ENTRY',
      }

      initializeProbe(probe)

      expect(probe.msBetweenSampling).toBeLessThan(1) // 5000 per second = 0.2ms
    })

    it('should cache compiled functions by context keys', () => {
      const probe: Probe = {
        id: 'test-probe-1',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'cacheKeys' },
        template: '',
        segments: [{ dsl: 'x', json: { ref: 'x' } }],
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'ENTRY',
      }

      initializeProbe(probe)

      const template = probe.template as TemplateWithCache
      const fn1 = template.createFunction(['x', 'y'])
      const fn2 = template.createFunction(['x', 'y'])

      // Should return the same cached function
      expect(fn1).toBe(fn2)

      const fn3 = template.createFunction(['x', 'z'])
      // Different keys should create different function
      expect(fn1).not.toBe(fn3)
    })
  })

  describe('clearProbes', () => {
    it('should clear all probes', () => {
      const probe1: Probe = {
        id: 'test-probe-1',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'clear1' },
        template: 'Test 1',
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'ENTRY',
      }

      const probe2: Probe = {
        id: 'test-probe-2',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'clear2' },
        template: 'Test 2',
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'ENTRY',
      }

      addProbe(probe1)
      addProbe(probe2)

      clearProbes()

      expect(getProbes('TestClass;clear1')).toBeUndefined()
      expect(getProbes('TestClass;clear2')).toBeUndefined()
    })

    it('should clear function caches for all probes with dynamic templates', () => {
      const probe1: Probe = {
        id: 'test-probe-1',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'clearCache1' },
        template: '',
        segments: [{ dsl: 'x', json: { ref: 'x' } }],
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'ENTRY',
      }

      const probe2: Probe = {
        id: 'test-probe-2',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'clearCache2' },
        template: '',
        segments: [{ dsl: 'y', json: { ref: 'y' } }],
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'ENTRY',
      }

      const probe3: Probe = {
        id: 'test-probe-3',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'clearCache3' },
        template: 'Static message',
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'ENTRY',
      }

      addProbe(probe1)
      addProbe(probe2)
      addProbe(probe3)

      const template1 = getProbes('TestClass;clearCache1')![0].template as TemplateWithCache
      const template2 = getProbes('TestClass;clearCache2')![0].template as TemplateWithCache

      // Create some cached functions
      template1.createFunction(['x'])
      template2.createFunction(['y'])

      // Spy on clearCache methods
      const clearCache1Spy = jasmine.createSpy('clearCache1')
      const clearCache2Spy = jasmine.createSpy('clearCache2')
      template1.clearCache = clearCache1Spy
      template2.clearCache = clearCache2Spy

      clearProbes()

      // Verify clearCache was called for both dynamic template probes
      expect(clearCache1Spy).toHaveBeenCalled()
      expect(clearCache2Spy).toHaveBeenCalled()
    })
  })

  describe('checkGlobalSnapshotBudget', () => {
    it('should allow non-snapshot probes without limit', () => {
      for (let i = 0; i < 100; i++) {
        expect(checkGlobalSnapshotBudget(Date.now(), false)).toBe(true)
      }
    })

    it('should allow snapshots within global budget', () => {
      const now = Date.now()
      for (let i = 0; i < 25; i++) {
        expect(checkGlobalSnapshotBudget(now + i, true)).toBe(true)
      }
    })

    it('should reject snapshots beyond global budget', () => {
      const now = Date.now()
      // Use up the budget
      for (let i = 0; i < 25; i++) {
        checkGlobalSnapshotBudget(now + i, true)
      }

      // Next one should be rejected
      expect(checkGlobalSnapshotBudget(now + 26, true)).toBe(false)
    })

    it('should reset budget after time window', () => {
      const now = Date.now()

      // Use up the budget
      for (let i = 0; i < 25; i++) {
        checkGlobalSnapshotBudget(now + i, true)
      }

      // Should be rejected
      expect(checkGlobalSnapshotBudget(now + 100, true)).toBe(false)

      // After 1 second, should allow again
      expect(checkGlobalSnapshotBudget(now + 1100, true)).toBe(true)
    })

    it('should track budget correctly across time windows', () => {
      const baseTime = Date.now()

      // First window - use 20 snapshots
      for (let i = 0; i < 20; i++) {
        expect(checkGlobalSnapshotBudget(baseTime + i, true)).toBe(true)
      }

      // Still within same window - 5 more should work
      for (let i = 0; i < 5; i++) {
        expect(checkGlobalSnapshotBudget(baseTime + 500 + i, true)).toBe(true)
      }

      // Now at limit
      expect(checkGlobalSnapshotBudget(baseTime + 600, true)).toBe(false)

      // New window
      expect(checkGlobalSnapshotBudget(baseTime + 1500, true)).toBe(true)
    })
  })
})
