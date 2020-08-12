import { isIE } from '@datadog/browser-core'

import { restorePageVisibility, setPageVisibility } from '../../core/src/specHelper'
import {
  INITIAL_DOCUMENT_OUTDATED_TRACE_ID_THRESHOLD,
  retrieveInitialDocumentResourceTiming,
} from '../../rum/src/performanceCollection'
import { setup, TestSetupBuilder } from './specHelper'

describe('rum first_contentful_paint', () => {
  let setupBuilder: TestSetupBuilder
  beforeEach(() => {
    if (isIE()) {
      pending('no full rum support')
    }

    setupBuilder = setup()
      .withPerformanceObserverStubBuilder()
      .withPerformanceCollection()
  })

  afterEach(() => {
    setupBuilder.cleanup()
    restorePageVisibility()
  })

  it('should not be collected when page starts not visible', () => {
    setPageVisibility('hidden')
    const { stubBuilder } = setupBuilder.build()

    expect(stubBuilder.getEntryTypes()).not.toContain('paint')
  })

  it('should be collected when page starts visible', () => {
    setPageVisibility('visible')
    const { stubBuilder } = setupBuilder.build()

    expect(stubBuilder.getEntryTypes()).toContain('paint')
  })
})

describe('rum initial document resource', () => {
  let setupBuilder: TestSetupBuilder
  beforeEach(() => {
    setupBuilder = setup().withPerformanceCollection()
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('creates a resource timing for the initial document', () => {
    const timing = retrieveInitialDocumentResourceTiming()
    expect(timing.entryType).toBe('resource')
    expect(timing.duration).toBeGreaterThan(0)
  })

  describe('initial trace id association', () => {
    const nodesToRemove: Node[] = []

    afterEach(() => {
      nodesToRemove.forEach((node) => {
        node.parentNode!.removeChild(node)
      })
      nodesToRemove.length = 0
    })

    it('should set a trace id found from an APM document comment', () => {
      const comment = document.createComment(`DATADOG;trace-id=123;trace-time=${Date.now()}`)
      nodesToRemove.push(comment)
      document.appendChild(comment)

      const timing = retrieveInitialDocumentResourceTiming()
      expect(timing.traceId).toBe('123')
    })

    it('should set a trace id found from meta tags', () => {
      const metaTraceId = document.createElement('meta')
      metaTraceId.name = 'dd-trace-id'
      metaTraceId.content = '456'
      document.head.appendChild(metaTraceId)
      const metaTraceTime = document.createElement('meta')
      metaTraceTime.name = 'dd-trace-time'
      metaTraceTime.content = String(Date.now())
      document.head.appendChild(metaTraceTime)
      nodesToRemove.push(metaTraceId, metaTraceTime)

      const timing = retrieveInitialDocumentResourceTiming()
      expect(timing.traceId).toBe('456')
    })

    it('should ignore the trace id if it has been created too long ago', () => {
      const comment = document.createComment(
        `DATADOG;trace-id=123;trace-time=${Date.now() - INITIAL_DOCUMENT_OUTDATED_TRACE_ID_THRESHOLD}`
      )
      nodesToRemove.push(comment)
      document.appendChild(comment)

      const timing = retrieveInitialDocumentResourceTiming()
      expect(timing.traceId).toBe(undefined)
    })
  })
})
