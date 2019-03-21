import { expect } from 'chai'
import * as sinon from 'sinon'

import { buildConfiguration } from '../../core/configuration'
import { startLogger } from '../../core/logger'

import { isPerformanceEntryAllowed, trackFirstIdle } from '../rum'

function getLogger() {
  const { logger } = startLogger(
    buildConfiguration({
      apiKey: 'key',
    })
  )

  const logStub = sinon.stub(logger, 'log')

  return { logger, logStub }
}

function getEntryType(logStub: sinon.SinonStub) {
  const message = logStub.getCall(0).args[1] as any
  return message.entryType
}

describe('rum', () => {
  it('should filter rightfully performance entries', () => {
    const { logger } = getLogger()
    expect(isPerformanceEntryAllowed(logger, { name: 'ok' } as any)).true
    expect(isPerformanceEntryAllowed(logger, { entryType: 'resource', name: 'ok' } as any)).true
    expect(isPerformanceEntryAllowed(logger, { entryType: 'resource', name: logger.getEndpoint() } as any)).false
  })

  it('should track first idle', async () => {
    const { logger, logStub } = getLogger()

    // Mock that because otherwise with all the tests running, it's never idle.
    const originalRequestIdleCallback = window.requestIdleCallback
    ;(window.requestIdleCallback as any) = (func: () => void) => func()
    trackFirstIdle(logger)
    window.requestIdleCallback = originalRequestIdleCallback

    expect(logStub.callCount).to.be.equal(1)
    expect(getEntryType(logStub)).eq('firstIdle')
  })
})
