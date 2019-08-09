import sinon from 'sinon'

import { Configuration } from '../../core/configuration'

import {
  handlePaintEntry,
  handleResourceEntry,
  pageViewId,
  PerformancePaintTiming,
  RumBatch,
  RumEvent,
  RumEventCategory,
  RumResourceEvent,
  trackPageView,
  trackPerformanceTiming,
} from '../rum'

function getEntry(batch: RumBatch, index: number) {
  return (batch.add as jasmine.Spy).calls.argsFor(index)[0] as RumEvent
}

const configuration = {
  internalMonitoringEndpoint: 'monitoring',
  logsEndpoint: 'logs',
  rumEndpoint: 'rum',
}

describe('rum handle performance entry', () => {
  let batch: Partial<RumBatch>

  beforeEach(() => {
    batch = {
      add: jasmine.createSpy(),
    }
  })
  ;[
    {
      description: 'type resource + logs endpoint',
      entry: { entryType: 'resource', name: configuration.logsEndpoint },
      expectEntryToBeAdded: false,
    },
    {
      description: 'type resource + internal monitoring endpoint',
      entry: { entryType: 'resource', name: configuration.internalMonitoringEndpoint },
      expectEntryToBeAdded: false,
    },
    {
      description: 'type resource + rum endpoint',
      entry: { entryType: 'resource', name: configuration.rumEndpoint },
      expectEntryToBeAdded: false,
    },
  ].forEach(
    ({
      description,
      entry,
      expectEntryToBeAdded,
    }: {
      description: string
      entry: Partial<PerformanceResourceTiming>
      expectEntryToBeAdded: boolean
    }) => {
      it(description, () => {
        handleResourceEntry(entry as PerformanceResourceTiming, batch as RumBatch, configuration as Configuration)
        expect((batch.add as jasmine.Spy).calls.all.length !== 0).toEqual(expectEntryToBeAdded)
      })
    }
  )
  ;[
    {
      description: 'file extension with query params',
      expected: 'js',
      url: 'http://localhost/test.js?from=foo.css',
    },
    {
      description: 'css extension',
      expected: 'css',
      url: 'http://localhost/test.css',
    },
    {
      description: 'image initiator',
      expected: 'image',
      initiatorType: 'img',
      url: 'http://localhost/test',
    },
    {
      description: 'image extension',
      expected: 'image',
      url: 'http://localhost/test.jpg',
    },
  ].forEach(
    ({
      description,
      url,
      initiatorType,
      expected,
    }: {
      description: string
      url: string
      initiatorType?: string
      expected: string
    }) => {
      it(`should compute resource kind: ${description}`, () => {
        const entry: Partial<PerformanceResourceTiming> = { initiatorType, name: url, entryType: 'resource' }

        handleResourceEntry(entry as PerformanceResourceTiming, batch as RumBatch, configuration as Configuration)
        const resourceEvent = getEntry(batch as RumBatch, 0) as RumResourceEvent
        expect(resourceEvent.resource.kind).toEqual(expected)
      })
    }
  )

  it('should compute timing durations', () => {
    const entry: Partial<PerformanceResourceTiming> = {
      connectEnd: 10,
      connectStart: 3,
      entryType: 'resource',
      name: 'http://localhost/test',
      responseEnd: 100,
      responseStart: 25,
    }

    handleResourceEntry(entry as PerformanceResourceTiming, batch as RumBatch, configuration as Configuration)
    const resourceEvent = getEntry(batch as RumBatch, 0) as RumResourceEvent
    expect(resourceEvent.http.performance!.connect.duration).toEqual(7 * 1e6)
    expect(resourceEvent.http.performance!.download.duration).toEqual(75 * 1e6)
  })

  it('should rewrite paint entries', () => {
    const entry: Partial<PerformancePaintTiming> = { name: 'first-paint', startTime: 123456, entryType: 'paint' }
    handlePaintEntry(entry as PerformancePaintTiming, batch as RumBatch)
    expect(getEntry(batch as RumBatch, 0)).toEqual({
      evt: {
        category: RumEventCategory.SCREEN_PERFORMANCE,
      },
      screen: {
        performance: {
          'first-paint': 123456 * 1e6,
        },
      },
    })
  })
})

describe('rum performanceObserver callback', () => {
  it('should detect resource', (done) => {
    const batch = {
      add: (message: RumResourceEvent) => {
        expect(message.resource.kind).toEqual('xhr')
        done()
      },
    }

    trackPerformanceTiming(batch as RumBatch, configuration as Configuration)
    const request = new XMLHttpRequest()
    request.open('GET', './', true)
    request.send()
  })
})

describe('rum track page view', () => {
  let fakeLocation: Partial<Location>
  let initialPageViewId: string

  beforeEach(() => {
    spyOn(history, 'pushState').and.callFake((_: any, __: string, pathname: string) => {
      const url = new URL(pathname, 'http://localhost')
      fakeLocation.pathname = url.pathname
      fakeLocation.search = url.search
      fakeLocation.hash = url.hash
    })
    fakeLocation = { pathname: '/foo' }
    trackPageView(fakeLocation as Location)
    initialPageViewId = pageViewId
  })

  it('should update page view id on path change', () => {
    history.pushState({}, '', '/bar')

    expect(pageViewId).not.toEqual(initialPageViewId)
  })

  it('should not update page view id on search change', () => {
    history.pushState({}, '', '/foo?bar=qux')

    expect(pageViewId).toEqual(initialPageViewId)
  })

  it('should not update page view id on hash change', () => {
    history.pushState({}, '', '/foo#bar')

    expect(pageViewId).toEqual(initialPageViewId)
  })
})
