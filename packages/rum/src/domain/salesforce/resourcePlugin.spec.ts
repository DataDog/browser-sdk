import { ResourceType } from '@datadog/browser-core'
import type { RelativeTime } from '@datadog/browser-core'
import { RumEventType } from '@datadog/browser-rum-core'
import { mockDocumentReadyState } from '../../../../rum-core/test'
import type { SalesforceResourcePoll } from './resourcePollChannel'
import { createSalesforceResourcePlugin, startSalesforceResourceTracking } from './resourcePlugin'

describe('salesforce resource plugin', () => {
  it('emits resource events from Salesforce view poll notifications', () => {
    const addEvent = jasmine.createSpy()
    const pollDriver = createResourcePollDriver()
    const entries = [createResourceEntry({ initiatorType: 'fetch', name: 'https://example.com/api/users' })]

    const tracking = startSalesforceResourceTracking({
      addEvent,
      configuration: {},
      getNavigationEntry: () => undefined,
      subscribeToResourcePolls: pollDriver.subscribe,
    })

    pollDriver.notify({
      currentView: { startRelativeTime: 200 as RelativeTime },
      resourceEntries: entries,
    })

    expect(addEvent).toHaveBeenCalledOnceWith(
      300 as RelativeTime,
      jasmine.objectContaining({
        type: RumEventType.RESOURCE,
        resource: jasmine.objectContaining({
          type: ResourceType.FETCH,
          url: 'https://example.com/api/users',
        }),
      }),
      jasmine.objectContaining({
        performanceEntry: entries[0],
      }),
      100
    )

    pollDriver.notify({
      currentView: { startRelativeTime: 200 as RelativeTime },
      resourceEntries: entries,
    })

    expect(addEvent).toHaveBeenCalledTimes(1)

    pollDriver.notify({
      currentView: { startRelativeTime: 200 as RelativeTime },
      resourceEntries: [entries[0], createResourceEntry({ initiatorType: 'xmlhttprequest', name: 'https://example.com/xhr' })],
    })

    expect(addEvent).toHaveBeenCalledTimes(2)
    expect(addEvent.calls.argsFor(1)[1]).toEqual(
      jasmine.objectContaining({
        resource: jasmine.objectContaining({
          type: ResourceType.XHR,
          url: 'https://example.com/xhr',
        }),
      })
    )

    tracking.stop()
  })

  it('waits for a Salesforce view before emitting resources', () => {
    const addEvent = jasmine.createSpy()
    const pollDriver = createResourcePollDriver()

    startSalesforceResourceTracking({
      addEvent,
      configuration: {},
      getNavigationEntry: () => undefined,
      subscribeToResourcePolls: pollDriver.subscribe,
    })

    pollDriver.notify({
      currentView: undefined,
      resourceEntries: [createResourceEntry({ initiatorType: 'fetch' })],
    })

    expect(addEvent).not.toHaveBeenCalled()
  })

  it('emits the initial document resource when the document becomes interactive after the Salesforce view starts', () => {
    const { triggerOnDomLoaded } = mockDocumentReadyState()
    const addEvent = jasmine.createSpy()
    const pollDriver = createResourcePollDriver()

    startSalesforceResourceTracking({
      addEvent,
      configuration: {},
      getNavigationEntry: () => ({
        name: 'https://example.com/',
        startTime: 0 as RelativeTime,
        responseEnd: 42 as RelativeTime,
        fetchStart: 0 as RelativeTime,
        workerStart: 0 as RelativeTime,
        domainLookupStart: 0 as RelativeTime,
        domainLookupEnd: 0 as RelativeTime,
        connectStart: 0 as RelativeTime,
        secureConnectionStart: 0 as RelativeTime,
        connectEnd: 0 as RelativeTime,
        requestStart: 0 as RelativeTime,
        responseStart: 12 as RelativeTime,
        redirectStart: 0 as RelativeTime,
        redirectEnd: 0 as RelativeTime,
      }),
      subscribeToResourcePolls: pollDriver.subscribe,
    })

    pollDriver.notify({
      currentView: { startRelativeTime: 0 as RelativeTime },
      resourceEntries: [],
    })
    triggerOnDomLoaded()

    expect(addEvent).toHaveBeenCalledOnceWith(
      42 as RelativeTime,
      jasmine.objectContaining({
        resource: jasmine.objectContaining({
          type: ResourceType.DOCUMENT,
          url: 'https://example.com/',
        }),
      }),
      jasmine.any(Object),
      42
    )
  })

  it('does not emit intake requests or invalid timings', () => {
    const addEvent = jasmine.createSpy()
    const pollDriver = createResourcePollDriver()

    startSalesforceResourceTracking({
      addEvent,
      configuration: {},
      getNavigationEntry: () => undefined,
      subscribeToResourcePolls: pollDriver.subscribe,
    })

    pollDriver.notify({
      currentView: { startRelativeTime: 0 as RelativeTime },
      resourceEntries: [
        createResourceEntry({
          name: 'https://rum-http-intake.logs.datadoghq.com/api/v2/rum?ddsource=browser&dd-api-key=test&dd-request-id=test',
        }),
        createResourceEntry({ responseStart: 350 as RelativeTime, responseEnd: 250 as RelativeTime }),
      ],
    })

    expect(addEvent).not.toHaveBeenCalled()
  })

  it('injects a Salesforce plugin that starts listening on rum start', () => {
    const addEvent = jasmine.createSpy()
    const pollDriver = createResourcePollDriver()
    const plugin = createSalesforceResourcePlugin(
      {},
      {
        getNavigationEntry: () => undefined,
        subscribeToResourcePolls: pollDriver.subscribe,
      }
    )

    plugin.onRumStart!({ addEvent })
    pollDriver.notify({
      currentView: { startRelativeTime: 0 as RelativeTime },
      resourceEntries: [createResourceEntry({ initiatorType: 'fetch' })],
    })

    expect(addEvent).toHaveBeenCalled()
  })
})

function createResourcePollDriver() {
  let callback: ((poll: SalesforceResourcePoll) => void) | undefined

  return {
    subscribe(nextCallback: (poll: SalesforceResourcePoll) => void) {
      callback = nextCallback
      return {
        unsubscribe() {
          callback = undefined
        },
      }
    },
    notify(poll: SalesforceResourcePoll) {
      callback?.(poll)
    },
  }
}

function createResourceEntry(overrides: Partial<ReturnType<typeof baseResourceEntry>> = {}) {
  const entry = {
    ...baseResourceEntry(),
    ...overrides,
  }

  return {
    ...entry,
    toJSON: () => ({ ...entry }),
  }
}

function baseResourceEntry() {
  return {
    entryType: 'resource' as const,
    initiatorType: 'img',
    name: 'https://example.com/image.png',
    startTime: 200 as RelativeTime,
    duration: 100,
    fetchStart: 200 as RelativeTime,
    workerStart: 0 as RelativeTime,
    domainLookupStart: 200 as RelativeTime,
    domainLookupEnd: 200 as RelativeTime,
    connectStart: 200 as RelativeTime,
    secureConnectionStart: 0 as RelativeTime,
    connectEnd: 200 as RelativeTime,
    requestStart: 200 as RelativeTime,
    responseStart: 250 as RelativeTime,
    responseEnd: 300 as RelativeTime,
    redirectStart: 0 as RelativeTime,
    redirectEnd: 0 as RelativeTime,
    decodedBodySize: 10,
    encodedBodySize: 10,
    transferSize: 10,
    responseStatus: 200,
    nextHopProtocol: 'h2',
    renderBlockingStatus: 'non-blocking',
    deliveryType: '' as const,
  }
}
