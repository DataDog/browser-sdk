import type { ErrorWithCause } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import {
  initializeProbe,
  getProbes,
  addProbe,
  removeProbe,
  checkGlobalSnapshotBudget,
  clearProbes,
  resetProbeBudgetConfiguration,
} from './probes'
import type { Probe } from './probes'

describe('probes', () => {
  beforeEach(() => {
    clearProbes()
    resetProbeBudgetConfiguration()

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
        }),
      ])
      expect(retrieved![0].evaluateTemplate).toBeUndefined()
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

      // Should not throw when removing probe with static template
      expect(() => removeProbe('test-probe-1')).not.toThrow()
    })

    it('should remove the exact initialized probe instance when passed a probe', () => {
      const probe: Probe = {
        id: 'test-probe-1',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'instanceTest' },
        template: 'Static message',
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'ENTRY',
      }
      addProbe(probe)

      const initializedProbe = getProbes('TestClass;instanceTest')![0]
      removeProbe(initializedProbe)

      expect(getProbes('TestClass;instanceTest')).toBeUndefined()
    })

    it('should not remove a replacement probe when passed a stale probe instance', () => {
      const staleProbe: Probe = {
        id: 'test-probe-1',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'replacementTest' },
        template: 'Stale message',
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'ENTRY',
      }
      addProbe(staleProbe)

      const staleInitializedProbe = getProbes('TestClass;replacementTest')![0]
      removeProbe('test-probe-1')
      addProbe({
        id: 'test-probe-1',
        version: 1,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'replacementTest' },
        template: 'Replacement message',
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'ENTRY',
      })

      expect(() => removeProbe(staleInitializedProbe)).not.toThrow()
      expect(getProbes('TestClass;replacementTest')).toEqual([jasmine.objectContaining({ version: 1 })])
    })

    it('should not throw when passed a stale probe instance that is no longer registered', () => {
      const probe: Probe = {
        id: 'test-probe-1',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'staleTest' },
        template: 'Static message',
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'ENTRY',
      }
      addProbe(probe)

      const initializedProbe = getProbes('TestClass;staleTest')![0]
      removeProbe('test-probe-1')

      expect(() => removeProbe(initializedProbe)).not.toThrow()
      expect(getProbes('TestClass;staleTest')).toBeUndefined()
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
          template: 'Static message',
          msBetweenSampling: jasmine.any(Number),
          lastCaptureMs: -Infinity,
        })
      )
      expect(probe.evaluateTemplate).toBeUndefined()
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
          template: '',
          evaluateTemplate: jasmine.any(Function),
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

      expect(probe.condition).toEqual(
        jasmine.objectContaining({
          evaluate: jasmine.any(Function),
        })
      )
    })

    it('should not add probe when condition compilation fails', () => {
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

      let error: unknown
      try {
        addProbe(probe)
      } catch (err) {
        error = err
      }

      expect(error).toEqual(jasmine.any(Error))
      expect((error as Error).message).toContain('Cannot compile condition')
      expect((error as ErrorWithCause).cause).toEqual(jasmine.any(TypeError))
      expect(getProbes('TestClass;conditionError')).toBeUndefined()
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

    it('should evaluate dynamic template with cached functions', () => {
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

      expect(probe.evaluateTemplate!({ x: 1 })).toEqual(['1'])
      expect(probe.evaluateTemplate!({ x: 2 })).toEqual(['2'])
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
