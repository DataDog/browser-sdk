import { deepClone, globalObject } from '@datadog/js-core/util'
import type { Profiler, ProfilerConstructor } from '@datadog/js-core/util'
import { clocksNow } from '@datadog/js-core/time'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { mockProfiler } from '../../../test'
import { EARLY_PROFILER_GLOBAL_NAME } from './earlyProfilerConstants'
import { readEarlyProfilerSnippet } from './earlyProfilerSnippet'
import { mockedTrace } from './test-utils/mockedTrace'

interface MockProfilerInstance extends Profiler {
  stopped: boolean
}

describe('earlyProfilerSnippet', () => {
  function setEarlyProfilerSnippet(profiler: unknown, startClocks: unknown) {
    ;(globalObject as unknown as { [key: string]: unknown })[EARLY_PROFILER_GLOBAL_NAME] = { profiler, startClocks }
  }

  function getEarlyProfilerSnippet() {
    return (globalObject as unknown as { [key: string]: unknown })[EARLY_PROFILER_GLOBAL_NAME]
  }

  function createMockProfilerInstance() {
    const ProfilerConstructor = globalObject.Profiler as ProfilerConstructor
    return new ProfilerConstructor({ sampleInterval: 10, maxBufferSize: 9000 }) as unknown as MockProfilerInstance
  }

  beforeEach(() => {
    mockProfiler(deepClone(mockedTrace))
    registerCleanupTask(() => {
      delete (globalObject as unknown as { [key: string]: unknown })[EARLY_PROFILER_GLOBAL_NAME]
    })
  })

  it('returns the snippet Profiler instance with its start clocks and deletes the global', () => {
    const snippetProfiler = createMockProfilerInstance()
    const snippetStartClocks = clocksNow()
    setEarlyProfilerSnippet(snippetProfiler, snippetStartClocks)

    const takeover = readEarlyProfilerSnippet()

    expect(takeover).toEqual({ profiler: snippetProfiler, startClocks: snippetStartClocks })
    expect(getEarlyProfilerSnippet()).toBeUndefined()
  })

  it('returns undefined when the snippet did not run or failed', () => {
    // The snippet leaves the global undefined when the Profiler API is not
    // available or the `Document-Policy: js-profiling` header is missing.
    expect(readEarlyProfilerSnippet()).toBeUndefined()
  })

  it('returns undefined when the snippet Profiler instance was already stopped', () => {
    const snippetProfiler = createMockProfilerInstance()
    snippetProfiler.stopped = true
    setEarlyProfilerSnippet(snippetProfiler, clocksNow())

    expect(readEarlyProfilerSnippet()).toBeUndefined()
  })

  it('returns undefined when the snippet global shape is invalid', () => {
    const snippetProfiler = createMockProfilerInstance()
    // Invalid startClocks: ignored, the profiler chunk starts its own instance.
    setEarlyProfilerSnippet(snippetProfiler, 'not clocks')
    expect(readEarlyProfilerSnippet()).toBeUndefined()
    // A global without a Profiler instance is ignored as well.
    ;(globalObject as unknown as { [key: string]: unknown })[EARLY_PROFILER_GLOBAL_NAME] = { foo: 'bar' }
    expect(readEarlyProfilerSnippet()).toBeUndefined()
    // Invalid globals are left untouched: they are not ours to manage.
    expect(getEarlyProfilerSnippet()).toEqual({ foo: 'bar' })
  })
})
