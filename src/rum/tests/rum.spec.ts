import { expect, use } from 'chai'
import * as sinon from 'sinon'
import * as sinonChai from 'sinon-chai'

import { Configuration } from '../../core/configuration'

import { Data, handlePerformanceEntry, RumMessage, trackFirstIdle, trackPerformanceTiming } from '../rum'

use(sinonChai)

function buildEntry(entry: Partial<PerformanceResourceTiming>) {
  const result: Partial<PerformanceResourceTiming> = {
    ...entry,
    toJSON: () => ({ ...entry }),
  }
  return result as PerformanceResourceTiming
}

function getEntryType(spy: sinon.SinonSpy) {
  const message = spy.getCall(0).args[0] as any
  return message.entryType
}

const configuration = {
  internalMonitoringEndpoint: 'monitoring',
  logsEndpoint: 'logs',
  rumEndpoint: 'rum',
}

describe('rum', () => {
  it('should track first idle', async () => {
    const batch = {
      add: sinon.spy(),
    }

    // Stub that because otherwise with all the tests running, it's never idle.
    const stub = sinon.stub(window, 'requestIdleCallback')
    stub.yields((func: () => void) => func())
    trackFirstIdle(batch as any)
    stub.restore()

    expect(batch.add.callCount).to.be.equal(1)
    expect(getEntryType(batch.add)).eq('firstIdle')
  })
})

describe('rum handle performance entry', () => {
  let batch: any
  let currentData: Data

  beforeEach(() => {
    currentData = { xhrDetails: { total: 0, resources: {} }, errorCount: 0 }
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
        handlePerformanceEntry(buildEntry(entry), batch, currentData, configuration as Configuration)
        expect(batch.add.called).to.equal(expectEntryToBeAdded)
      })
    }
  )

  it('should rewrite paint entries', () => {
    handlePerformanceEntry(
      buildEntry({ name: 'first-paint', startTime: 123456, entryType: 'paint' }),
      batch,
      currentData,
      configuration as Configuration
    )
    expect(batch.add.getCall(0).args[0]).to.deep.equal({
      data: {
        'first-paint': 123456,
      },
      entryType: 'paint',
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
          currentData,
          configuration as Configuration
        )
        expect(batch.add.getCall(0).args[0].data.resourceType).to.equal(expected)
      })
    }
  )
})

describe('rum performanceObserver callback', () => {
  let currentData: Data

  beforeEach(() => {
    currentData = { xhrDetails: { total: 0, resources: {} }, errorCount: 0 }
  })

  it('should detect resource', (done) => {
    const batch = {
      add: (message: RumMessage) => {
        expect(currentData.xhrDetails.total).to.be.equal(1)
        expect(Object.keys(currentData.xhrDetails.resources).length).to.be.equal(1)
        expect(currentData.xhrDetails.resources[message.data.name]).to.be.equal(1)
        done()
      },
    }

    trackPerformanceTiming(batch as any, currentData, configuration as Configuration)
    const request = new XMLHttpRequest()
    request.open('GET', './', true)
    request.send()
  })

  it('should compute timing durations for resource', (done) => {
    const batch = {
      add: (message: any) => {
        expect(message.data).to.have.property('redirectDuration')
        expect(message.data).to.have.property('domainLookupDuration')
        expect(message.data).to.have.property('connectionDuration')
        expect(message.data).to.have.property('secureConnectionDuration')
        expect(message.data).to.have.property('requestDuration')
        expect(message.data).to.have.property('responseDuration')

        done()
      },
    }

    trackPerformanceTiming(batch as any, currentData, configuration as Configuration)
    const request = new XMLHttpRequest()
    request.open('GET', './', true)
    request.send()
  })
})
