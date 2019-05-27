import { expect, use } from 'chai'
import * as sinon from 'sinon'
import sinonChai from 'sinon-chai'

import { Configuration } from '../../core/configuration'

import {
  handlePerformanceEntry,
  initRumBatch,
  RumBatch,
  RumEvent,
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

function getEntry(batch: any, index: number) {
  return batch.add.getCall(index).args[0]
}

function getRumMessage(server: sinon.SinonFakeServer, index: number) {
  return JSON.parse(server.requests[index].requestBody)
}

const configuration = {
  internalMonitoringEndpoint: 'monitoring',
  logsEndpoint: 'logs',
  rumEndpoint: 'rum',
}

describe('rum handle performance entry', () => {
  let batch: any

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
      entry: any
      expectEntryToBeAdded: boolean
    }) => {
      it(description, () => {
        handlePerformanceEntry(buildEntry(entry), batch, configuration as Configuration)
        expect(batch.add.called).to.equal(expectEntryToBeAdded)
      })
    }
  )

  it('should rewrite paint entries', () => {
    handlePerformanceEntry(
      buildEntry({ name: 'first-paint', startTime: 123456, entryType: 'paint' }),
      batch,
      configuration as Configuration
    )
    expect(getEntry(batch, 0)).to.deep.equal({
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
          batch,
          configuration as Configuration
        )
        expect(getEntry(batch, 0).data.resourceType).to.equal(expected)
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
      batch,
      configuration as Configuration
    )
    expect(getEntry(batch, 0).data.connectDuration).to.equal(7)
    expect(getEntry(batch, 0).data.responseDuration).to.equal(75)
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
      batch,
      configuration as Configuration
    )
    expect(getEntry(batch, 0).data.connectStart).undefined
    expect(getEntry(batch, 0).data.connectEnd).undefined
    expect(getEntry(batch, 0).data.responseStart).undefined
  })
})

describe('rum performanceObserver callback', () => {
  it('should detect resource', (done) => {
    const batch = {
      add: (message: RumEvent) => {
        expect((message.data! as RumResourceTiming).resourceType).to.equal('xhr')
        done()
      },
    }

    trackPerformanceTiming(batch as any, configuration as Configuration)
    const request = new XMLHttpRequest()
    request.open('GET', './', true)
    request.send()
  })
})

describe('rum track page view', () => {
  let batch: RumBatch
  let server: sinon.SinonFakeServer

  beforeEach(() => {
    batch = initRumBatch(configuration as Configuration, 'rumProjectId')
    server = sinon.fakeServer.create()
  })

  it('should send page view event with page view id', () => {
    trackPageView(batch)
    batch.flush()

    expect(getRumMessage(server, 0).type).eq('page_view')
    expect(getRumMessage(server, 0).page_view_id).not.undefined
  })

  it('should update page view id at each page view', () => {
    trackPageView(batch)
    batch.flush()
    trackPageView(batch)
    batch.flush()

    const firstId = getRumMessage(server, 0).page_view_id
    const secondId = getRumMessage(server, 1).page_view_id

    expect(firstId).not.eq(secondId)
  })
})
