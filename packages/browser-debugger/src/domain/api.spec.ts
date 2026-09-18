import { globalObject } from '@datadog/js-core/util'
import { mockClock, mockSourceCodeContext, registerCleanupTask } from '@datadog/browser-core/test'
import { onEntry, onReturn, onThrow, initDebuggerTransport, resetDebuggerTransport } from './api'
import { display } from './display'
import { addProbe, removeProbe, getProbes, clearProbes } from './probes'
import type { Probe } from './probes'
import { createProbe } from './probe.specHelper'
import { captureStackTrace } from './stacktrace'

const DEFAULT_PROBE_FUNCTION_ID = 'test.js;testMethod'
const thisArg = {}

describe('api', () => {
  let mockBatchAdd: jasmine.Spy
  let warnSpy: jasmine.Spy

  function initTransport(overrides: Record<string, unknown> = {}) {
    resetDebuggerTransport()
    initDebuggerTransport(
      { service: 'test-service', env: 'test-env', ...overrides } as any,
      {
        add: mockBatchAdd,
      } as any
    )
  }

  beforeEach(() => {
    clearProbes()

    warnSpy = spyOn(display, 'warn')
    mockBatchAdd = jasmine.createSpy('batchAdd')
    initTransport()
    ;(window as any).DD_DEBUGGER = {
      version: '0.0.1',
    }

    registerCleanupTask(() => {
      delete (window as any).DD_DEBUGGER
      resetDebuggerTransport()
      clearProbes()
    })
  })

  describe('onEntry and onReturn', () => {
    it('should capture this inside arguments.fields', () => {
      addProbe(createProbe())

      const self = { name: 'testObj' }
      const args = { a: 1, b: 2 }
      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, self, args)!
      onReturn(invocation, 'result', self, args)

      const payload = mockBatchAdd.calls.mostRecent().args[0]
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

    it('should not capture this when it is the global object', () => {
      addProbe(createProbe())

      const args = { a: 1 }
      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, globalObject, args)!
      onReturn(invocation, 'result', globalObject, args)

      const payload = mockBatchAdd.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot

      expect(snapshot.captures.entry.arguments).toEqual({
        a: { type: 'number', value: '1' },
      })
      expect(snapshot.captures.return.arguments).toEqual({
        a: { type: 'number', value: '1' },
      })
    })

    it('should capture entry and return for simple probe', () => {
      addProbe(createProbe())

      const self = { name: 'test' }
      const args = { arg1: 'value1', arg2: 42 }

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, self, args)!
      const result = onReturn(invocation, 'returnValue', self, args)

      expect(result).toBe('returnValue')
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      const payload = mockBatchAdd.calls.mostRecent().args[0]
      expect(payload.message).toBe('Test message')
      expect(payload.debugger.snapshot).toEqual(
        jasmine.objectContaining({ id: jasmine.any(String), captures: jasmine.any(Object) })
      )
    })

    it('should skip probe if sampling budget exceeded', () => {
      // Use a very low sampling rate to ensure budget is exceeded
      addProbe(
        createProbe({
          sampling: { snapshotsPerSecond: 0.5 }, // 0.5 per second = 2000ms between samples
        })
      )

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      // First call should work
      onReturn(onEntry(probes, thisArg)!, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      // Second immediate call should be skipped (less than 2000ms passed)
      expect(onEntry(probes, thisArg)).toBeUndefined()

      // Still only one call because sampling budget not refreshed
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
    })

    it('should not evaluate ENTRY condition when sampling budget is exceeded', () => {
      addProbe(
        createProbe({
          when: {
            dsl: 'missing.value',
            json: { getmember: [{ ref: 'missing' }, 'value'] },
          },
          sampling: { snapshotsPerSecond: 0.5 },
          evaluateAt: 'ENTRY',
        })
      )

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onReturn(onEntry(probes, thisArg, { missing: { value: true } })!, null, thisArg, { missing: { value: true } })
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      expect(onEntry(probes, thisArg)).toBeUndefined()

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
    })

    it('should not evaluate EXIT condition when sampling budget is exceeded', () => {
      addProbe(
        createProbe({
          when: {
            dsl: 'missing.value',
            json: { getmember: [{ ref: 'missing' }, 'value'] },
          },
          sampling: { snapshotsPerSecond: 0.5 },
        })
      )

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onReturn(onEntry(probes, thisArg, { missing: { value: true } })!, null, thisArg, { missing: { value: true } })
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      expect(onEntry(probes, thisArg)).toBeUndefined()

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
    })

    it('should evaluate condition at ENTRY', () => {
      const probe = createProbe({
        when: {
          dsl: 'x > 5',
          json: { gt: [{ ref: 'x' }, 5] },
        },
        evaluateAt: 'ENTRY',
      })
      addProbe(probe)

      let probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      // Should fire when condition passes
      onReturn(onEntry(probes, thisArg, { x: 10 })!, null, thisArg, { x: 10 })
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      clearProbes()
      addProbe(probe)
      mockBatchAdd.calls.reset()

      probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      // Should not fire when condition fails
      expect(onEntry(probes, thisArg, { x: 3 })).toBeUndefined()
      expect(mockBatchAdd).not.toHaveBeenCalled()
    })

    it('should evaluate condition at EXIT with @return', () => {
      const probe = createProbe({
        when: {
          dsl: '@return > 10',
          json: { gt: [{ ref: '@return' }, 10] },
        },
      })
      addProbe(probe)

      let probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      // Should fire when return value > 10
      onReturn(onEntry(probes, thisArg)!, 15, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      clearProbes()
      addProbe(probe)
      mockBatchAdd.calls.reset()

      probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      // Should not fire when return value <= 10
      onReturn(onEntry(probes, thisArg)!, 5, thisArg)
      expect(mockBatchAdd).not.toHaveBeenCalled()
    })

    it('should capture expressions at ENTRY', () => {
      addProbe(
        createProbe({
          captureSnapshot: false,
          captureExpressions: [
            { name: 'argValue', expr: { dsl: 'arg.value', json: { getmember: [{ ref: 'arg' }, 'value'] } } },
            { name: 'limited', expr: { dsl: 'longString', json: { ref: 'longString' } }, capture: { maxLength: 3 } },
          ],
          sampling: { snapshotsPerSecond: Infinity },
          evaluateAt: 'ENTRY',
        })
      )

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg, { arg: { value: 42 }, longString: 'abcdef' })!
      onReturn(invocation, null, thisArg, { arg: { value: 42 }, longString: 'abcdef' })

      const payload = mockBatchAdd.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot
      expect(snapshot.captures).toEqual({
        entry: {
          captureExpressions: {
            argValue: { type: 'number', value: '42' },
            limited: { type: 'string', value: 'abc', truncated: true, size: 6 },
          },
        },
        return: undefined,
      })
    })

    it('should capture expressions at EXIT with @return and locals', () => {
      addProbe(
        createProbe({
          captureSnapshot: false,
          captureExpressions: [
            { name: 'returnValue', expr: { dsl: '@return', json: { ref: '@return' } } },
            { name: 'localValue', expr: { dsl: 'local.value', json: { getmember: [{ ref: 'local' }, 'value'] } } },
          ],
          sampling: { snapshotsPerSecond: Infinity },
        })
      )

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg)!
      onReturn(invocation, { nested: 'return' }, thisArg, {}, { local: { value: 'data' } })

      const payload = mockBatchAdd.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot
      expect(snapshot.captures).toEqual({
        entry: undefined,
        return: {
          captureExpressions: {
            returnValue: { type: 'Object', fields: { nested: { type: 'string', value: 'return' } } },
            localValue: { type: 'string', value: 'data' },
          },
        },
      })
    })

    it('should report capture expression evaluation errors without dropping successful expressions', () => {
      addProbe(
        createProbe({
          captureSnapshot: false,
          captureExpressions: [
            { name: 'existing', expr: { dsl: 'existing', json: { ref: 'existing' } } },
            {
              name: 'missing.value',
              expr: { dsl: 'missing.value', json: { getmember: [{ ref: 'missing' }, 'value'] } },
            },
          ],
          sampling: { snapshotsPerSecond: Infinity },
          evaluateAt: 'ENTRY',
        })
      )

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg, { existing: 'value' })!
      onReturn(invocation, null, thisArg, { existing: 'value' })

      const payload = mockBatchAdd.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot
      expect(snapshot.captures.entry.captureExpressions).toEqual({
        existing: { type: 'string', value: 'value' },
      })
      expect(snapshot.evaluationErrors).toEqual([
        {
          expr: 'missing.value',
          message: jasmine.stringMatching(/^ReferenceError: /),
        },
      ])
    })

    it('should capture both entry and return snapshots for ENTRY evaluation', () => {
      addProbe(createProbe({ evaluateAt: 'ENTRY' }))

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, { name: 'obj' }, { arg: 'value' })!
      onReturn(invocation, 'result', { name: 'obj' }, { arg: 'value' }, { local: 'data' })

      const payload = mockBatchAdd.calls.mostRecent().args[0]
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

    it('should capture both entry and return snapshots for EXIT evaluation with no condition', () => {
      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, { name: 'obj' }, { arg: 'value' })!
      onReturn(invocation, 'result', { name: 'obj' }, { arg: 'value' }, { local: 'data' })

      const payload = mockBatchAdd.calls.mostRecent().args[0]
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
      addProbe(
        createProbe({
          when: {
            dsl: '@return === true',
            json: { eq: [{ ref: '@return' }, true] },
          },
        })
      )

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg, { arg: 'value' })!
      onReturn(invocation, true, thisArg, { arg: 'value' })

      const payload = mockBatchAdd.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot
      expect(snapshot.captures.entry).toBeUndefined()
      expect(snapshot.captures.return).toBeDefined()
    })

    it('should include duration in snapshot', () => {
      const clock = mockClock()

      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg)!

      clock.tick(10)

      onReturn(invocation, null, thisArg)

      const payload = mockBatchAdd.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot
      expect(snapshot.duration).toBe(10_000_000) // Should be in nanoseconds (10ms)
    })

    it('should report ENTRY condition evaluation errors without capturing a snapshot', () => {
      addProbe(
        createProbe({
          when: {
            dsl: 'missing.value',
            json: { getmember: [{ ref: 'missing' }, 'value'] },
          },
          sampling: { snapshotsPerSecond: Infinity },
          evaluateAt: 'ENTRY',
        })
      )

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      expect(onEntry(probes, thisArg)).toBeUndefined()

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
      const payload = mockBatchAdd.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot
      expect(payload.message).toBeUndefined()
      expect(snapshot.evaluationErrors).toEqual([
        {
          expr: 'missing.value',
          message: jasmine.stringMatching(/^ReferenceError: /),
        },
      ])
      expect(snapshot.duration).toBeUndefined()
      expect(snapshot.captures).toBeUndefined()
      expect(snapshot.stack).toBeUndefined()
    })

    it('should report EXIT condition evaluation errors without capturing a return snapshot', () => {
      addProbe(
        createProbe({
          when: {
            dsl: 'missing.value',
            json: { getmember: [{ ref: 'missing' }, 'value'] },
          },
          sampling: { snapshotsPerSecond: Infinity },
        })
      )

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg)!
      onReturn(invocation, null, thisArg)

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
      const payload = mockBatchAdd.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot
      expect(payload.message).toBeUndefined()
      expect(snapshot.evaluationErrors).toEqual([
        {
          expr: 'missing.value',
          message: jasmine.stringMatching(/^ReferenceError: /),
        },
      ])
      expect(snapshot.captures).toBeUndefined()
      expect(snapshot.stack).toBeUndefined()
    })

    it('should rate limit repeated condition evaluation errors', () => {
      const clock = mockClock()
      addProbe(
        createProbe({
          when: {
            dsl: 'missing.value',
            json: { getmember: [{ ref: 'missing' }, 'value'] },
          },
          sampling: { snapshotsPerSecond: Infinity },
          evaluateAt: 'ENTRY',
        })
      )

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onEntry(probes, thisArg)
      onEntry(probes, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      clock.tick(5 * 60 * 1000)

      onEntry(probes, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(2)
    })
  })

  describe('debug IDs', () => {
    function makeStack(topFrameUrl: string) {
      return `Error: context
    at init (${topFrameUrl}:41:27)
    at HTMLButtonElement.onclick (http://source-code-context-spec.example.com/runtime.js:107:146)`
    }

    it('should attach atomic URL and debug ID pairs at the top level', () => {
      const entryUrl = captureStackTrace()[0].fileName
      mockSourceCodeContext({
        [makeStack(entryUrl)]: { service: 'entry-service', version: '1.2.3', ddDebugId: 'entry-id' },
      })

      addProbe(createProbe())
      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg)!
      onReturn(invocation, null, thisArg)

      const payload = mockBatchAdd.calls.mostRecent().args[0]
      expect(payload._dd).toEqual({ debug_ids: [{ url: entryUrl, id: 'entry-id' }] })
    })

    it('should attach debug IDs from throwable and entry frame URLs', () => {
      const entryUrl = captureStackTrace()[0].fileName
      const throwableUrl = 'http://throwable.example.com/bundle.js?cache=1'
      mockSourceCodeContext({
        [makeStack(entryUrl)]: { ddDebugId: 'entry-id' },
        [makeStack(throwableUrl)]: { ddDebugId: 'throwable-id' },
      })

      const error = new Error('boom')
      error.stack = `Error: boom
    at throwFn (${throwableUrl}:10:2)`

      addProbe(createProbe())
      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg)!
      onThrow(invocation, error, thisArg)

      const payload = mockBatchAdd.calls.mostRecent().args[0]
      expect(payload._dd.debug_ids).toEqual(
        jasmine.arrayWithExactContents([
          { url: throwableUrl, id: 'throwable-id' },
          { url: entryUrl, id: 'entry-id' },
        ])
      )
    })

    it('should omit _dd when no source code context matches', () => {
      mockSourceCodeContext({
        [makeStack('http://unrelated.example.com/bundle.js')]: { ddDebugId: 'unrelated-id' },
      })

      addProbe(createProbe())
      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg)!
      onReturn(invocation, null, thisArg)

      const payload = mockBatchAdd.calls.mostRecent().args[0]
      expect(payload._dd).toBeUndefined()
    })
  })

  describe('onThrow', () => {
    it('should capture this inside arguments.fields for exceptions', () => {
      addProbe(createProbe())

      const self = { name: 'testObj' }
      const args = { a: 1, b: 2 }
      const error = new Error('Test error')
      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, self, args)!
      onThrow(invocation, error, self, args)

      const payload = mockBatchAdd.calls.mostRecent().args[0]
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

    it('should not capture this for exceptions when it is the global object', () => {
      addProbe(createProbe())

      const args = { a: 1 }
      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, globalObject, args)!
      onThrow(invocation, new Error('Test error'), globalObject, args)

      const payload = mockBatchAdd.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot

      expect(snapshot.captures.return.arguments).toEqual({
        a: { type: 'number', value: '1' },
      })
      expect(snapshot.captures.return.throwable).toEqual({
        message: 'Test error',
        stacktrace: jasmine.any(Array),
      })
    })

    it('should capture exception details', () => {
      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const error = new Error('Test error')
      const invocation = onEntry(probes, thisArg, { arg: 'value' })!
      onThrow(invocation, error, thisArg, { arg: 'value' })

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      const payload = mockBatchAdd.calls.mostRecent().args[0]
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

    it('should capture non-Error thrown values', () => {
      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg)!
      onThrow(invocation, 'Test error', thisArg)

      const payload = mockBatchAdd.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot
      expect(snapshot.captures.return.throwable).toEqual({
        message: 'Test error',
        stacktrace: [],
      })
    })

    it('should capture cross-realm Error thrown values', () => {
      addProbe(createProbe())

      const iframe = document.createElement('iframe')
      document.body.appendChild(iframe)
      registerCleanupTask(() => iframe.remove())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const iframeWindow = iframe.contentWindow as Window & { Error: ErrorConstructor }
      const error = new iframeWindow.Error('Iframe error')
      const invocation = onEntry(probes, thisArg)!
      onThrow(invocation, error, thisArg)

      const payload = mockBatchAdd.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot
      expect(snapshot.captures.return.throwable).toEqual({
        message: 'Iframe error',
        stacktrace: jasmine.any(Array),
      })
    })

    it('should capture thrown values that cannot be coerced to strings', () => {
      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg)!
      expect(() => onThrow(invocation, Object.create(null), thisArg)).not.toThrow()

      const payload = mockBatchAdd.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot
      expect(snapshot.captures.return.throwable).toEqual({
        message: '{}',
        stacktrace: [],
      })
    })

    it('should capture thrown values that cannot be coerced or sanitized', () => {
      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const error = {
        toString() {
          throw new Error('Cannot coerce')
        },
        get x() {
          throw new Error('Cannot sanitize')
        },
      }
      const invocation = onEntry(probes, {}, {})!
      expect(() => onThrow(invocation, error, {}, {})).not.toThrow()

      const payload = mockBatchAdd.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot
      expect(snapshot.captures.return.throwable).toEqual({
        message: '<error: unable to stringify thrown value>',
        stacktrace: [],
      })
    })

    it('should capture Error-like thrown values with hostile message getters', () => {
      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const error = {
        [Symbol.toStringTag]: 'Error',
        get message() {
          throw new Error('Cannot read message')
        },
      }
      const invocation = onEntry(probes, {}, {})!
      expect(() => onThrow(invocation, error, {}, {})).not.toThrow()

      const payload = mockBatchAdd.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot
      expect(snapshot.captures.return.throwable).toEqual({
        message: '[object Error]',
        stacktrace: [],
      })
    })

    it('should evaluate EXIT condition with @exception', () => {
      addProbe(
        createProbe({
          when: {
            dsl: '@exception.message',
            json: { getmember: [{ ref: '@exception' }, 'message'] },
          },
          template: 'Exception captured',
          captureSnapshot: false,
        })
      )

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const error = new Error('Test error')
      const invocation = onEntry(probes, thisArg)!
      onThrow(invocation, error, thisArg)

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
    })

    it('should capture expressions at EXIT with @exception', () => {
      addProbe(
        createProbe({
          captureSnapshot: false,
          captureExpressions: [
            {
              name: 'exceptionMessage',
              expr: { dsl: '@exception.message', json: { getmember: [{ ref: '@exception' }, 'message'] } },
            },
          ],
          sampling: { snapshotsPerSecond: Infinity },
        })
      )

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg)!
      onThrow(invocation, new Error('Test error'), thisArg)

      const payload = mockBatchAdd.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot
      expect(snapshot.captures).toEqual({
        entry: undefined,
        return: {
          captureExpressions: {
            exceptionMessage: { type: 'string', value: 'Test error' },
          },
          throwable: {
            message: 'Test error',
            stacktrace: jasmine.any(Array),
          },
        },
      })
    })

    it('should report EXIT condition evaluation errors on throw without capturing a snapshot', () => {
      addProbe(
        createProbe({
          when: {
            dsl: 'missing.value',
            json: { getmember: [{ ref: 'missing' }, 'value'] },
          },
          sampling: { snapshotsPerSecond: Infinity },
        })
      )

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg)!
      onThrow(invocation, new Error('Test error'), thisArg)

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
      const payload = mockBatchAdd.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot
      expect(payload.message).toBeUndefined()
      expect(snapshot.evaluationErrors).toEqual([
        {
          expr: 'missing.value',
          message: jasmine.stringMatching(/^ReferenceError: /),
        },
      ])
      expect(snapshot.captures).toBeUndefined()
      expect(snapshot.stack).toBeUndefined()
    })
  })

  describe('global snapshot budget', () => {
    it('should respect global snapshot rate limit', () => {
      const probes: Probe[] = []
      for (let i = 0; i < 30; i++) {
        const probe = createProbe({
          id: `probe-${i}`,
          where: { typeName: 'test.js', methodName: `method${i}` },
          sampling: { snapshotsPerSecond: 5000 },
        })
        addProbe(probe)
        probes.push(probe)
      }

      // Try to fire 30 probes rapidly
      for (let i = 0; i < 30; i++) {
        const probes = getProbes(`test.js;method${i}`)!
        const invocation = onEntry(probes, thisArg)
        if (invocation) {
          onReturn(invocation, null, thisArg)
        }
      }

      // Should only get 25 calls (global limit)
      expect(mockBatchAdd).toHaveBeenCalledTimes(25)
    })

    it('should respect configured global snapshot rate limit', () => {
      initTransport({ maxSnapshotsPerSecondGlobally: 2 })

      for (let i = 0; i < 3; i++) {
        const probe = createProbe({
          id: `configured-global-probe-${i}`,
          where: { typeName: 'test.js', methodName: `configuredGlobal${i}` },
          sampling: { snapshotsPerSecond: 5000 },
        })
        addProbe(probe)
      }

      for (let i = 0; i < 3; i++) {
        const probes = getProbes(`test.js;configuredGlobal${i}`)!
        const invocation = onEntry(probes, thisArg)
        if (invocation) {
          onReturn(invocation, null, thisArg)
        }
      }

      expect(mockBatchAdd).toHaveBeenCalledTimes(2)
    })

    it('should apply the global snapshot rate limit to capture-expression probes', () => {
      for (let i = 0; i < 30; i++) {
        addProbe(
          createProbe({
            where: { typeName: 'test.js', methodName: `captureExpressionGlobal${i}` },
            captureSnapshot: false,
            captureExpressions: [{ name: 'x', expr: { dsl: 'x', json: { ref: 'x' } } }],
            sampling: { snapshotsPerSecond: 5000 },
          })
        )
      }

      for (let i = 0; i < 30; i++) {
        const probes = getProbes(`test.js;captureExpressionGlobal${i}`)!
        const invocation = onEntry(probes, thisArg, { x: i })
        if (invocation) {
          onReturn(invocation, null, thisArg, { x: i })
        }
      }

      expect(mockBatchAdd).toHaveBeenCalledTimes(25)
    })
  })

  describe('configured per-second budgets', () => {
    it('should respect configured default snapshot per-probe rate limit', () => {
      initTransport({ maxSnapshotsPerSecondPerProbe: 0.5 })

      addProbe(createProbe({ sampling: undefined }))

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onReturn(onEntry(probes, thisArg)!, null, thisArg)
      expect(onEntry(probes, thisArg)).toBeUndefined()

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
    })

    it('should respect configured default non-snapshot per-probe rate limit', () => {
      initTransport({ maxNonSnapshotsPerSecondPerProbe: 1 })

      addProbe(
        createProbe({
          captureSnapshot: false,
          sampling: undefined,
        })
      )

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onReturn(onEntry(probes, thisArg)!, null, thisArg)
      expect(onEntry(probes, thisArg)).toBeUndefined()

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
    })

    it('should use the configured default snapshot per-probe rate limit for capture-expression probes', () => {
      initTransport({ maxSnapshotsPerSecondPerProbe: 0.5 })

      addProbe(
        createProbe({
          captureSnapshot: false,
          captureExpressions: [{ name: 'x', expr: { dsl: 'x', json: { ref: 'x' } } }],
        })
      )

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onReturn(onEntry(probes, thisArg, { x: 1 })!, null, thisArg, { x: 1 })
      expect(onEntry(probes, thisArg, { x: 2 })).toBeUndefined()

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
    })
  })

  describe('probe lifetime budgets', () => {
    it('should stop sending snapshot events after maxSnapshotsPerProbeLifetime', () => {
      initTransport({ maxSnapshotsPerProbeLifetime: 1 })

      const probe = createProbe({
        // Disable per-probe rate limiting so the second invocation exercises the
        // lifetime cap rather than the per-second cap.
        sampling: { snapshotsPerSecond: Infinity },
      })
      addProbe(probe)

      // First invocation: probe sends its single allowed event.
      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg)!
      onReturn(invocation, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      // Second invocation: the lifetime budget is now exhausted. Nothing is captured, so no new
      // event is queued, and the probe is auto-unregistered.
      expect(onEntry(probes, thisArg)).toBeUndefined()
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
      expect(getProbes(DEFAULT_PROBE_FUNCTION_ID)).toBeUndefined()
    })

    it('should skip snapshot collection once the lifetime budget is exhausted', () => {
      initTransport({ maxSnapshotsPerProbeLifetime: 1 })

      const getterSpy = jasmine.createSpy('argGetter').and.returnValue('value')
      const args = {}
      Object.defineProperty(args, 'arg', {
        enumerable: true,
        get: getterSpy,
      })
      addProbe(
        createProbe({
          // Disable per-probe rate limiting so the second invocation isn't sampled out
          // by it — we want to exercise the lifetime cap, not the rate cap.
          sampling: { snapshotsPerSecond: Infinity },
        })
      )

      // First invocation does the full pipeline: 2 reads from entry capture
      // (context spread + captureFields) + 1 read from return capture = 3 reads.
      // This exhausts the lifetime budget.
      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onReturn(onEntry(probes, thisArg, args)!, null, thisArg, args)

      // Second invocation: onEntry detects the exhausted budget up front and skips all capture
      // work — no further reads from args.
      expect(onEntry(probes, thisArg, args)).toBeUndefined()

      expect(getterSpy).toHaveBeenCalledTimes(3)
    })

    it('should stop sending non-snapshot events after maxNonSnapshotsPerProbeLifetime', () => {
      initTransport({ maxNonSnapshotsPerProbeLifetime: 1 })

      addProbe(
        createProbe({
          captureSnapshot: false,
          // Disable per-probe rate limiting so the second invocation exercises the
          // lifetime cap rather than the per-second cap.
          sampling: { snapshotsPerSecond: Infinity },
        })
      )

      // First invocation: probe sends its single allowed event.
      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg)!
      onReturn(invocation, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      // Second invocation: the lifetime budget is now exhausted. Nothing is captured, so no new
      // event is queued, and the probe is auto-unregistered.
      expect(onEntry(probes, thisArg)).toBeUndefined()
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
      expect(getProbes(DEFAULT_PROBE_FUNCTION_ID)).toBeUndefined()
    })

    it('should finish in-flight recursive entries after the lifetime budget is exhausted', () => {
      initTransport({ maxNonSnapshotsPerProbeLifetime: 1 })

      addProbe(
        createProbe({
          captureSnapshot: false,
          sampling: { snapshotsPerSecond: Infinity },
        })
      )

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const outerInvocation = onEntry(probes, thisArg)!
      const innerInvocation = onEntry(probes, thisArg)!

      onReturn(innerInvocation, null, thisArg)
      expect(getProbes(DEFAULT_PROBE_FUNCTION_ID)).toBeUndefined()

      // The lifetime budget gates new entries, but already accepted in-flight
      // entries still drain even if another frame exhausts the budget first.
      onReturn(outerInvocation, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(2)
    })

    it('should reset the lifetime budget when a new probe version is delivered', () => {
      initTransport({ maxSnapshotsPerProbeLifetime: 1 })

      const probe = createProbe({ sampling: { snapshotsPerSecond: 5000 } })
      addProbe(probe)

      let probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg)!
      onReturn(invocation, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      // The old probe has reached its lifetime budget and was auto-unregistered.
      // After re-add, the new version should have a fresh budget.
      addProbe({ ...probe, version: 1 })

      probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation2 = onEntry(probes, thisArg)!
      onReturn(invocation2, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(2)
    })

    it('should not emit any event when the lifetime budget is zero', () => {
      initTransport({ maxSnapshotsPerProbeLifetime: 0 })

      addProbe(createProbe({ sampling: { snapshotsPerSecond: 5000 } }))

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      expect(onEntry(probes, thisArg)).toBeUndefined()

      expect(mockBatchAdd).not.toHaveBeenCalled()
      expect(getProbes(DEFAULT_PROBE_FUNCTION_ID)).toBeUndefined()
    })

    it('should still process sibling probes when one is removed mid-iteration', () => {
      // Use distinct snapshot/non-snapshot lifetime caps so probeA hits its cap after
      // one event while probeB still has plenty of budget. On the second invocation,
      // probeA's pre-call budget check fails and it gets removed from the shared
      // probes array. This exposes the array mutation hazard: removing probeA
      // mid-iteration must not cause probeB to be skipped.
      initTransport({ maxSnapshotsPerProbeLifetime: 1, maxNonSnapshotsPerProbeLifetime: 1000 })

      // Disable per-probe rate limiting on both probes so the second invocation
      // exercises the lifetime cap rather than the per-second cap.
      const probeA = createProbe({
        id: 'sibling-probe-a',
        template: 'A',
        sampling: { snapshotsPerSecond: Infinity },
      })
      const probeB = createProbe({
        id: 'sibling-probe-b',
        template: 'B',
        captureSnapshot: false,
        sampling: { snapshotsPerSecond: Infinity },
      })
      addProbe(probeA)
      addProbe(probeB)

      // First invocation: both probes emit one event. probeA hits its cap (eventsSent=1,
      // max=1) but is not removed yet — the pre-call budget check still passed.
      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg)!
      onReturn(invocation, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(2)

      // Second invocation: probeA's pre-call check now fails and it is queued for
      // removal. probeB must still be processed in the same iteration even though
      // probeA gets spliced out of the probes array.
      mockBatchAdd.calls.reset()
      const probesAfterFirst = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation2 = onEntry(probesAfterFirst, thisArg)!
      onReturn(invocation2, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
      expect(getProbes(DEFAULT_PROBE_FUNCTION_ID)).toEqual([jasmine.objectContaining({ id: 'sibling-probe-b' })])

      // probeB's entry must not leak: exiting the same invocation again is a no-op.
      mockBatchAdd.calls.reset()
      onReturn(invocation2, null, thisArg)
      expect(mockBatchAdd).not.toHaveBeenCalled()
    })
  })

  describe('invocation handles', () => {
    it('should drain in-flight entries through the removed probe instance', () => {
      const probe = createProbe()
      addProbe(probe)

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg)!

      removeProbe(probe.id)
      onReturn(invocation, null, thisArg)

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
    })

    it('should isolate in-flight entries from a replacement probe with the same id', () => {
      const probe = createProbe()
      addProbe(probe)

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg)!

      removeProbe(probe.id)
      const replacement = createProbe({ id: probe.id })
      addProbe(replacement)

      // The in-flight invocation reports through the probe instance it entered with, so the
      // replacement does not inherit it.
      onReturn(invocation, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
      expect(mockBatchAdd.calls.mostRecent().args[0].debugger.snapshot.probe.version).toBe(probe.version)

      // The replacement starts from a clean slate: its own invocation is independent.
      mockBatchAdd.calls.reset()
      const newProbes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onReturn(onEntry(newProbes, thisArg)!, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
    })

    it('should discard in-flight entries when all probes are cleared', () => {
      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg)!

      clearProbes()
      addProbe(createProbe())

      onReturn(invocation, null, thisArg)

      expect(mockBatchAdd).not.toHaveBeenCalled()
    })

    // Generated code can reach two exit hooks for one invocation, e.g. `try { return a } finally
    // { return b }`.
    it('should report an invocation once when the return hook runs twice', () => {
      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg)!
      onReturn(invocation, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      mockBatchAdd.calls.reset()

      onReturn(invocation, null, thisArg)
      expect(mockBatchAdd).not.toHaveBeenCalled()
    })

    it('should report an invocation once when the throw hook runs twice', () => {
      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg)!
      onThrow(invocation, new Error('test'), thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      mockBatchAdd.calls.reset()

      onThrow(invocation, new Error('test'), thisArg)
      expect(mockBatchAdd).not.toHaveBeenCalled()
    })

    it('should report an invocation once when the return hook is followed by the throw hook', () => {
      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg)!
      onReturn(invocation, 'value', thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      mockBatchAdd.calls.reset()

      onThrow(invocation, new Error('test'), thisArg)
      expect(mockBatchAdd).not.toHaveBeenCalled()
    })

    // Overlapping async invocations settle in any order, so each snapshot must describe its own
    // invocation: entry state, duration, arguments, return value, locals and exception.
    describe('overlapping invocations', () => {
      function getSnapshots(): Array<Record<string, any>> {
        return mockBatchAdd.calls.allArgs().map(([payload]) => payload.debugger.snapshot as Record<string, any>)
      }

      it('should pair each snapshot with its own entry state when invocations exit in entry order', () => {
        const clock = mockClock()
        addProbe(createProbe({ sampling: { snapshotsPerSecond: Infinity } }))

        const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
        const invocationA = onEntry(probes, thisArg, { name: 'A' })!
        clock.tick(10)
        const invocationB = onEntry(probes, thisArg, { name: 'B' })!

        clock.tick(90)
        onReturn(invocationA, 'resultA', thisArg, { name: 'A' }, { local: 'localA' })
        clock.tick(910)
        onReturn(invocationB, 'resultB', thisArg, { name: 'B' }, { local: 'localB' })

        const [snapshotA, snapshotB] = getSnapshots()
        expect(snapshotA.captures.entry.arguments.name.value).toBe('A')
        expect(snapshotA.captures.return.arguments.name.value).toBe('A')
        expect(snapshotA.captures.return.locals.local.value).toBe('localA')
        expect(snapshotA.captures.return.locals['@return'].value).toBe('resultA')
        expect(snapshotA.duration).toBe(100 * 1e6)

        expect(snapshotB.captures.entry.arguments.name.value).toBe('B')
        expect(snapshotB.captures.return.arguments.name.value).toBe('B')
        expect(snapshotB.captures.return.locals.local.value).toBe('localB')
        expect(snapshotB.captures.return.locals['@return'].value).toBe('resultB')
        expect(snapshotB.duration).toBe(1000 * 1e6)
      })

      it('should pair each snapshot with its own entry state when invocations exit in reverse entry order', () => {
        const clock = mockClock()
        addProbe(createProbe({ sampling: { snapshotsPerSecond: Infinity } }))

        const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
        const invocationA = onEntry(probes, thisArg, { name: 'A' })!
        clock.tick(10)
        const invocationB = onEntry(probes, thisArg, { name: 'B' })!

        clock.tick(90)
        onReturn(invocationB, 'resultB', thisArg, { name: 'B' })
        clock.tick(910)
        onReturn(invocationA, 'resultA', thisArg, { name: 'A' })

        const [snapshotB, snapshotA] = getSnapshots()
        expect(snapshotB.captures.entry.arguments.name.value).toBe('B')
        expect(snapshotB.captures.return.locals['@return'].value).toBe('resultB')
        expect(snapshotB.duration).toBe(90 * 1e6)

        expect(snapshotA.captures.entry.arguments.name.value).toBe('A')
        expect(snapshotA.captures.return.locals['@return'].value).toBe('resultA')
        expect(snapshotA.duration).toBe(1010 * 1e6)
      })

      it('should pair the throwing invocation with its own entry state while another returns', () => {
        addProbe(createProbe({ sampling: { snapshotsPerSecond: Infinity } }))

        const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
        const invocationA = onEntry(probes, thisArg, { name: 'A' })!
        const invocationB = onEntry(probes, thisArg, { name: 'B' })!

        onReturn(invocationA, 'resultA', thisArg, { name: 'A' })
        onThrow(invocationB, new Error('failed B'), thisArg, { name: 'B' })

        const [snapshotA, snapshotB] = getSnapshots()
        expect(snapshotA.captures.entry.arguments.name.value).toBe('A')
        expect(snapshotA.captures.return.locals['@return'].value).toBe('resultA')
        expect(snapshotA.captures.return.throwable).toBeUndefined()

        expect(snapshotB.captures.entry.arguments.name.value).toBe('B')
        expect(snapshotB.captures.return.throwable.message).toBe('failed B')
        expect(snapshotB.captures.return.locals).toBeUndefined()
      })

      it('should keep each probe paired with its own entry state when several probes watch the function', () => {
        addProbe(createProbe({ id: 'probe-a', template: 'A', sampling: { snapshotsPerSecond: Infinity } }))
        addProbe(createProbe({ id: 'probe-b', template: 'B', sampling: { snapshotsPerSecond: Infinity } }))

        const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
        const invocationFirst = onEntry(probes, thisArg, { name: 'first' })!
        const invocationSecond = onEntry(probes, thisArg, { name: 'second' })!

        onReturn(invocationFirst, 'resultFirst', thisArg, { name: 'first' })
        onReturn(invocationSecond, 'resultSecond', thisArg, { name: 'second' })

        expect(
          getSnapshots().map((snapshot) => [
            String(snapshot.probe.id),
            String(snapshot.captures.entry.arguments.name.value),
            String(snapshot.captures.return.locals['@return'].value),
          ])
        ).toEqual([
          ['probe-a', 'first', 'resultFirst'],
          ['probe-b', 'first', 'resultFirst'],
          ['probe-a', 'second', 'resultSecond'],
          ['probe-b', 'second', 'resultSecond'],
        ])
      })

      it('should report the probes that captured an invocation when a sibling probe is sampled out', () => {
        // sampled-probe only captures the first invocation; unsampled-probe captures both.
        addProbe(createProbe({ id: 'unsampled-probe', sampling: { snapshotsPerSecond: Infinity } }))
        addProbe(createProbe({ id: 'sampled-probe', sampling: { snapshotsPerSecond: 0.5 } }))

        const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
        const invocationFirst = onEntry(probes, thisArg, { name: 'first' })!
        const invocationSecond = onEntry(probes, thisArg, { name: 'second' })!

        onReturn(invocationFirst, 'resultFirst', thisArg, { name: 'first' })
        onReturn(invocationSecond, 'resultSecond', thisArg, { name: 'second' })

        expect(
          getSnapshots().map((snapshot) => [
            String(snapshot.probe.id),
            String(snapshot.captures.entry.arguments.name.value),
          ])
        ).toEqual([
          ['unsampled-probe', 'first'],
          ['sampled-probe', 'first'],
          ['unsampled-probe', 'second'],
        ])
      })

      it('should leave an in-flight invocation untouched when a later one is skipped by its entry condition', () => {
        addProbe(
          createProbe({
            when: { dsl: 'x > 5', json: { gt: [{ ref: 'x' }, 5] } },
            evaluateAt: 'ENTRY',
            sampling: { snapshotsPerSecond: Infinity },
          })
        )

        const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
        const invocationPassing = onEntry(probes, thisArg, { x: 10 })!
        expect(onEntry(probes, thisArg, { x: 3 })).toBeUndefined()

        onReturn(invocationPassing, 'result', thisArg, { x: 10 })

        const [snapshot] = getSnapshots()
        expect(getSnapshots().length).toBe(1)
        expect(snapshot.captures.entry.arguments.x.value).toBe('10')
        expect(snapshot.captures.return.locals['@return'].value).toBe('result')
      })

      it('should give each frame of a synchronous recursion its own entry state', () => {
        const clock = mockClock()
        addProbe(createProbe({ sampling: { snapshotsPerSecond: Infinity } }))

        const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
        const outerInvocation = onEntry(probes, thisArg, { depth: 2 })!
        clock.tick(10)
        const innerInvocation = onEntry(probes, thisArg, { depth: 1 })!

        // Recursive frames exit innermost-first.
        clock.tick(10)
        onReturn(innerInvocation, 'inner', thisArg, { depth: 1 })
        clock.tick(10)
        onReturn(outerInvocation, 'outer', thisArg, { depth: 2 })

        const [innerSnapshot, outerSnapshot] = getSnapshots()
        expect(innerSnapshot.captures.entry.arguments.depth.value).toBe('1')
        expect(innerSnapshot.captures.return.locals['@return'].value).toBe('inner')
        expect(innerSnapshot.duration).toBe(10 * 1e6)

        expect(outerSnapshot.captures.entry.arguments.depth.value).toBe('2')
        expect(outerSnapshot.captures.return.locals['@return'].value).toBe('outer')
        expect(outerSnapshot.duration).toBe(30 * 1e6)
      })
    })
  })

  // TODO: Remove together with the pre-handle guard in consumeEntry (see api.ts).
  describe('instrumentation built before the invocation handle contract', () => {
    // Pre-handle codegen: onEntry's result is discarded, so the exit hooks get the probes array.
    function callWithProbesArray(a: number, b: number): number {
      const probes: any = getProbes(DEFAULT_PROBE_FUNCTION_ID)
      try {
        if (probes) {
          onEntry(probes, thisArg, { a, b })
        }
        const sum = a + b
        return probes ? (onReturn(probes, sum, thisArg, { a, b }, { sum }) as number) : sum
      } catch (error) {
        if (probes) {
          onThrow(probes, error, thisArg, { a, b })
        }
        throw error
      }
    }

    beforeEach(() => {
      addProbe(createProbe({ sampling: { snapshotsPerSecond: Infinity } }))
    })

    it('should return the value to the caller and capture nothing', () => {
      expect(callWithProbesArray(1, 2)).toBe(3)
      expect(mockBatchAdd).not.toHaveBeenCalled()
    })

    it('should leave the probe registry usable', () => {
      callWithProbesArray(1, 2)

      expect(getProbes(DEFAULT_PROBE_FUNCTION_ID)).toEqual([jasmine.objectContaining({ id: 'test-probe' })])
      expect(() => clearProbes()).not.toThrow()
    })

    it('should let the application exception through unchanged', () => {
      const probes: any = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onEntry(probes, thisArg, {})

      expect(() => onThrow(probes, new Error('application error'), thisArg, {})).not.toThrow()
      expect(mockBatchAdd).not.toHaveBeenCalled()
    })
  })

  describe('snapshot timeout', () => {
    function hasTimeoutMarker(value: any): boolean {
      if (!value || typeof value !== 'object') {
        return false
      }
      if (value.notCapturedReason === 'timeout') {
        return true
      }
      if (Array.isArray(value)) {
        return value.some(hasTimeoutMarker)
      }
      return Object.values(value).some(hasTimeoutMarker)
    }

    it('should send partial snapshot when entry capture exceeds timeout', () => {
      addProbe(createProbe({ sampling: { snapshotsPerSecond: 5000 } }))

      let callCount = 0
      const realNow = performance.now.bind(performance)
      spyOn(performance, 'now').and.callFake(() => {
        callCount++
        // Let the first few calls (start time, deadline creation) use real time,
        // then jump past the deadline to simulate slow capture.
        if (callCount <= 3) {
          return realNow()
        }
        return realNow() + 20
      })

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const deepObj = { level1: { level2: { level3: { level4: 'deep' } } } }
      const invocation = onEntry(probes, thisArg, { arg: deepObj })!
      onReturn(invocation, null, thisArg, { arg: deepObj })

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
      const payload = mockBatchAdd.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot
      expect(hasTimeoutMarker(snapshot.captures.entry)).toBe(true)
    })

    it('should send partial snapshot when return capture exceeds timeout', () => {
      addProbe(createProbe({ sampling: { snapshotsPerSecond: 5000 } }))

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!

      // Let onEntry succeed with real time
      const invocation = onEntry(probes, thisArg, { x: 1 })!

      // Now make performance.now jump forward so the return capture times out
      let callCount = 0
      const realNow = performance.now.bind(performance)
      spyOn(performance, 'now').and.callFake(() => {
        callCount++
        if (callCount <= 2) {
          return realNow()
        }
        return realNow() + 20
      })

      onReturn(invocation, null, thisArg, { x: 1 }, { local: 'value' })

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
      const payload = mockBatchAdd.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot
      expect(hasTimeoutMarker(snapshot.captures.return)).toBe(true)
    })

    it('should send partial snapshot when throw capture exceeds timeout', () => {
      addProbe(createProbe({ sampling: { snapshotsPerSecond: 5000 } }))

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!

      // Let onEntry succeed with real time
      const invocation = onEntry(probes, thisArg, { x: 1 })!

      // Now make performance.now jump forward so the throw capture times out
      let callCount = 0
      const realNow = performance.now.bind(performance)
      spyOn(performance, 'now').and.callFake(() => {
        callCount++
        if (callCount <= 2) {
          return realNow()
        }
        return realNow() + 20
      })

      onThrow(invocation, new Error('test'), thisArg, { x: 1 })

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
      const payload = mockBatchAdd.calls.mostRecent().args[0]
      const snapshot = payload.debugger.snapshot
      expect(hasTimeoutMarker(snapshot.captures.return.arguments)).toBe(true)
      expect(snapshot.captures.return.throwable.message).toBe('test')
    })

    it('should not affect non-snapshot probes', () => {
      addProbe(
        createProbe({
          captureSnapshot: false,
          sampling: { snapshotsPerSecond: 5000 },
        })
      )

      // Spike performance.now to simulate slow execution
      let callCount = 0
      const realNow = performance.now.bind(performance)
      spyOn(performance, 'now').and.callFake(() => {
        callCount++
        if (callCount <= 2) {
          return realNow()
        }
        return realNow() + 20
      })

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg)!
      onReturn(invocation, null, thisArg)

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
    })

    it('should still report an invocation whose entry capture timed out', () => {
      addProbe(createProbe({ sampling: { snapshotsPerSecond: 5000 } }))

      let shouldTimeout = true
      let callCount = 0
      const realNow = performance.now.bind(performance)
      spyOn(performance, 'now').and.callFake(() => {
        callCount++
        if (!shouldTimeout || callCount <= 3) {
          return realNow()
        }
        return realNow() + 20
      })

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      // This onEntry will time out but should still record the partial snapshot entry
      const invocation = onEntry(probes, thisArg, { x: 1 })!

      // onReturn should consume the timed-out entry and send its partial snapshot
      shouldTimeout = false
      callCount = 0
      onReturn(invocation, null, thisArg, { x: 1 })

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
    })

    it('should mark subsequent snapshot probes as timed out but still process non-snapshot probes', () => {
      const snapshotProbe1 = createProbe({
        id: 'snapshot-probe-1',
        sampling: { snapshotsPerSecond: 5000 },
      })
      const nonSnapshotProbe = createProbe({
        id: 'non-snapshot-probe',
        captureSnapshot: false,
        sampling: { snapshotsPerSecond: 5000 },
      })
      const snapshotProbe2 = createProbe({
        id: 'snapshot-probe-2',
        sampling: { snapshotsPerSecond: 5000 },
      })
      addProbe(snapshotProbe1)
      addProbe(nonSnapshotProbe)
      addProbe(snapshotProbe2)

      let callCount = 0
      const realNow = performance.now.bind(performance)
      spyOn(performance, 'now').and.callFake(() => {
        callCount++
        if (callCount <= 3) {
          return realNow()
        }
        return realNow() + 20
      })

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg, { x: { nested: 'value' } })!
      onReturn(invocation, null, thisArg, { x: { nested: 'value' } })

      // All probes should still send, with snapshot probes marked as timed out
      const calls = mockBatchAdd.calls.allArgs()
      expect(calls.length).toBe(3)
      expect(calls[1][0].debugger.snapshot.probe.id).toBe(nonSnapshotProbe.id)
      expect(calls[2][0].debugger.snapshot.captures.entry.arguments).toEqual({
        x: { type: 'Object', notCapturedReason: 'timeout' },
        this: { type: 'Object', notCapturedReason: 'timeout' },
      })
    })

    it('should share deadline across probes and mark the second snapshot as timed out immediately', () => {
      addProbe(
        createProbe({
          id: 'timeout-probe-sharedDeadline1',
          sampling: { snapshotsPerSecond: 5000 },
        })
      )
      addProbe(
        createProbe({
          id: 'timeout-probe-sharedDeadline2',
          sampling: { snapshotsPerSecond: 5000 },
        })
      )

      let callCount = 0
      const realNow = performance.now.bind(performance)
      spyOn(performance, 'now').and.callFake(() => {
        callCount++
        if (callCount <= 3) {
          return realNow()
        }
        return realNow() + 20
      })

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const invocation = onEntry(probes, thisArg, { x: { nested: 'value' } })!
      onReturn(invocation, null, thisArg, { x: { nested: 'value' } })

      // Both snapshot probes share the deadline, so the second probe should send a timeout marker immediately.
      const calls = mockBatchAdd.calls.allArgs()
      expect(calls.length).toBe(2)
      expect(calls[1][0].debugger.snapshot.captures.entry.arguments).toEqual({
        x: { type: 'Object', notCapturedReason: 'timeout' },
        this: { type: 'Object', notCapturedReason: 'timeout' },
      })
    })
  })

  describe('error handling', () => {
    it('should handle missing DD_RUM gracefully', () => {
      delete (window as any).DD_RUM

      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      expect(() => {
        const invocation = onEntry(probes, thisArg)!
        onReturn(invocation, null, thisArg)
      }).not.toThrow()

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
    })

    it('should handle uninitialized debugger transport gracefully', () => {
      resetDebuggerTransport()

      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      expect(() => {
        const invocation = onEntry(probes, thisArg)!
        onReturn(invocation, null, thisArg)
      }).not.toThrow()
      expect(warnSpy).toHaveBeenCalledWith(
        'Transport is not initialized. Make sure DD_DEBUGGER.init() has been called.'
      )
    })
  })
})
