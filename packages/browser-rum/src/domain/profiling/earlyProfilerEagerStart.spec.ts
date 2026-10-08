import { deepClone, globalObject } from '@datadog/js-core/util'
import type { Profiler } from '@datadog/js-core/util'
import { clocksNow } from '@datadog/js-core/time'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { mockProfiler } from '../../../test'
import { EARLY_PROFILER_GLOBAL_NAME } from './earlyProfilerConstants'
import { startEarlyProfiler } from './earlyProfilerEagerStart'
import { mockedTrace } from './test-utils/mockedTrace'

interface EarlyProfilerGlobalShape {
  readonly profiler: Profiler
  readonly startClocks: { readonly relative: number; readonly timeStamp: number }
}

function getEarlyProfilerGlobal(): unknown {
  return (globalObject as unknown as { [key: string]: unknown })[EARLY_PROFILER_GLOBAL_NAME]
}

function deleteEarlyProfilerGlobal(): void {
  delete (globalObject as unknown as { [key: string]: unknown })[EARLY_PROFILER_GLOBAL_NAME]
}

describe('startEarlyProfiler', () => {
  const startClocksBeforeStart = clocksNow()

  beforeEach(() => {
    mockProfiler(deepClone(mockedTrace))
    registerCleanupTask(deleteEarlyProfilerGlobal)
  })

  it('starts a Profiler instance and exposes it through the early profiler global', () => {
    startEarlyProfiler()

    const rawGlobal = getEarlyProfilerGlobal() as EarlyProfilerGlobalShape
    expect(rawGlobal).toBeDefined()
    expect(rawGlobal.profiler.stopped).toBe(false)
    expect(rawGlobal.profiler.sampleInterval).toBe(10)
    expect(rawGlobal.startClocks.relative).toBeGreaterThan(startClocksBeforeStart.relative)
    expect(rawGlobal.startClocks.timeStamp).toBeGreaterThan(startClocksBeforeStart.timeStamp)
  })

  it('keeps the early profiler instance started by the snippet', () => {
    const snippetProfiler = new (globalObject.Profiler as new (options: unknown) => Profiler)({
      sampleInterval: 10,
      maxBufferSize: 9000,
    })
    const snippetStartClocks = clocksNow()
    ;(globalObject as unknown as { [key: string]: unknown })[EARLY_PROFILER_GLOBAL_NAME] = {
      profiler: snippetProfiler,
      startClocks: snippetStartClocks,
    }

    startEarlyProfiler()

    expect(getEarlyProfilerGlobal()).toEqual({
      profiler: snippetProfiler,
      startClocks: snippetStartClocks,
    })
  })

  it('leaves the global undefined when the Profiler API is not available', () => {
    const originalProfiler = globalObject.Profiler
    globalObject.Profiler = undefined

    try {
      startEarlyProfiler()
    } finally {
      globalObject.Profiler = originalProfiler
    }

    expect(getEarlyProfilerGlobal()).toBeUndefined()
  })
})
