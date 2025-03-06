import { createRumSessionManagerMock, mockProfiler, mockRumConfiguration, mockViewHistory } from '../../../test'
import { LifeCycle } from '../lifeCycle'
import { startProfilingCollection } from './profilingCollection'
import { mockedTrace } from './test-utils/mockedTrace'
import { transport } from './transport/transport'

describe('profiling collection', () => {
  let sendProfileSpy: jasmine.Spy
  beforeEach(() => {
    // Spy on transport.sendProfile to avoid sending data to the server, and check what's sent.
    sendProfileSpy = spyOn(transport, 'sendProfile')
  })

  let lifeCycle = new LifeCycle()

  function setupProfilingCollection() {
    // ;({ notifyPerformanceEntries } = mockPerformanceObserver())
    const sessionManager = createRumSessionManagerMock().setId('session-id-1')
    const viewHistory = mockViewHistory({
      id: 'view-id-1',
    })
    lifeCycle = new LifeCycle()

    // Replace Browser's Profiler with a mock for testing purpose.
    mockProfiler(mockedTrace)

    // Start collection of profile.
    const collector = startProfilingCollection(
      mockRumConfiguration({ trackLongTasks: true, profilingSampleRate: 100 }),
      lifeCycle,
      sessionManager,
      true,
      viewHistory,
      // Overrides default configuration for testing purpose.
      {
        sampleIntervalMs: 10,
        collectIntervalMs: 60000, // 1min
        minNumberOfSamples: 0,
        minProfileDurationMs: 0,
      }
    )

    return collector
  }

  it('should start profiling collection and collect data on stop', async () => {
    const collector = setupProfilingCollection()

    // Wait for start of collection.
    await waitForBoolean(() => collector.isStarted())

    // Stop collection of profile.
    collector.stop()

    // Wait for stop of collection.
    await waitForBoolean(() => collector.isStopped())

    expect(sendProfileSpy).toHaveBeenCalledTimes(1)

    // Check the the sendProfilesSpy was called with the mocked trace
    expect(sendProfileSpy).toHaveBeenCalledWith(mockedTrace, jasmine.any(Object), jasmine.any(String), 'session-id-1')
  })
})

function waitForBoolean(booleanCallback: () => boolean) {
  return new Promise<void>((resolve) => {
    function poll() {
      if (booleanCallback()) {
        resolve()
      } else {
        setTimeout(() => poll(), 50)
      }
    }
    poll()
  })
}
