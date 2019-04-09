import { expect, use } from 'chai'
import * as sinon from 'sinon'
import * as sinonChai from 'sinon-chai'

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
      getEndpoint: () => 'endpoint',
    }
  })

  it('should filter rightfully performance entries', () => {
    handlePerformanceEntry(buildEntry({ name: 'ok' }), batch, currentData)
    expect(batch.add.callCount).to.equal(1)

    handlePerformanceEntry(buildEntry({ entryType: 'resource', name: 'ok' }), batch, currentData)
    expect(batch.add.callCount).to.equal(2)

    handlePerformanceEntry(buildEntry({ entryType: 'resource', name: batch.getEndpoint() }), batch, currentData)
    expect(batch.add.callCount).to.equal(2)
  })

  it('should rewrite paint entries', () => {
    handlePerformanceEntry(
      buildEntry({ name: 'first-paint', startTime: 123456, entryType: 'paint' }),
      batch,
      currentData
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
      getEndpoint: () => 'endpoint',
    }

    trackPerformanceTiming(batch as any, currentData)
    const request = new XMLHttpRequest()
    request.open('GET', './', true)
    request.send()
  })
})
