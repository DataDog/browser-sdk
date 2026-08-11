import { relativeNow, timeStampNow } from '@datadog/js-core/time'
import { createIdentityEncoder } from '@datadog/browser-core'
import { interceptRequests, DEFAULT_FETCH_MOCK, readFormDataRequest } from '@datadog/browser-core/test'
import { LifeCycle } from '@datadog/browser-rum-core'
import { mockRumConfiguration } from '@datadog/browser-rum-core/test'
import { mockedTrace } from '../test-utils/mockedTrace'
import { createFormDataEmitter } from './formDataEmitter'

describe('createFormDataEmitter', () => {
  let interceptor: ReturnType<typeof interceptRequests>

  beforeEach(() => {
    interceptor = interceptRequests()
    interceptor.withFetch(DEFAULT_FETCH_MOCK)
  })

  it('sends a FormData request with event and wall-time.json parts', async () => {
    const lifeCycle = new LifeCycle()
    const emit = createFormDataEmitter(mockRumConfiguration(), lifeCycle, createIdentityEncoder)

    emit({
      profile: {
        application: { id: 'app-id' },
        attachments: ['wall-time.json'],
        start: '2024-01-01T00:00:00.000Z',
        end: '2024-01-01T00:01:00.000Z',
        family: 'chrome',
        runtime: 'chrome',
        format: 'json',
        version: 4,
        tags_profiler: 'sdk_version:1.0.0',
        _dd: { clock_drift: 0 },
      },
      trace: {
        ...mockedTrace,
        startClocks: { relative: relativeNow(), timeStamp: timeStampNow() },
        endClocks: { relative: relativeNow(), timeStamp: timeStampNow() },
        clocksOrigin: { relative: 0, timeStamp: 0 },
        sampleInterval: 10,
        longTasks: [],
        views: [],
        actions: [],
        vitals: [],
      },
    })
    await Promise.resolve() // wait for encode() to complete
    expect(interceptor.requests.length).toBe(1)
    const formData = await readFormDataRequest<{ event: any; 'wall-time.json': any }>(interceptor.requests[0])
    expect(formData.event).toBeDefined()
    expect(formData['wall-time.json']).toBeDefined()
  })
})
