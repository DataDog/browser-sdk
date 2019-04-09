import { expect, use } from 'chai'
import * as sinon from 'sinon'
import * as sinonChai from 'sinon-chai'

import { buildConfiguration } from '../../core/configuration'
import { Logger, startLogger } from '../../core/logger'
import { handlePerformanceEntry, trackFirstIdle, trackPerformanceTiming } from '../rum'

use(sinonChai)

function getLogger() {
  const { logger } = startLogger(
    buildConfiguration({
      apiKey: 'key',
    })
  )

  const logStub = sinon.stub(logger, 'log')

  return { logger, logStub }
}

function buildEntry(entry: Partial<PerformanceEntry>) {
  const result: Partial<PerformanceEntry> = {
    ...entry,
    toJSON: () => ({}),
  }
  return result as PerformanceEntry
}

function getEntryType(logStub: sinon.SinonStub) {
  const message = logStub.getCall(0).args[1] as any
  return message.entryType
}

describe('rum', () => {
  it('should track first idle', async () => {
    const { logger, logStub } = getLogger()

    // Stub that because otherwise with all the tests running, it's never idle.
    const stub = sinon.stub(window, 'requestIdleCallback')
    stub.yields((func: () => void) => func())
    trackFirstIdle(logger)
    stub.restore()

    expect(logStub.callCount).to.be.equal(1)
    expect(getEntryType(logStub)).eq('firstIdle')

    logStub.restore()
  })
})

describe('rum handle performance entry', () => {
  let logger: Logger
  let logStub: sinon.SinonSpy
  const currentData = { xhrCount: 0 }

  beforeEach(() => {
    ;({ logger, logStub } = getLogger())
  })

  it('should filter rightfully performance entries', () => {
    handlePerformanceEntry(buildEntry({ name: 'ok' }), logger, currentData)
    expect(logStub.callCount).to.equal(1)

    handlePerformanceEntry(buildEntry({ entryType: 'resource', name: 'ok' }), logger, currentData)
    expect(logStub.callCount).to.equal(2)

    handlePerformanceEntry(buildEntry({ entryType: 'resource', name: logger.getEndpoint() }), logger, currentData)
    expect(logStub.callCount).to.equal(2)
  })

  it('should rewrite paint entries', () => {
    handlePerformanceEntry(
      buildEntry({ name: 'first-paint', startTime: 123456, entryType: 'paint' }),
      logger,
      currentData
    )
    expect(logStub.getCall(0).args[1]).to.deep.equal({
      data: {
        'first-paint': 123456,
      },
      entryType: 'paint',
    })
  })
})

describe('rum performanceObserver callback', () => {
  it('should detect resource', (done) => {
    const { logger } = startLogger(
      buildConfiguration({
        apiKey: 'key',
      })
    )

    const currentData = { xhrCount: 0 }

    trackPerformanceTiming(logger, currentData)
    const request = new XMLHttpRequest()
    request.open('GET', './', true)
    request.send()

    // put expect at the end of the execution queue in order to insure that PerFormanceObserver callback is called.
    setTimeout(() => {
      expect(currentData.xhrCount).to.be.equal(1)
      done()
    }, 0)
  })
})
