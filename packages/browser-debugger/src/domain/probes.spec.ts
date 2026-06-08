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
import { createProbe } from './probe.specHelper'

const DEFAULT_PROBE_FUNCTION_ID = 'test.js;testMethod'

describe('probes', () => {
  beforeEach(() => {
    clearProbes()
    resetProbeBudgetConfiguration()

    registerCleanupTask(() => clearProbes())
  })

  describe('addProbe and getProbes', () => {
    it('should add and retrieve a probe', () => {
      const probe = createProbe()
      addProbe(probe)
      const retrieved = getProbes(DEFAULT_PROBE_FUNCTION_ID)

      expect(retrieved).toEqual([
        jasmine.objectContaining({
          id: probe.id,
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
      const probe = createProbe()
      addProbe(probe)
      expect(getProbes(DEFAULT_PROBE_FUNCTION_ID)).toBeDefined()

      removeProbe(probe.id)
      expect(getProbes(DEFAULT_PROBE_FUNCTION_ID)).toBeUndefined()
    })

    it('should handle removing probe with static template without errors', () => {
      const probe = createProbe()
      addProbe(probe)

      // Should not throw when removing probe with static template
      expect(() => removeProbe(probe.id)).not.toThrow()
    })

    it('should remove the exact initialized probe instance when passed a probe', () => {
      addProbe(createProbe())

      const initializedProbe = getProbes(DEFAULT_PROBE_FUNCTION_ID)![0]
      removeProbe(initializedProbe)

      expect(getProbes(DEFAULT_PROBE_FUNCTION_ID)).toBeUndefined()
    })

    it('should not remove a replacement probe when passed a stale probe instance', () => {
      const probe = createProbe()
      addProbe(probe)

      const staleInitializedProbe = getProbes(DEFAULT_PROBE_FUNCTION_ID)![0]
      removeProbe(probe.id)
      addProbe(createProbe({ version: 1 }))

      expect(() => removeProbe(staleInitializedProbe)).not.toThrow()
      expect(getProbes(DEFAULT_PROBE_FUNCTION_ID)).toEqual([jasmine.objectContaining({ version: 1 })])
    })

    it('should not throw when passed a stale probe instance that is no longer registered', () => {
      const probe = createProbe()
      addProbe(probe)

      const initializedProbe = getProbes(DEFAULT_PROBE_FUNCTION_ID)![0]
      removeProbe(probe.id)

      expect(() => removeProbe(initializedProbe)).not.toThrow()
      expect(getProbes(DEFAULT_PROBE_FUNCTION_ID)).toBeUndefined()
    })
  })

  describe('initializeProbe', () => {
    it('should initialize probe with static template', () => {
      const probe = createProbe()

      initializeProbe(probe)

      expect(probe).toEqual(
        jasmine.objectContaining({
          template: 'Test message',
          msBetweenSampling: jasmine.any(Number),
          lastCaptureMs: -Infinity,
        })
      )
      expect(probe.evaluateTemplate).toBeUndefined()
    })

    it('should initialize probe with dynamic template', () => {
      const probe = createProbe({
        template: 'Value: {x}',
        segments: [{ str: 'Value: ' }, { dsl: 'x', json: { ref: 'x' } }],
      })

      initializeProbe(probe)

      expect(probe).toEqual(
        jasmine.objectContaining({
          template: 'Value: {x}',
          evaluateTemplate: jasmine.any(Function),
        })
      )
      expect(probe.segments).toBeUndefined() // Should be deleted after initialization
    })

    it('should compile condition when present', () => {
      const probe = createProbe({
        when: {
          dsl: 'x > 5',
          json: { gt: [{ ref: 'x' }, 5] },
        },
      })

      initializeProbe(probe)

      expect(probe.condition).toEqual(
        jasmine.objectContaining({
          evaluate: jasmine.any(Function),
        })
      )
    })

    it('should not add probe when condition compilation fails', () => {
      let error: unknown
      try {
        addProbe(
          createProbe({
            when: {
              dsl: 'invalid',
              json: { invalidOp: 'bad' } as any,
            },
          })
        )
      } catch (err) {
        error = err
      }

      expect(error).toEqual(jasmine.any(Error))
      expect((error as Error).message).toContain('Cannot compile condition')
      expect((error as ErrorWithCause).cause).toEqual(jasmine.any(TypeError))
      expect(getProbes(DEFAULT_PROBE_FUNCTION_ID)).toBeUndefined()
    })

    it('should calculate msBetweenSampling for snapshot probes', () => {
      const probe = createProbe({
        sampling: { snapshotsPerSecond: 10 },
      })

      initializeProbe(probe)

      expect(probe.msBetweenSampling).toBe(100) // 1000ms / 10 = 100ms
    })

    it('should use default sampling rate for snapshot probes without explicit rate', () => {
      const probe = createProbe({
        sampling: undefined,
      })

      initializeProbe(probe)

      expect(probe.msBetweenSampling).toBe(1000) // 1 snapshot per second by default
    })

    it('should use high default sampling rate for non-snapshot probes', () => {
      const probe = createProbe({
        captureSnapshot: false,
        sampling: undefined,
      })

      initializeProbe(probe)

      expect(probe.msBetweenSampling).toBeLessThan(1) // 5000 per second = 0.2ms
    })

    it('should evaluate dynamic template with cached functions', () => {
      const probe = createProbe({
        template: '{x}',
        segments: [{ dsl: 'x', json: { ref: 'x' } }],
      })

      initializeProbe(probe)

      expect(probe.evaluateTemplate!({ x: 1 })).toEqual(['1'])
      expect(probe.evaluateTemplate!({ x: 2 })).toEqual(['2'])
    })
  })

  describe('clearProbes', () => {
    it('should clear all probes', () => {
      addProbe(createProbe({ where: { typeName: 'test.js', methodName: 'clear1' } }))
      addProbe(createProbe({ where: { typeName: 'test.js', methodName: 'clear2' } }))

      clearProbes()

      expect(getProbes('test.js;clear1')).toBeUndefined()
      expect(getProbes('test.js;clear2')).toBeUndefined()
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
