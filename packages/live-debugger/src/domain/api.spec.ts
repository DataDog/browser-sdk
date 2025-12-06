import { registerCleanupTask } from '@datadog/browser-core/test'
import { onEntry, onReturn, onThrow } from './api'
import { addProbe, getProbes, clearProbes } from './probes'
import type { Probe } from './probes'

describe('api', () => {
  let mockRumLiveDebug: jasmine.Spy
  let mockRumGetInternalContext: jasmine.Spy

  beforeEach(() => {
    clearProbes()

    // Mock DD_RUM global
    mockRumLiveDebug = jasmine.createSpy('liveDebug')
    mockRumGetInternalContext = jasmine.createSpy('getInternalContext').and.returnValue({
      session_id: 'test-session',
      view: { id: 'test-view' },
      user_action: { id: 'test-action' },
    })
    ;(window as any).DD_RUM = {
      version: '1.0.0',
      liveDebug: mockRumLiveDebug,
      getInternalContext: mockRumGetInternalContext,
    }

    registerCleanupTask(() => {
      delete (window as any).DD_RUM
    })
  })

  afterEach(() => {
    clearProbes()
  })

  describe('onEntry and onReturn', () => {
    it('should capture this inside arguments.fields', () => {
      const probe: Probe = {
        id: 'test-probe',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'testMethod' },
        template: 'Test message',
        captureSnapshot: true,
        capture: { maxReferenceDepth: 1 },
        sampling: { snapshotsPerSecond: 5000 },
        evaluateAt: 'ENTRY',
      }
      addProbe(probe)

      const self = { name: 'testObj' }
      const args = { a: 1, b: 2 }
      const probes = getProbes('TestClass;testMethod')!
      onEntry(probes, self, args)
      onReturn(probes, 'result', self, args, {})

      const snapshot = mockRumLiveDebug.calls.mostRecent().args[3]

      // Verify entry.arguments structure - now flat
      expect(snapshot.captures.entry.arguments).toEqual({
        a: { type: 'number', value: '1' },
        b: { type: 'number', value: '2' },
        this: {
          type: 'Object',
          fields: {
            name: { type: 'string', value: 'testObj' },
          },
        },
      })

      // Verify return.arguments structure - now flat
      expect(snapshot.captures.return.arguments).toEqual({
        a: { type: 'number', value: '1' },
        b: { type: 'number', value: '2' },
        this: {
          type: 'Object',
          fields: {
            name: { type: 'string', value: 'testObj' },
          },
        },
      })

      // Verify return.locals structure - also flat
      expect(snapshot.captures.return.locals['@return']).toEqual({
        type: 'string',
        value: 'result',
      })
    })

    it('should capture entry and return for simple probe', () => {
      const probe: Probe = {
        id: 'test-probe',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'testMethod' },
        template: 'Test message',
        captureSnapshot: true,
        capture: { maxReferenceDepth: 1 },
        sampling: { snapshotsPerSecond: 5000 },
        evaluateAt: 'ENTRY',
      }
      addProbe(probe)

      const self = { name: 'test' }
      const args = { arg1: 'value1', arg2: 42 }

      const probes = getProbes('TestClass;testMethod')!
      onEntry(probes, self, args)
      const result = onReturn(probes, 'returnValue', self, args, {})

      expect(result).toBe('returnValue')
      expect(mockRumLiveDebug).toHaveBeenCalledTimes(1)

      const call = mockRumLiveDebug.calls.mostRecent()
      expect(call.args[0]).toBe('Test message')
      expect(call.args[3]).toEqual(jasmine.objectContaining({ id: jasmine.any(String), captures: jasmine.any(Object) }))
    })

    it('should skip probe if sampling budget exceeded', () => {
      // Use a very low sampling rate to ensure budget is exceeded
      const probe: Probe = {
        id: 'test-probe',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'budgetTest' },
        template: 'Test',
        captureSnapshot: true,
        capture: { maxReferenceDepth: 1 },
        sampling: { snapshotsPerSecond: 0.5 }, // 0.5 per second = 2000ms between samples
        evaluateAt: 'ENTRY',
      }
      addProbe(probe)

      const probes = getProbes('TestClass;budgetTest')!
      // First call should work
      onEntry(probes, {}, {})
      onReturn(probes, null, {}, {}, {})
      expect(mockRumLiveDebug).toHaveBeenCalledTimes(1)

      // Second immediate call should be skipped (less than 2000ms passed)
      onEntry(probes, {}, {})
      onReturn(probes, null, {}, {}, {})

      // Still only one call because sampling budget not refreshed
      expect(mockRumLiveDebug).toHaveBeenCalledTimes(1)
    })

    it('should evaluate condition at ENTRY', () => {
      const probe: Probe = {
        id: 'test-probe',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'conditionEntry' },
        when: {
          dsl: 'x > 5',
          json: { gt: [{ ref: 'x' }, 5] },
        },
        template: 'Condition passed',
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'ENTRY',
      }
      addProbe(probe)

      let probes = getProbes('TestClass;conditionEntry')!
      // Should fire when condition passes
      onEntry(probes, {}, { x: 10 })
      onReturn(probes, null, {}, { x: 10 }, {})
      expect(mockRumLiveDebug).toHaveBeenCalledTimes(1)

      clearProbes()
      addProbe(probe)
      mockRumLiveDebug.calls.reset()

      probes = getProbes('TestClass;conditionEntry')!
      // Should not fire when condition fails
      onEntry(probes, {}, { x: 3 })
      onReturn(probes, null, {}, { x: 3 }, {})
      expect(mockRumLiveDebug).not.toHaveBeenCalled()
    })

    it('should evaluate condition at EXIT with @return', () => {
      const probe: Probe = {
        id: 'test-probe',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'conditionExit' },
        when: {
          dsl: '@return > 10',
          json: { gt: [{ ref: '@return' }, 10] },
        },
        template: 'Return value check',
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'EXIT',
      }
      addProbe(probe)

      let probes = getProbes('TestClass;conditionExit')!
      // Should fire when return value > 10
      onEntry(probes, {}, {})
      onReturn(probes, 15, {}, {}, {})
      expect(mockRumLiveDebug).toHaveBeenCalledTimes(1)

      clearProbes()
      addProbe(probe)
      mockRumLiveDebug.calls.reset()

      probes = getProbes('TestClass;conditionExit')!
      // Should not fire when return value <= 10
      onEntry(probes, {}, {})
      onReturn(probes, 5, {}, {}, {})
      expect(mockRumLiveDebug).not.toHaveBeenCalled()
    })

    // TODO: Validate that this test is actually correct
    it('should capture entry snapshot only for ENTRY evaluation with no condition', () => {
      const probe: Probe = {
        id: 'test-probe',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'entrySnapshot' },
        template: 'Test',
        captureSnapshot: true,
        capture: { maxReferenceDepth: 1 },
        sampling: {},
        evaluateAt: 'ENTRY',
      }
      addProbe(probe)

      const probes = getProbes('TestClass;entrySnapshot')!
      onEntry(probes, { name: 'obj' }, { arg: 'value' })
      onReturn(probes, 'result', { name: 'obj' }, { arg: 'value' }, { local: 'data' })

      const snapshot = mockRumLiveDebug.calls.mostRecent().args[3]
      expect(snapshot.captures).toEqual({
        entry: {
          arguments: {
            arg: { type: 'string', value: 'value' },
            this: { type: 'Object', fields: { name: { type: 'string', value: 'obj' } } },
          },
        },
        return: {
          arguments: {
            arg: { type: 'string', value: 'value' },
            this: { type: 'Object', fields: { name: { type: 'string', value: 'obj' } } },
          },
          locals: {
            local: { type: 'string', value: 'data' },
            '@return': { type: 'string', value: 'result' },
          },
        },
      })
    })

    it('should only capture return snapshot for EXIT evaluation with condition', () => {
      const probe: Probe = {
        id: 'test-probe',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'exitSnapshot' },
        when: {
          dsl: '@return === true',
          json: { eq: [{ ref: '@return' }, true] },
        },
        template: 'Test',
        captureSnapshot: true,
        capture: { maxReferenceDepth: 1 },
        sampling: {},
        evaluateAt: 'EXIT',
      }
      addProbe(probe)

      const probes = getProbes('TestClass;exitSnapshot')!
      onEntry(probes, {}, { arg: 'value' })
      onReturn(probes, true, {}, { arg: 'value' }, {})

      const snapshot = mockRumLiveDebug.calls.mostRecent().args[3]
      expect(snapshot.captures.entry).toBeUndefined()
      expect(snapshot.captures.return).toBeDefined()
    })

    it('should include duration in snapshot', () => {
      const probe: Probe = {
        id: 'test-probe',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'durationTest' },
        template: 'Test',
        captureSnapshot: true,
        capture: { maxReferenceDepth: 1 },
        sampling: {},
        evaluateAt: 'ENTRY',
      }
      addProbe(probe)

      const probes = getProbes('TestClass;durationTest')!
      onEntry(probes, {}, {})

      // Simulate some time passing
      const startTime = performance.now()
      while (performance.now() - startTime < 10) {
        // Wait
      }

      onReturn(probes, null, {}, {}, {})

      const snapshot = mockRumLiveDebug.calls.mostRecent().args[3]
      expect(snapshot.duration).toBeGreaterThan(0)
      expect(snapshot.duration).toBeGreaterThanOrEqual(10000000) // Should be in nanoseconds (>= 10ms)
    })

    it('should include RUM context in logger', () => {
      const probe: Probe = {
        id: 'test-probe',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'rumContext' },
        template: 'Test',
        segments: [{ str: 'Test' }],
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'ENTRY',
      }
      addProbe(probe)

      const probes = getProbes('TestClass;rumContext')!
      onEntry(probes, {}, {})
      onReturn(probes, null, {}, {}, {})

      const dd = mockRumLiveDebug.calls.mostRecent().args[2]
      expect(dd).toEqual({
        trace_id: 'test-session',
        span_id: 'test-action',
      })
    })
  })

  describe('onThrow', () => {
    it('should capture this inside arguments.fields for exceptions', () => {
      const probe: Probe = {
        id: 'test-probe',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'throwTest' },
        template: 'Test',
        captureSnapshot: true,
        capture: { maxReferenceDepth: 1 },
        sampling: {},
        evaluateAt: 'ENTRY',
      }
      addProbe(probe)

      const self = { name: 'testObj' }
      const args = { a: 1, b: 2 }
      const error = new Error('Test error')
      const probes = getProbes('TestClass;throwTest')!
      onEntry(probes, self, args)
      onThrow(probes, error, self, args)

      const snapshot = mockRumLiveDebug.calls.mostRecent().args[3]

      // Verify return.arguments structure - now flat
      expect(snapshot.captures.return.arguments).toEqual({
        a: { type: 'number', value: '1' },
        b: { type: 'number', value: '2' },
        this: {
          type: 'Object',
          fields: {
            name: { type: 'string', value: 'testObj' },
          },
        },
      })

      // Verify throwable is still present
      expect(snapshot.captures.return.throwable).toEqual({
        message: 'Test error',
        stacktrace: jasmine.any(Array),
      })
      for (const frame of snapshot.captures.return.throwable.stacktrace) {
        expect(frame).toEqual(
          jasmine.objectContaining({
            fileName: jasmine.any(String),
            function: jasmine.any(String),
            lineNumber: jasmine.any(Number),
            columnNumber: jasmine.any(Number),
          })
        )
      }
    })

    it('should capture exception details', () => {
      const probe: Probe = {
        id: 'test-probe',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'throwTest' },
        template: 'Test',
        captureSnapshot: true,
        capture: { maxReferenceDepth: 1 },
        sampling: {},
        evaluateAt: 'ENTRY',
      }
      addProbe(probe)

      const probes = getProbes('TestClass;throwTest')!
      const error = new Error('Test error')
      onEntry(probes, {}, { arg: 'value' })
      onThrow(probes, error, {}, { arg: 'value' })

      expect(mockRumLiveDebug).toHaveBeenCalledTimes(1)

      const snapshot = mockRumLiveDebug.calls.mostRecent().args[3]
      expect(snapshot.captures.return.throwable).toEqual({
        message: 'Test error',
        stacktrace: jasmine.any(Array),
      })
      for (const frame of snapshot.captures.return.throwable.stacktrace) {
        expect(frame).toEqual(
          jasmine.objectContaining({
            fileName: jasmine.any(String),
            function: jasmine.any(String),
            lineNumber: jasmine.any(Number),
            columnNumber: jasmine.any(Number),
          })
        )
      }
    })

    it('should evaluate EXIT condition with @exception', () => {
      const probe: Probe = {
        id: 'test-probe',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'exceptionCondition' },
        when: {
          dsl: '@exception.message',
          json: { getmember: [{ ref: '@exception' }, 'message'] },
        },
        template: 'Exception captured',
        captureSnapshot: false,
        capture: { maxReferenceDepth: 1 },
        sampling: {},
        evaluateAt: 'EXIT',
      }
      addProbe(probe)

      const probes = getProbes('TestClass;exceptionCondition')!
      const error = new Error('Test error')
      onEntry(probes, {}, {})
      onThrow(probes, error, {}, {})

      expect(mockRumLiveDebug).toHaveBeenCalledTimes(1)
    })

    it('should handle onThrow without preceding onEntry', () => {
      const probe: Probe = {
        id: 'test-probe',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'throwWithoutEntry' },
        template: 'Test',
        captureSnapshot: true,
        capture: { maxReferenceDepth: 1 },
        sampling: {},
        evaluateAt: 'ENTRY',
      }
      addProbe(probe)

      const probes = getProbes('TestClass;throwWithoutEntry')!
      const error = new Error('Test error')
      onEntry(probes, {}, {})
      onThrow(probes, error, {}, {})

      // Should work without errors
      expect(mockRumLiveDebug).toHaveBeenCalledTimes(1)
    })
  })

  describe('global snapshot budget', () => {
    it('should respect global snapshot rate limit', () => {
      const probes: Probe[] = []
      for (let i = 0; i < 30; i++) {
        const probe: Probe = {
          id: `probe-${i}`,
          version: 0,
          type: 'LOG_PROBE',
          where: { typeName: 'TestClass', methodName: `method${i}` },
          template: 'Test',
          captureSnapshot: true,
          capture: {},
          sampling: { snapshotsPerSecond: 5000 },
          evaluateAt: 'ENTRY',
        }
        addProbe(probe)
        probes.push(probe)
      }

      // Try to fire 30 probes rapidly
      for (let i = 0; i < 30; i++) {
        const probes = getProbes(`TestClass;method${i}`)!
        onEntry(probes, {}, {})
        onReturn(probes, null, {}, {}, {})
      }

      // Should only get 25 calls (global limit)
      expect(mockRumLiveDebug).toHaveBeenCalledTimes(25)
    })
  })

  describe('error handling', () => {
    it('should handle missing DD_RUM gracefully', () => {
      delete (window as any).DD_RUM

      const probe: Probe = {
        id: 'test-probe',
        version: 0,
        type: 'LOG_PROBE',
        where: { typeName: 'TestClass', methodName: 'errorHandling' },
        template: 'Test',
        captureSnapshot: false,
        capture: {},
        sampling: {},
        evaluateAt: 'ENTRY',
      }
      addProbe(probe)

      const consoleWarnSpy = spyOn(console, 'warn')

      const probes = getProbes('TestClass;errorHandling')!
      expect(() => {
        onEntry(probes, {}, {})
        onReturn(probes, null, {}, {}, {})
      }).not.toThrow()

      expect(consoleWarnSpy).toHaveBeenCalledWith(jasmine.stringContaining('DD_RUM.liveDebug is not available'))
    })
  })
})
