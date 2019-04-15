import { expect, use } from 'chai'
import * as sinon from 'sinon'
import * as sinonChai from 'sinon-chai'

import { Configuration } from '../../core/configuration'

import { handlePerformanceEntry, trackFirstIdle, trackPerformanceTiming } from '../rum'

use(sinonChai)

function buildEntry(entry: Partial<PerformanceEntry>) {
  const result: Partial<PerformanceEntry> = {
    ...entry,
    toJSON: () => ({}),
  }
  return result as PerformanceEntry
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
  const currentData = { xhrCount: 0, errorCount: 0 }

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
})

describe('rum performanceObserver callback', () => {
  it('should detect resource', (done) => {
    const currentData = { xhrCount: 0, errorCount: 0 }
    const batch = {
      add: () => {
        expect(currentData.xhrCount).to.be.equal(1)
        done()
      },
    }

    trackPerformanceTiming(batch as any, currentData, configuration as Configuration)
    const request = new XMLHttpRequest()
    request.open('GET', './', true)
    request.send()
  })

  it('resource type output should have certain properties', (done) => {
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

    trackPerformanceTiming(batch as any, {} as any, configuration as Configuration)
    const request = new XMLHttpRequest()
    request.open('GET', './', true)
    request.send()
  })
})
