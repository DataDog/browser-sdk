import { computeStackTrace } from '@datadog/browser-core'
import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import type { Clock } from '@datadog/browser-core/test'
import type { BrowserWindow } from '../entries/main'
import { initDebuggerTransport, resetDebuggerTransport } from './api'
import {
  collectExceptionReplay,
  onCatch,
  registerExceptionReplayPlugin,
  resetExceptionReplay,
  sendExceptionReplay,
  startExceptionReplay,
} from './exceptionReplay'
import { checkGlobalSnapshotBudget, clearProbes } from './probes'

const browserWindow = window as BrowserWindow

interface SentSnapshot {
  id: string
  exceptionId: string
  probe: { location: { type: string; method: string } }
  captures: { return: { arguments: Record<string, unknown>; throwable: { message: string } } }
}

describe('exceptionReplay', () => {
  let mockBatchAdd: jasmine.Spy

  function initTransport(overrides: Record<string, unknown> = {}) {
    resetDebuggerTransport()
    initDebuggerTransport(
      { service: 'test-service', env: 'test-env', ...overrides } as any,
      { add: mockBatchAdd } as any
    )
  }

  // The functions below stand in for instrumented code: the build plugin calls `$dd_catch` from the
  // catch block it wraps around each function body, then rethrows.

  function throwingFunction(value: number, secret?: string) {
    try {
      throw new Error(`boom ${value}`)
    } catch (e) {
      onCatch('src/throwing.ts;throwingFunction', e, undefined, { value, secret })
      throw e
    }
  }

  function callingFunction(a: number, b: number) {
    try {
      return throwingFunction(a + b)
    } catch (e) {
      onCatch('src/calling.ts;callingFunction', e, undefined, { a, b })
      throw e
    }
  }

  function outerFunction() {
    try {
      return callingFunction(1, 2)
    } catch (e) {
      onCatch('src/outer.ts;outerFunction', e, undefined, {})
      throw e
    }
  }

  function outermostFunction() {
    try {
      return outerFunction()
    } catch (e) {
      onCatch('src/outermost.ts;outermostFunction', e, undefined, {})
      throw e
    }
  }

  // Reading its argument advances the clock, like a capture that takes `ms` and can't be interrupted
  function slowFunction(clock: Clock, ms: number) {
    const args = {
      get value() {
        clock.tick(ms)
        return 1
      },
    }
    try {
      throw new Error('slow')
    } catch (e) {
      onCatch('src/slow.ts;slowFunction', e, undefined, args)
      throw e
    }
  }

  function catchError(fn: () => unknown): unknown {
    let error: unknown
    try {
      fn()
    } catch (e) {
      error = e
    }
    expect(error).toBeDefined()
    return error
  }

  // Like RUM: assemble the error event, then collect it
  function reportError(error: unknown) {
    const attributes = collectExceptionReplay(error)
    sendExceptionReplay(error)
    return attributes
  }

  // Whether, once an async function resumes, its stack shows the function awaiting it on the line
  // of its `await`
  async function hasAsyncCallersOnAwaitLine(): Promise<boolean> {
    async function resumedFunction() {
      await Promise.resolve()
      return computeStackTrace(new Error()).stack
    }
    async function awaitingCaller() {
      return [computeStackTrace(new Error()).stack[0].line, await resumedFunction()] as const
    }
    const [awaitLine, resumedFrames] = await awaitingCaller()
    return resumedFrames.some((frame) => frame.func?.includes('awaitingCaller') && frame.line === awaitLine)
  }

  function stackIndexOf(error: unknown, functionName: string): number {
    return computeStackTrace(error).stack.findIndex((frame) => frame.func?.includes(functionName))
  }

  function sentSnapshots(): SentSnapshot[] {
    return mockBatchAdd.calls
      .allArgs()
      .map(([payload]) => (payload as { debugger: { snapshot: SentSnapshot } }).debugger.snapshot)
  }

  beforeEach(() => {
    clearProbes()
    mockBatchAdd = jasmine.createSpy('batchAdd')
    initTransport()
    ;(window as any).DD_DEBUGGER = { version: '0.0.1' }
    registerExceptionReplayPlugin(() => true)
    startExceptionReplay()

    registerCleanupTask(() => {
      delete (window as any).DD_DEBUGGER
      resetExceptionReplay()
      resetDebuggerTransport()
      clearProbes()
    })
  })

  describe('catch hook installation', () => {
    beforeEach(() => {
      resetExceptionReplay()
    })

    it('should install the catch hook once the plugin is registered and the debugger is started', () => {
      registerExceptionReplayPlugin(() => true)
      expect(browserWindow.$dd_catch).toBeUndefined()

      startExceptionReplay()
      expect(browserWindow.$dd_catch).toBe(onCatch)
    })

    it('should install the catch hook when the debugger starts before the plugin is registered', () => {
      startExceptionReplay()
      expect(browserWindow.$dd_catch).toBeUndefined()

      registerExceptionReplayPlugin(() => true)
      expect(browserWindow.$dd_catch).toBe(onCatch)
    })
  })

  it('should send a snapshot for each captured frame, and link them to the reported error', () => {
    const error = catchError(() => callingFunction(1, 2))

    const attributes = reportError(error)!

    expect(attributes.frames.map(({ index }) => index)).toEqual([
      stackIndexOf(error, 'throwingFunction'),
      stackIndexOf(error, 'callingFunction'),
    ])
    const snapshots = sentSnapshots()
    expect(snapshots.map(({ id }) => id)).toEqual(attributes.frames.map(({ snapshotId }) => snapshotId))
    expect(snapshots.map(({ exceptionId }) => exceptionId)).toEqual([attributes.exceptionId, attributes.exceptionId])
  })

  it('should capture the arguments of each frame', () => {
    const error = catchError(() => callingFunction(1, 2))

    reportError(error)

    const [throwingSnapshot, callingSnapshot] = sentSnapshots()
    expect(throwingSnapshot.probe.location).toEqual({ type: 'src/throwing.ts', method: 'throwingFunction' })
    expect(throwingSnapshot.captures.return.arguments.value).toEqual({ type: 'number', value: '3' })
    expect(throwingSnapshot.captures.return.throwable.message).toBe('boom 3')
    expect(callingSnapshot.probe.location).toEqual({ type: 'src/calling.ts', method: 'callingFunction' })
    expect(callingSnapshot.captures.return.arguments).toEqual(
      jasmine.objectContaining({ a: { type: 'number', value: '1' }, b: { type: 'number', value: '2' } })
    )
  })

  it('should send snapshots in the same envelope as probe snapshots', () => {
    const error = catchError(() => throwingFunction(1))

    reportError(error)

    const payload = mockBatchAdd.calls.mostRecent().args[0]
    expect(payload).toEqual(
      jasmine.objectContaining({
        message: 'Error: boom 1',
        service: 'test-service',
        ddtags: jasmine.stringContaining('env:test-env'),
        logger: jasmine.objectContaining({ name: 'src/throwing.ts', method: 'throwingFunction', version: '0.0.1' }),
      })
    )
    expect(payload.debugger.snapshot).toEqual(
      jasmine.objectContaining({
        language: 'javascript',
        probe: { id: jasmine.any(String), version: 0, location: jasmine.any(Object) },
        stack: jasmine.arrayContaining([
          jasmine.objectContaining({ function: jasmine.stringContaining('throwingFunction') }),
        ]),
      })
    )
  })

  it('should redact sensitive arguments', () => {
    const error = catchError(() => throwingFunction(1, 'hunter2'))

    reportError(error)

    expect(sentSnapshots()[0].captures.return.arguments.secret).toEqual({
      type: 'string',
      notCapturedReason: 'redactedIdent',
    })
  })

  it('should only capture the three innermost frames', () => {
    const error = catchError(outermostFunction)

    const attributes = reportError(error)!

    expect(attributes.frames.map(({ index }) => index)).toEqual([
      stackIndexOf(error, 'throwingFunction'),
      stackIndexOf(error, 'callingFunction'),
      stackIndexOf(error, 'outerFunction'),
    ])
  })

  it('should capture async functions', async () => {
    async function asyncThrowingFunction() {
      try {
        await Promise.resolve()
        throw new Error('async boom')
      } catch (e) {
        onCatch('src/async.ts;asyncThrowingFunction', e, undefined, {})
        throw e
      }
    }

    const error = await asyncThrowingFunction().then(
      () => undefined,
      (e: unknown) => e
    )

    const attributes = reportError(error)!

    // The error is created in `asyncThrowingFunction`, so its frame is the innermost one. Some
    // browsers, like Safari 14, leave the function's name out of the stack after an `await`.
    expect(attributes.frames[0].index).toBe(0)
  })

  it('should capture an async function awaiting a callee that throws before its first await', async () => {
    async function asyncCallee(value: number) {
      try {
        if (value > 0) {
          throw new Error('boom')
        }
        await Promise.resolve()
      } catch (e) {
        onCatch('src/async.ts;asyncCallee', e, undefined, { value })
        throw e
      }
    }
    async function asyncCaller() {
      try {
        await asyncCallee(1)
      } catch (e) {
        onCatch('src/async.ts;asyncCaller', e, undefined, {})
        throw e
      }
    }
    let error: unknown
    async function awaitingFunction() {
      try {
        await asyncCaller()
      } catch (e) {
        error = e
      }
    }

    await awaitingFunction()
    const attributes = reportError(error)!

    const indexes = attributes.frames.map(({ index }) => index)
    // `asyncCallee` throws before its first `await`, so its frame is the innermost one. Once
    // `asyncCaller` resumes, its stack shows `awaitingFunction` as an async frame located at the
    // `await`, while the error's stack has it at the call. Browsers that don't show it on that line,
    // or don't show it at all, leave `asyncCaller` without a snapshot, but never put it elsewhere.
    if (await hasAsyncCallersOnAwaitLine()) {
      expect(indexes).toEqual([0, 1])
    } else {
      expect([[0], [0, 1]]).toContain(indexes)
    }
  })

  it('should not link a function without callers to an unrelated frame of the same script', async () => {
    function rejectLater() {
      return new Promise((_, reject) => {
        setTimeout(function timerCallback() {
          reject(new Error('boom'))
        })
      })
    }
    async function awaitingFunction() {
      try {
        await rejectLater()
      } catch (e) {
        onCatch('src/async.ts;awaitingFunction', e, undefined, {})
        throw e
      }
    }

    // Not awaited, so `awaitingFunction` has no callers once it resumes
    const error = await new Promise((resolve) => {
      awaitingFunction().catch(resolve)
    })

    // The error's only frame is `timerCallback`, from the same script as `awaitingFunction`
    expect(reportError(error)).toBeUndefined()
  })

  it('should not link an unnamed function without callers to a named frame of the same script', async () => {
    function rejectLater() {
      return new Promise((_, reject) => {
        setTimeout(function timerCallback() {
          reject(new Error('boom'))
        })
      })
    }

    // An anonymous function defined after `timerCallback`, with no callers once it resumes
    const error = await new Promise((resolve) => {
      ;(async () => {
        try {
          await rejectLater()
        } catch (e) {
          onCatch('src/async.ts;<anonymous>', e, undefined, {})
          throw e
        }
      })().catch(resolve)
    })

    expect(reportError(error)).toBeUndefined()
  })

  it('should not send snapshots for exceptions that are not reported', () => {
    catchError(() => callingFunction(1, 2))

    expect(mockBatchAdd).not.toHaveBeenCalled()
  })

  it('should only send snapshots once RUM collects the error event', () => {
    const error = catchError(() => callingFunction(1, 2))

    const attributes = collectExceptionReplay(error)!
    expect(mockBatchAdd).not.toHaveBeenCalled()

    sendExceptionReplay(error)
    expect(sentSnapshots().map(({ id }) => id)).toEqual(attributes.frames.map(({ snapshotId }) => snapshotId))
  })

  it('should not send snapshots for an error event that RUM drops', () => {
    const dropped = catchError(() => throwingFunction(1))
    expect(collectExceptionReplay(dropped)).toBeDefined()

    expect(mockBatchAdd).not.toHaveBeenCalled()
    // The fingerprint wasn't reported, so it isn't cooling down
    expect(reportError(catchError(() => throwingFunction(2)))).toBeDefined()
  })

  it('should send the snapshots of an error once RUM collects it, after dropping it once', () => {
    const error = catchError(() => throwingFunction(1))
    const attributes = collectExceptionReplay(error)!

    expect(reportError(error)).toBe(attributes)
    expect(sentSnapshots().map(({ id }) => id)).toEqual(attributes.frames.map(({ snapshotId }) => snapshotId))
  })

  it('should not send the snapshots of a dropped error once another error with its fingerprint is reported', () => {
    const dropped = catchError(() => throwingFunction(1))
    expect(collectExceptionReplay(dropped)).toBeDefined()
    expect(reportError(catchError(() => throwingFunction(2)))).toBeDefined()
    mockBatchAdd.calls.reset()

    expect(reportError(dropped)).toBeUndefined()
    expect(mockBatchAdd).not.toHaveBeenCalled()
  })

  it('should not capture exceptions in sessions that RUM does not track', () => {
    resetExceptionReplay()
    registerExceptionReplayPlugin(() => false)
    startExceptionReplay()

    expect(reportError(catchError(() => throwingFunction(1)))).toBeUndefined()
  })

  it('should reuse the same snapshots when an error is reported twice', () => {
    const error = catchError(() => callingFunction(1, 2))

    const attributes = reportError(error)
    const callCount = mockBatchAdd.calls.count()

    expect(reportError(error)).toBe(attributes)
    expect(mockBatchAdd.calls.count()).toBe(callCount)
  })

  it('should stop capturing frames once the exception is reported', () => {
    let error: unknown
    function reportingFunction() {
      try {
        throwingFunction(1)
      } catch (e) {
        error = e
        reportError(e)
        onCatch('src/reporting.ts;reportingFunction', e, undefined, {})
      }
    }

    reportingFunction()

    expect(reportError(error)!.frames.length).toBe(1)
    expect(mockBatchAdd).toHaveBeenCalledTimes(1)
  })

  it('should return undefined for errors without captured frames', () => {
    expect(reportError(new Error('not thrown through instrumented code'))).toBeUndefined()
    expect(reportError(undefined)).toBeUndefined()
  })

  it('should not capture thrown objects that are not errors', () => {
    // RUM doesn't report the stack of an object that isn't an `Error`, even if it has one
    const thrown = { message: 'boom', stack: new Error('boom').stack }

    onCatch('src/throwing.ts;throwingFunction', thrown, undefined, {})

    expect(reportError(thrown)).toBeUndefined()
  })

  it('should ignore thrown values that are not objects', () => {
    expect(() => onCatch('src/throwing.ts;throwingFunction', 'boom', undefined, {})).not.toThrow()

    expect(reportError('boom')).toBeUndefined()
  })

  it('should skip frames that are not in the error stack', () => {
    const preparedError = new Error('created before being thrown')
    function rethrowingFunction() {
      try {
        throw preparedError
      } catch (e) {
        onCatch('src/rethrowing.ts;rethrowingFunction', e, undefined, {})
        throw e
      }
    }

    const error = catchError(rethrowingFunction)

    expect(reportError(error)).toBeUndefined()
    expect(mockBatchAdd).not.toHaveBeenCalled()
  })

  it('should not report snapshots when the debugger transport is not initialized', () => {
    const error = catchError(() => throwingFunction(1))
    resetDebuggerTransport()

    expect(reportError(error)).toBeUndefined()
  })

  it('should neither use nor be limited by the snapshot budget of probes', () => {
    initTransport({ maxSnapshotsPerSecondGlobally: 1 })
    const error = catchError(() => callingFunction(1, 2))

    expect(reportError(error)!.frames.length).toBe(2)
    expect(checkGlobalSnapshotBudget(performance.now(), true)).toBeTrue()
  })

  it('should not capture an exception with the same fingerprint for an hour after reporting it', () => {
    const clock = mockClock()

    reportError(catchError(() => throwingFunction(1)))
    expect(reportError(catchError(() => throwingFunction(2)))).toBeUndefined()

    clock.tick(60 * 60 * 1000 + 1)
    expect(reportError(catchError(() => throwingFunction(3)))).toBeDefined()
  })

  it('should only report one of the exceptions with the same fingerprint captured before either is reported', () => {
    const first = catchError(() => throwingFunction(1))
    const second = catchError(() => throwingFunction(2))

    expect(reportError(first)).toBeDefined()
    expect(reportError(second)).toBeUndefined()
    expect(mockBatchAdd).toHaveBeenCalledTimes(1)
  })

  it('should keep capturing an exception that was never reported', () => {
    catchError(() => throwingFunction(1))

    expect(reportError(catchError(() => throwingFunction(2)))).toBeDefined()
  })

  it('should limit the number of exceptions captured per second', () => {
    const clock = mockClock()
    function typeErrorFunction() {
      try {
        throw new TypeError('boom')
      } catch (e) {
        onCatch('src/type-error.ts;typeErrorFunction', e, undefined, {})
        throw e
      }
    }
    const errors = Array.from({ length: 11 }, (_, i) => catchError(() => throwingFunction(i)))

    expect(reportError(errors[10])).toBeUndefined()
    expect(reportError(errors[9])).toBeDefined()
    expect(reportError(catchError(typeErrorFunction))).toBeUndefined()

    clock.tick(1001)
    expect(reportError(catchError(typeErrorFunction))).toBeDefined()
  })

  it('should stop capturing the frames of an exception once the capture time budget is used up', () => {
    const clock = mockClock()
    function callingSlowFunction() {
      try {
        return slowFunction(clock, 30)
      } catch (e) {
        onCatch('src/calling-slow.ts;callingSlowFunction', e, undefined, {})
        throw e
      }
    }

    expect(reportError(catchError(callingSlowFunction))!.frames.length).toBe(1)
  })

  it('should charge the capture time budget when capturing throws', () => {
    const clock = mockClock()
    const args = new Proxy(
      {},
      {
        ownKeys() {
          clock.tick(75)
          throw new Error('ownKeys')
        },
      }
    )
    function throwingWhileCapturing() {
      try {
        throw new Error('boom')
      } catch (e) {
        onCatch('src/proxy.ts;throwingWhileCapturing', e, undefined, args)
        throw e
      }
    }

    catchError(throwingWhileCapturing)
    clock.tick(1500)

    expect(reportError(catchError(() => throwingFunction(1)))).toBeUndefined()
  })

  it('should pause capturing until the time spent beyond the capture time budget is made up', () => {
    const clock = mockClock()
    // 75 ms puts the 25 ms budget 50 ms in debt, which takes 2 s to make up
    expect(reportError(catchError(() => slowFunction(clock, 75)))).toBeDefined()

    clock.tick(1500)
    expect(reportError(catchError(() => throwingFunction(1)))).toBeUndefined()

    clock.tick(600)
    expect(reportError(catchError(() => throwingFunction(2)))).toBeDefined()
  })
})
