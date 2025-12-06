import { registerCleanupTask } from '@datadog/browser-core/test'
import { onEntry, onReturn, onThrow, sendDebuggerSnapshot } from './api'
import { addProbe, getProbes, clearProbes } from './probes'
import type { Probe } from './probes'

describe('api', () => {
  let mockSendRawLog: jasmine.Spy
  let mockGetInitConfiguration: jasmine.Spy
  let mockRumGetInternalContext: jasmine.Spy

  beforeEach(() => {
    clearProbes()

    // Mock DD_LOGS global for liveDebug
    mockSendRawLog = jasmine.createSpy('sendRawLog')
    mockGetInitConfiguration = jasmine.createSpy('getInitConfiguration').and.returnValue({ service: 'test-service' })
    ;(window as any).DD_LOGS = {
      sendRawLog: mockSendRawLog,
      getInitConfiguration: mockGetInitConfiguration,
    }

    // Mock DD_RUM global for context
    mockRumGetInternalContext = jasmine.createSpy('getInternalContext').and.returnValue({
      session_id: 'test-session',
      view: { id: 'test-view' },
      user_action: { id: 'test-action' },
      application_id: 'test-app-id',
    })
    ;(window as any).DD_RUM = {
      version: '1.0.0',
      getInternalContext: mockRumGetInternalContext,
    }

    registerCleanupTask(() => {
      delete (window as any).DD_LOGS
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

      const payload = mockSendRawLog.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot

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
      expect(mockSendRawLog).toHaveBeenCalledTimes(1)

      const payload = mockSendRawLog.calls.mostRecent().args[0]
      expect(payload.message).toBe('Test message')
      expect(payload.debugger.snapshot).toEqual(
        jasmine.objectContaining({ id: jasmine.any(String), captures: jasmine.any(Object) })
      )
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
      expect(mockSendRawLog).toHaveBeenCalledTimes(1)

      // Second immediate call should be skipped (less than 2000ms passed)
      onEntry(probes, {}, {})
      onReturn(probes, null, {}, {}, {})

      // Still only one call because sampling budget not refreshed
      expect(mockSendRawLog).toHaveBeenCalledTimes(1)
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
      expect(mockSendRawLog).toHaveBeenCalledTimes(1)

      clearProbes()
      addProbe(probe)
      mockSendRawLog.calls.reset()

      probes = getProbes('TestClass;conditionEntry')!
      // Should not fire when condition fails
      onEntry(probes, {}, { x: 3 })
      onReturn(probes, null, {}, { x: 3 }, {})
      expect(mockSendRawLog).not.toHaveBeenCalled()
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
      expect(mockSendRawLog).toHaveBeenCalledTimes(1)

      clearProbes()
      addProbe(probe)
      mockSendRawLog.calls.reset()

      probes = getProbes('TestClass;conditionExit')!
      // Should not fire when return value <= 10
      onEntry(probes, {}, {})
      onReturn(probes, 5, {}, {}, {})
      expect(mockSendRawLog).not.toHaveBeenCalled()
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

      const payload = mockSendRawLog.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot
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

      const payload = mockSendRawLog.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot
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

      const payload = mockSendRawLog.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot
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

      const payload = mockSendRawLog.calls.mostRecent().args[0]
      const dd = payload.dd
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

      const payload = mockSendRawLog.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot

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

      expect(mockSendRawLog).toHaveBeenCalledTimes(1)

      const payload = mockSendRawLog.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot
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

      expect(mockSendRawLog).toHaveBeenCalledTimes(1)
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
      expect(mockSendRawLog).toHaveBeenCalledTimes(1)
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
      expect(mockSendRawLog).toHaveBeenCalledTimes(25)
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

      const probes = getProbes('TestClass;errorHandling')!
      expect(() => {
        onEntry(probes, {}, {})
        onReturn(probes, null, {}, {}, {})
      }).not.toThrow()

      // Should still send to DD_LOGS even without DD_RUM
      expect(mockSendRawLog).toHaveBeenCalledTimes(1)
    })

    it('should handle missing DD_LOGS gracefully', () => {
      delete (window as any).DD_LOGS

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

      // Should log a warning when DD_LOGS is not available
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'DD_LOGS.sendRawLog is not available. Make sure the Logs SDK is initialized to send debugger snapshots.'
      )
    })
  })

  describe('sendDebuggerSnapshot', () => {
    it('should send log when DD_LOGS.sendRawLog is available', () => {
      sendDebuggerSnapshot('test message', { name: 'test-logger' }, { version: '1.0' }, { captures: [] })

      expect(mockSendRawLog).toHaveBeenCalledTimes(1)
      const payload = mockSendRawLog.calls.mostRecent().args[0]
      expect(payload.message).toBe('test message')
      expect(payload.logger).toEqual({ name: 'test-logger' })
      expect(payload.dd).toEqual({ version: '1.0' })
      expect(payload.debugger).toEqual({ snapshot: { captures: [] } })
    })

    it('should handle when DD_LOGS is not available', () => {
      delete (window as any).DD_LOGS

      expect(() => {
        sendDebuggerSnapshot('test message')
      }).not.toThrow()
    })

    it('should handle when sendRawLog is not available', () => {
      ;(window as any).DD_LOGS = {
        getInitConfiguration: mockGetInitConfiguration,
      }

      expect(() => {
        sendDebuggerSnapshot('test message')
      }).not.toThrow()
    })

    it('should construct payload with correct structure matching dd-trace-js', () => {
      sendDebuggerSnapshot('test message', { name: 'logger' }, { version: '1.0' }, { snapshot: 'data' })

      expect(mockSendRawLog).toHaveBeenCalledTimes(1)
      const payload = mockSendRawLog.calls.mostRecent().args[0]
      expect(payload.ddsource).toBe('dd_debugger')
      expect(payload.hostname).toBe(window.location.hostname)
      expect(payload.service).toBe('test-service')
      expect(payload.message).toBe('test message')
      expect(payload.logger).toEqual({ name: 'logger' })
      expect(payload.dd).toEqual({ version: '1.0' })
      expect(payload.debugger).toEqual({ snapshot: { snapshot: 'data' } })
      expect(payload.date).toBeDefined()
      expect(payload.status).toBe('info')
      expect(payload.origin).toBeDefined()
    })

    it('should include all parameters (message, logger, dd, snapshot)', () => {
      const message = 'test message'
      const logger = { name: 'test-logger', level: 'info' }
      const dd = { version: '1.0', env: 'prod' }
      const snapshot = { captures: [{ id: '1' }] }

      sendDebuggerSnapshot(message, logger, dd, snapshot)

      expect(mockSendRawLog).toHaveBeenCalledTimes(1)
      const payload = mockSendRawLog.calls.mostRecent().args[0]
      expect(payload.message).toBe(message)
      expect(payload.logger).toBe(logger)
      expect(payload.dd).toBe(dd)
      expect(payload.debugger).toEqual({ snapshot })
    })

    it('should handle empty message', () => {
      sendDebuggerSnapshot(undefined, { name: 'logger' }, {}, {})

      expect(mockSendRawLog).toHaveBeenCalledTimes(1)
      const payload = mockSendRawLog.calls.mostRecent().args[0]
      expect(payload.message).toBe('')
    })

    it('should not include service if not available in config', () => {
      mockGetInitConfiguration.and.returnValue({})
      sendDebuggerSnapshot('test message')

      expect(mockSendRawLog).toHaveBeenCalledTimes(1)
      const payload = mockSendRawLog.calls.mostRecent().args[0]
      expect(payload.service).toBeUndefined()
    })

    it('should handle when getInitConfiguration is not available', () => {
      ;(window as any).DD_LOGS = {
        sendRawLog: mockSendRawLog,
      }
      sendDebuggerSnapshot('test message')

      expect(mockSendRawLog).toHaveBeenCalledTimes(1)
      const payload = mockSendRawLog.calls.mostRecent().args[0]
      expect(payload.service).toBeUndefined()
    })
  })
})
