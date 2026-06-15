import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest'
import { globalObject } from '@datadog/browser-core'
import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import { onEntry, onReturn, onThrow, initDebuggerTransport, resetDebuggerTransport } from './api'
import { display } from './display'
import { addProbe, removeProbe, getProbes, clearProbes } from './probes'
import type { Probe } from './probes'
import { createProbe } from './probe.specHelper'

const DEFAULT_PROBE_FUNCTION_ID = 'test.js;testMethod'
const thisArg = {}

describe('api', () => {
  let mockBatchAdd: Mock
  let warnSpy: Mock

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

    warnSpy = vi.spyOn(display, 'warn')
    mockBatchAdd = vi.fn()
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
      onEntry(probes, self, args)
      onReturn(probes, 'result', self, args)

      const payload = mockBatchAdd.mock.lastCall![0]
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
      onEntry(probes, globalObject, args)
      onReturn(probes, 'result', globalObject, args)

      const payload = mockBatchAdd.mock.lastCall![0]
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
      onEntry(probes, self, args)
      const result = onReturn(probes, 'returnValue', self, args)

      expect(result).toBe('returnValue')
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      const payload = mockBatchAdd.mock.lastCall![0]
      expect(payload.message).toBe('Test message')
      expect(payload.debugger.snapshot).toEqual(
        expect.objectContaining({ id: expect.any(String), captures: expect.any(Object) })
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
      onEntry(probes, thisArg)
      onReturn(probes, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      // Second immediate call should be skipped (less than 2000ms passed)
      onEntry(probes, thisArg)
      onReturn(probes, null, thisArg)

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
      onEntry(probes, thisArg, { missing: { value: true } })
      onReturn(probes, null, thisArg, { missing: { value: true } })
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      onEntry(probes, thisArg)
      onReturn(probes, null, thisArg)

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
      onEntry(probes, thisArg, { missing: { value: true } })
      onReturn(probes, null, thisArg, { missing: { value: true } })
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      onEntry(probes, thisArg)
      onReturn(probes, null, thisArg)

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
      onEntry(probes, thisArg, { x: 10 })
      onReturn(probes, null, thisArg, { x: 10 })
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      clearProbes()
      addProbe(probe)
      mockBatchAdd.mockClear()

      probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      // Should not fire when condition fails
      onEntry(probes, thisArg, { x: 3 })
      onReturn(probes, null, thisArg, { x: 3 })
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
      onEntry(probes, thisArg)
      onReturn(probes, 15, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      clearProbes()
      addProbe(probe)
      mockBatchAdd.mockClear()

      probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      // Should not fire when return value <= 10
      onEntry(probes, thisArg)
      onReturn(probes, 5, thisArg)
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
      onEntry(probes, thisArg, { arg: { value: 42 }, longString: 'abcdef' })
      onReturn(probes, null, thisArg, { arg: { value: 42 }, longString: 'abcdef' })

      const payload = mockBatchAdd.mock.calls[mockBatchAdd.mock.calls.length - 1][0]
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
      onEntry(probes, thisArg)
      onReturn(probes, { nested: 'return' }, thisArg, {}, { local: { value: 'data' } })

      const payload = mockBatchAdd.mock.calls[mockBatchAdd.mock.calls.length - 1][0]
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
      onEntry(probes, thisArg, { existing: 'value' })
      onReturn(probes, null, thisArg, { existing: 'value' })

      const payload = mockBatchAdd.mock.calls[mockBatchAdd.mock.calls.length - 1][0]
      const snapshot = payload.debugger.snapshot
      expect(snapshot.captures.entry.captureExpressions).toEqual({
        existing: { type: 'string', value: 'value' },
      })
      expect(snapshot.evaluationErrors).toEqual([
        {
          expr: 'missing.value',
          message: expect.stringMatching(/^ReferenceError: /),
        },
      ])
    })

    it('should capture both entry and return snapshots for ENTRY evaluation', () => {
      addProbe(createProbe({ evaluateAt: 'ENTRY' }))

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onEntry(probes, { name: 'obj' }, { arg: 'value' })
      onReturn(probes, 'result', { name: 'obj' }, { arg: 'value' }, { local: 'data' })

      const payload = mockBatchAdd.mock.lastCall![0]
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
      onEntry(probes, { name: 'obj' }, { arg: 'value' })
      onReturn(probes, 'result', { name: 'obj' }, { arg: 'value' }, { local: 'data' })

      const payload = mockBatchAdd.mock.lastCall![0]
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
      onEntry(probes, thisArg, { arg: 'value' })
      onReturn(probes, true, thisArg, { arg: 'value' })

      const payload = mockBatchAdd.mock.lastCall![0]
      const snapshot = payload.debugger.snapshot
      expect(snapshot.captures.entry).toBeUndefined()
      expect(snapshot.captures.return).toBeDefined()
    })

    it('should include duration in snapshot', () => {
      const clock = mockClock()

      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onEntry(probes, thisArg)

      clock.tick(10)

      onReturn(probes, null, thisArg)

      const payload = mockBatchAdd.mock.lastCall![0]
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
      onEntry(probes, thisArg)
      onReturn(probes, null, thisArg)

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
      const payload = mockBatchAdd.mock.lastCall![0]
      const snapshot = payload.debugger.snapshot
      expect(payload.message).toBeUndefined()
      expect(snapshot.evaluationErrors).toEqual([
        {
          expr: 'missing.value',
          message: expect.stringMatching(/^ReferenceError: /),
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
      onEntry(probes, thisArg)
      onReturn(probes, null, thisArg)

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
      const payload = mockBatchAdd.mock.lastCall![0]
      const snapshot = payload.debugger.snapshot
      expect(payload.message).toBeUndefined()
      expect(snapshot.evaluationErrors).toEqual([
        {
          expr: 'missing.value',
          message: expect.stringMatching(/^ReferenceError: /),
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
      onReturn(probes, null, thisArg)
      onEntry(probes, thisArg)
      onReturn(probes, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      clock.tick(5 * 60 * 1000)

      onEntry(probes, thisArg)
      onReturn(probes, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(2)
    })
  })

  describe('onThrow', () => {
    it('should capture this inside arguments.fields for exceptions', () => {
      addProbe(createProbe())

      const self = { name: 'testObj' }
      const args = { a: 1, b: 2 }
      const error = new Error('Test error')
      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onEntry(probes, self, args)
      onThrow(probes, error, self, args)

      const payload = mockBatchAdd.mock.lastCall![0]
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
        stacktrace: expect.any(Array),
      })
      for (const frame of snapshot.captures.return.throwable.stacktrace) {
        expect(frame).toEqual(
          expect.objectContaining({
            fileName: expect.any(String),
            function: expect.any(String),
            lineNumber: expect.any(Number),
            columnNumber: expect.any(Number),
          })
        )
      }
    })

    it('should not capture this for exceptions when it is the global object', () => {
      addProbe(createProbe())

      const args = { a: 1 }
      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onEntry(probes, globalObject, args)
      onThrow(probes, new Error('Test error'), globalObject, args)

      const payload = mockBatchAdd.mock.lastCall![0]
      const snapshot = payload.debugger.snapshot

      expect(snapshot.captures.return.arguments).toEqual({
        a: { type: 'number', value: '1' },
      })
      expect(snapshot.captures.return.throwable).toEqual({
        message: 'Test error',
        stacktrace: expect.any(Array),
      })
    })

    it('should capture exception details', () => {
      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const error = new Error('Test error')
      onEntry(probes, thisArg, { arg: 'value' })
      onThrow(probes, error, thisArg, { arg: 'value' })

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      const payload = mockBatchAdd.mock.lastCall![0]
      const snapshot = payload.debugger.snapshot
      expect(snapshot.captures.return.throwable).toEqual({
        message: 'Test error',
        stacktrace: expect.any(Array),
      })
      for (const frame of snapshot.captures.return.throwable.stacktrace) {
        expect(frame).toEqual(
          expect.objectContaining({
            fileName: expect.any(String),
            function: expect.any(String),
            lineNumber: expect.any(Number),
            columnNumber: expect.any(Number),
          })
        )
      }
    })

    it('should capture non-Error thrown values', () => {
      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onEntry(probes, thisArg)
      onThrow(probes, 'Test error', thisArg)

      const payload = mockBatchAdd.mock.calls[mockBatchAdd.mock.calls.length - 1][0]
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
      onEntry(probes, thisArg)
      onThrow(probes, error, thisArg)

      const payload = mockBatchAdd.mock.calls[mockBatchAdd.mock.calls.length - 1][0]
      const snapshot = payload.debugger.snapshot
      expect(snapshot.captures.return.throwable).toEqual({
        message: 'Iframe error',
        stacktrace: expect.any(Array),
      })
    })

    it('should capture thrown values that cannot be coerced to strings', () => {
      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onEntry(probes, thisArg)
      expect(() => onThrow(probes, Object.create(null), thisArg)).not.toThrow()

      const payload = mockBatchAdd.mock.calls[mockBatchAdd.mock.calls.length - 1][0]
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
      onEntry(probes, {}, {})
      expect(() => onThrow(probes, error, {}, {})).not.toThrow()

      const payload = mockBatchAdd.mock.calls[mockBatchAdd.mock.calls.length - 1][0]
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
      onEntry(probes, {}, {})
      expect(() => onThrow(probes, error, {}, {})).not.toThrow()

      const payload = mockBatchAdd.mock.calls[mockBatchAdd.mock.calls.length - 1][0]
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
      onEntry(probes, thisArg)
      onThrow(probes, error, thisArg)

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
      onEntry(probes, thisArg)
      onThrow(probes, new Error('Test error'), thisArg)

      const payload = mockBatchAdd.mock.calls[mockBatchAdd.mock.calls.length - 1][0]
      const snapshot = payload.debugger.snapshot
      expect(snapshot.captures).toEqual({
        entry: undefined,
        return: {
          captureExpressions: {
            exceptionMessage: { type: 'string', value: 'Test error' },
          },
          throwable: {
            message: 'Test error',
            stacktrace: expect.any(Array),
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
      onEntry(probes, thisArg)
      onThrow(probes, new Error('Test error'), thisArg)

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
      const payload = mockBatchAdd.mock.lastCall![0]
      const snapshot = payload.debugger.snapshot
      expect(payload.message).toBeUndefined()
      expect(snapshot.evaluationErrors).toEqual([
        {
          expr: 'missing.value',
          message: expect.stringMatching(/^ReferenceError: /),
        },
      ])
      expect(snapshot.captures).toBeUndefined()
      expect(snapshot.stack).toBeUndefined()
    })

    it('should handle onThrow without preceding onEntry', () => {
      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      const error = new Error('Test error')
      onThrow(probes, error, thisArg)

      expect(mockBatchAdd).not.toHaveBeenCalled()
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
        onEntry(probes, thisArg)
        onReturn(probes, null, thisArg)
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
        onEntry(probes, thisArg)
        onReturn(probes, null, thisArg)
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
        onEntry(probes, thisArg, { x: i })
        onReturn(probes, null, thisArg, { x: i })
      }

      expect(mockBatchAdd).toHaveBeenCalledTimes(25)
    })
  })

  describe('configured per-second budgets', () => {
    it('should respect configured default snapshot per-probe rate limit', () => {
      initTransport({ maxSnapshotsPerSecondPerProbe: 0.5 })

      addProbe(createProbe({ sampling: undefined }))

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onEntry(probes, thisArg)
      onReturn(probes, null, thisArg)
      onEntry(probes, thisArg)
      onReturn(probes, null, thisArg)

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
      onEntry(probes, thisArg)
      onReturn(probes, null, thisArg)
      onEntry(probes, thisArg)
      onReturn(probes, null, thisArg)

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
      onEntry(probes, thisArg, { x: 1 })
      onReturn(probes, null, thisArg, { x: 1 })
      onEntry(probes, thisArg, { x: 2 })
      onReturn(probes, null, thisArg, { x: 2 })

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
      onEntry(probes, thisArg)
      onReturn(probes, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      // Second invocation: the lifetime budget is now exhausted. No new event should
      // be queued, and the probe should be auto-unregistered.
      onEntry(probes, thisArg)
      onReturn(probes, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
      expect(getProbes(DEFAULT_PROBE_FUNCTION_ID)).toBeUndefined()
    })

    it('should skip snapshot collection once the lifetime budget is exhausted', () => {
      initTransport({ maxSnapshotsPerProbeLifetime: 1 })

      const getterSpy = vi.fn().mockReturnValue('value')
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
      onEntry(probes, thisArg, args)
      onReturn(probes, null, thisArg, args)

      // Second invocation: both onEntry and onReturn detect the exhausted budget
      // up front and skip all capture work — no further reads from args.
      onEntry(probes, thisArg, args)
      onReturn(probes, null, thisArg, args)

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
      onEntry(probes, thisArg)
      onReturn(probes, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      // Second invocation: the lifetime budget is now exhausted. No new event should
      // be queued, and the probe should be auto-unregistered.
      onEntry(probes, thisArg)
      onReturn(probes, null, thisArg)
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
      onEntry(probes, thisArg)
      onEntry(probes, thisArg)

      onReturn(probes, null, thisArg)
      expect(getProbes(DEFAULT_PROBE_FUNCTION_ID)).toBeUndefined()

      // The lifetime budget gates new entries, but already accepted in-flight
      // entries still drain even if another frame exhausts the budget first.
      onReturn(probes, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(2)
    })

    it('should reset the lifetime budget when a new probe version is delivered', () => {
      initTransport({ maxSnapshotsPerProbeLifetime: 1 })

      const probe = createProbe({ sampling: { snapshotsPerSecond: 5000 } })
      addProbe(probe)

      let probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onEntry(probes, thisArg)
      onReturn(probes, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      // The old probe has reached its lifetime budget and was auto-unregistered.
      // After re-add, the new version should have a fresh budget.
      addProbe({ ...probe, version: 1 })

      probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onEntry(probes, thisArg)
      onReturn(probes, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(2)
    })

    it('should not emit any event when the lifetime budget is zero', () => {
      initTransport({ maxSnapshotsPerProbeLifetime: 0 })

      addProbe(createProbe({ sampling: { snapshotsPerSecond: 5000 } }))

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onEntry(probes, thisArg)
      onReturn(probes, null, thisArg)

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
      onEntry(probes, thisArg)
      onReturn(probes, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(2)

      // Second invocation: probeA's pre-call check now fails and it is queued for
      // removal. probeB must still be processed in the same iteration even though
      // probeA gets spliced out of the probes array.
      mockBatchAdd.mockClear()
      const probesAfterFirst = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onEntry(probesAfterFirst, thisArg)
      onReturn(probesAfterFirst, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
      expect(getProbes(DEFAULT_PROBE_FUNCTION_ID)).toEqual([expect.objectContaining({ id: 'sibling-probe-b' })])

      // probeB's stack entry must not leak: a third onReturn without onEntry is a no-op.
      mockBatchAdd.mockClear()
      const remainingProbes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onReturn(remainingProbes, null, thisArg)
      expect(mockBatchAdd).not.toHaveBeenCalled()
    })
  })

  describe('active entries cleanup', () => {
    it('should drain in-flight entries through the removed probe instance', () => {
      const probe = createProbe()
      addProbe(probe)

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onEntry(probes, thisArg)

      removeProbe(probe.id)
      onReturn(probes, null, thisArg)

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
    })

    it('should isolate in-flight entries from a replacement probe with the same id', () => {
      const probe = createProbe()
      addProbe(probe)

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onEntry(probes, thisArg)

      removeProbe(probe.id)
      addProbe(createProbe({ id: probe.id }))

      const newProbes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onReturn(newProbes, null, thisArg)

      expect(mockBatchAdd).not.toHaveBeenCalled()
    })

    it('should discard in-flight entries when all probes are cleared', () => {
      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onEntry(probes, thisArg)

      clearProbes()
      addProbe(createProbe())

      const newProbes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onReturn(newProbes, null, thisArg)

      expect(mockBatchAdd).not.toHaveBeenCalled()
    })

    it('should not leak active entries after onReturn completes', () => {
      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onEntry(probes, thisArg)
      onReturn(probes, null, thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      mockBatchAdd.mockClear()

      // A second onReturn without onEntry should not produce a snapshot
      onReturn(probes, null, thisArg)
      expect(mockBatchAdd).not.toHaveBeenCalled()
    })

    it('should not leak active entries after onThrow completes', () => {
      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onEntry(probes, thisArg)
      onThrow(probes, new Error('test'), thisArg)
      expect(mockBatchAdd).toHaveBeenCalledTimes(1)

      mockBatchAdd.mockClear()

      // A second onThrow without onEntry should not produce a snapshot
      onThrow(probes, new Error('test'), thisArg)
      expect(mockBatchAdd).not.toHaveBeenCalled()
    })
  })

  describe('snapshot timeout', () => {
    it('should drop snapshot when entry capture exceeds timeout', () => {
      addProbe(createProbe({ sampling: { snapshotsPerSecond: 5000 } }))

      let callCount = 0
      const realNow = performance.now.bind(performance)
      vi.spyOn(performance, 'now').mockImplementation(() => {
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
      onEntry(probes, thisArg, { arg: deepObj })
      onReturn(probes, null, thisArg, { arg: deepObj })

      // The entry capture timed out, so onEntry pushed null.
      // onReturn still gets an active entry from its own onEntry call, but
      // the entry snapshot is dropped. The return capture has its own timeout.
      // Since performance.now is still returning future values, the return
      // capture also times out and no snapshot is sent.
      expect(mockBatchAdd).not.toHaveBeenCalled()
    })

    it('should drop snapshot when return capture exceeds timeout', () => {
      addProbe(createProbe({ sampling: { snapshotsPerSecond: 5000 } }))

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!

      // Let onEntry succeed with real time
      onEntry(probes, thisArg, { x: 1 })

      // Now make performance.now jump forward so the return capture times out
      let callCount = 0
      const realNow = performance.now.bind(performance)
      vi.spyOn(performance, 'now').mockImplementation(() => {
        callCount++
        if (callCount <= 2) {
          return realNow()
        }
        return realNow() + 20
      })

      onReturn(probes, null, thisArg, { x: 1 }, { local: 'value' })

      expect(mockBatchAdd).not.toHaveBeenCalled()
    })

    it('should drop snapshot when throw capture exceeds timeout', () => {
      addProbe(createProbe({ sampling: { snapshotsPerSecond: 5000 } }))

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!

      // Let onEntry succeed with real time
      onEntry(probes, thisArg, { x: 1 })

      // Now make performance.now jump forward so the throw capture times out
      let callCount = 0
      const realNow = performance.now.bind(performance)
      vi.spyOn(performance, 'now').mockImplementation(() => {
        callCount++
        if (callCount <= 2) {
          return realNow()
        }
        return realNow() + 20
      })

      onThrow(probes, new Error('test'), thisArg, { x: 1 })

      expect(mockBatchAdd).not.toHaveBeenCalled()
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
      vi.spyOn(performance, 'now').mockImplementation(() => {
        callCount++
        if (callCount <= 2) {
          return realNow()
        }
        return realNow() + 20
      })

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onEntry(probes, thisArg)
      onReturn(probes, null, thisArg)

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
    })

    it('should not leak active entries when entry capture times out', () => {
      addProbe(createProbe({ sampling: { snapshotsPerSecond: 5000 } }))

      let shouldTimeout = true
      let callCount = 0
      const realNow = performance.now.bind(performance)
      vi.spyOn(performance, 'now').mockImplementation(() => {
        callCount++
        if (!shouldTimeout || callCount <= 3) {
          return realNow()
        }
        return realNow() + 20
      })

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      // This onEntry will time out and push null
      onEntry(probes, thisArg, { x: 1 })

      // onReturn should handle the null entry gracefully (no snapshot sent)
      shouldTimeout = false
      callCount = 0
      onReturn(probes, null, thisArg, { x: 1 })

      expect(mockBatchAdd).not.toHaveBeenCalled()
    })

    it('should skip subsequent snapshot probes after timeout but still process non-snapshot probes', () => {
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
      vi.spyOn(performance, 'now').mockImplementation(() => {
        callCount++
        if (callCount <= 3) {
          return realNow()
        }
        return realNow() + 20
      })

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onEntry(probes, thisArg, { x: 1 })
      onReturn(probes, null, thisArg, { x: 1 })

      // The non-snapshot probe should still send, but both snapshot probes should be dropped
      const calls = mockBatchAdd.mock.calls
      expect(calls.length).toBe(1)
      expect(calls[0][0].debugger.snapshot.probe.id).toBe(nonSnapshotProbe.id)
    })

    it('should share deadline across probes so second snapshot probe exits immediately', () => {
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
      vi.spyOn(performance, 'now').mockImplementation(() => {
        callCount++
        if (callCount <= 3) {
          return realNow()
        }
        return realNow() + 20
      })

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      onEntry(probes, thisArg, { x: 1 })
      onReturn(probes, null, thisArg, { x: 1 })

      // Both snapshot probes share the deadline -- neither should send
      expect(mockBatchAdd).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should handle missing DD_RUM gracefully', () => {
      delete (window as any).DD_RUM

      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      expect(() => {
        onEntry(probes, thisArg)
        onReturn(probes, null, thisArg)
      }).not.toThrow()

      expect(mockBatchAdd).toHaveBeenCalledTimes(1)
    })

    it('should handle uninitialized debugger transport gracefully', () => {
      resetDebuggerTransport()

      addProbe(createProbe())

      const probes = getProbes(DEFAULT_PROBE_FUNCTION_ID)!
      expect(() => {
        onEntry(probes, thisArg)
        onReturn(probes, null, thisArg)
      }).not.toThrow()
      expect(warnSpy).toHaveBeenCalledWith(
        'Transport is not initialized. Make sure DD_DEBUGGER.init() has been called.'
      )
    })
  })
})
