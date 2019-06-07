import { expect, use } from 'chai'
import * as sinon from 'sinon'
import sinonChai from 'sinon-chai'

import { Configuration } from '../../core/configuration'

import {
  handlePerformanceEntry,
  initRumBatch,
  RumBatch,
  RumEvent,
  RumEventType,
  RumResourceTiming,
  trackPageView,
  trackPerformanceTiming,
} from '../rum'

use(sinonChai)

function buildEntry(entry: Partial<PerformanceResourceTiming>) {
  const result: Partial<PerformanceResourceTiming> = {
    ...entry,
    toJSON: () => ({ ...entry }),
  }
  return result as PerformanceResourceTiming
}

function getEntry(batch: RumBatch, index: number) {
  return (batch.add as sinon.SinonSpy).getCall(index).args[0] as RumEvent
}

interface RumServerMessage {
  type: RumEventType
  page_view_id: string
}

function getRumMessage(server: sinon.SinonFakeServer, index: number) {
  return JSON.parse(server.requests[index].requestBody) as RumServerMessage
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
      add: sinon.spy(),
    }
  })
  ;[
    {
      description: 'without entry type + allowed url',
      entry: { name: 'ok' },
      expectEntryToBeAdded: true,
    },
    {
      description: 'without entry type + allowed url',
      entry: { name: 'ok' },
      expectEntryToBeAdded: true,
    },
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
        handlePerformanceEntry(buildEntry(entry), batch as RumBatch, configuration as Configuration)
        expect((batch.add as sinon.SinonSpy).called).equal(expectEntryToBeAdded)
      })
    }
  )

  it('should rewrite paint entries', () => {
    handlePerformanceEntry(
      buildEntry({ name: 'first-paint', startTime: 123456, entryType: 'paint' }),
      batch as RumBatch,
      configuration as Configuration
    )
    expect(getEntry(batch as RumBatch, 0)).deep.equal({
      data: {
        'first-paint': 123456,
      },
      type: 'paint',
    })
  })
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
      it(`should compute resource type: ${description}`, () => {
        handlePerformanceEntry(
          buildEntry({ initiatorType, name: url, entryType: 'resource' }),
          batch as RumBatch,
          configuration as Configuration
        )
        const resourceTiming = getEntry(batch as RumBatch, 0).data as RumResourceTiming
        expect(resourceTiming.resourceType).equal(expected)
      })
    }
  )

  it('should add timing durations', () => {
    handlePerformanceEntry(
      buildEntry({
        connectEnd: 10,
        connectStart: 3,
        entryType: 'resource',
        name: 'http://localhost/test',
        responseEnd: 100,
        responseStart: 25,
      }),
      batch as RumBatch,
      configuration as Configuration
    )
    const resourceTiming = getEntry(batch as RumBatch, 0).data as RumResourceTiming
    expect(resourceTiming.connectDuration).equal(7)
    expect(resourceTiming.responseDuration).equal(75)
  })

  it('should remove unavailable attributes', () => {
    handlePerformanceEntry(
      buildEntry({
        connectEnd: 0,
        connectStart: 0,
        entryType: 'resource',
        name: 'http://localhost/test',
        responseEnd: 100,
        responseStart: 0,
      }),
      batch as RumBatch,
      configuration as Configuration
    )
    const resourceTiming = getEntry(batch as RumBatch, 0).data as PerformanceResourceTiming
    expect(resourceTiming.connectStart).undefined
    expect(resourceTiming.connectEnd).undefined
    expect(resourceTiming.responseStart).undefined
  })
})

describe('rum performanceObserver callback', () => {
  it('should detect resource', (done) => {
    const batch = {
      add: (message: RumEvent) => {
        expect((message.data! as RumResourceTiming).resourceType).equal('xhr')
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
  let batch: RumBatch
  let server: sinon.SinonFakeServer

  beforeEach(() => {
    batch = initRumBatch(configuration as Configuration, 'applicationId')
    server = sinon.fakeServer.create()
  })

  it('should send page view event with page view id', () => {
    trackPageView(batch)
    batch.flush()

    expect(getRumMessage(server, 0).type).equal('page_view')
    expect(getRumMessage(server, 0).page_view_id).not.undefined
  })

  it('should update page view id at each page view', () => {
    trackPageView(batch)
    batch.flush()
    trackPageView(batch)
    batch.flush()

    const firstId = getRumMessage(server, 0).page_view_id
    const secondId = getRumMessage(server, 1).page_view_id

    expect(firstId).not.equal(secondId)
  })
})
