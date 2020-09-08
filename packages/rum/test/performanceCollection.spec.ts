import { isIE } from '@datadog/browser-core'

import { isRumResourceEvent } from '../../../test/e2e/scenario/serverTypes'
import { withPage } from '../../../test/helpers/withPage'
import { restorePageVisibility, setPageVisibility } from '../../core/src/specHelper'
import { retrieveInitialDocumentResourceTiming } from '../../rum/src/performanceCollection'
import { setup, TestSetupBuilder } from './specHelper'

declare const __webpack_public_path__: string

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

  describe('initial document trace id', () => {
    it('reads the initial document trace id from the document metas', (done) => {
      withPage({
        html: `
         <html>
           <head>
             <meta name="dd-trace-id" content="foo" />
             <meta name="dd-trace-time" content="${Date.now()}" />
             <script src="${__webpack_public_path__}rum.js"></script>
             <script>
             DD_RUM.init({
               clientToken: 'xxx',
               applicationId: 'xxx',
             })
             </script>
           </head>
           <body></body>
         </html>
      `,
        onUnload(_, events) {
          const resourceEvents = events.filter(isRumResourceEvent).filter((event) => event.resource.kind === 'document')
          expect(resourceEvents.length).toBe(1)
          expect(resourceEvents[0]._dd!.trace_id).toBe('foo')
          done()
        },
      })
    })

    it('reads the initial document trace id from the document metas set after init', (done) => {
      withPage({
        html: `
         <html>
           <head>
             <script src="${__webpack_public_path__}rum.js"></script>
             <script>
             DD_RUM.init({
               clientToken: 'xxx',
               applicationId: 'xxx',
             })
             </script>
             <meta name="dd-trace-id" content="foo" />
             <meta name="dd-trace-time" content="${Date.now()}" />
           </head>
           <body></body>
         </html>
      `,
        onUnload(_, events) {
          const resourceEvents = events.filter(isRumResourceEvent).filter((event) => event.resource.kind === 'document')
          expect(resourceEvents.length).toBe(1)
          expect(resourceEvents[0]._dd!.trace_id).toBe('foo')
          done()
        },
      })
    })
  })
})
