import type {
  RumEvent,
  RumVitalWebsocketClosedEvent,
  RumVitalWebsocketClosingEvent,
  RumVitalWebsocketConnectingEvent,
  RumVitalWebsocketOpenEvent,
} from '@datadog/browser-rum-core/src/rumEvent.types'
import {
  EARLY_PHASES_BUFFER_CAPACITY,
  WEBSOCKET_PERIODIC_REPORT_INTERVAL,
} from '@datadog/browser-rum-core/src/domain/webSocket/webSocketCollection'
import type { RumInitConfiguration } from '@datadog/browser-rum-core'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { IntakeRegistry } from '../../lib/framework'
import { createTest } from '../../lib/framework'
import { expireSession, renewSession } from '../../lib/helpers/session'
import { DEFAULT_WS_OUT_MESSAGE, expectedWsEchoMessage, WebSocketPage } from '../../lib/pages/webSocketPage'

declare global {
  interface Window {
    dismissedVitalNames?: string[]
    deferredRumInit?: () => void
  }
}

const RUM_CONFIGURATION = { enableExperimentalFeatures: ['track_websockets'] }

const NANOSECONDS_PER_MILLISECOND = 1e6

test.describe('rum websockets', () => {
  test.describe('connection tracking', () => {
    createTest('reports the four phases of a connection closed by the client under one connection id')
      .withRum(RUM_CONFIGURATION)
      .withBody(WebSocketPage.testBody())
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        const ws = new WebSocketPage(page)

        await ws.open()
        await ws.sendAndExpectEcho()
        await ws.close()

        await flushEvents()

        const vitals = getWebSocketVitals(intakeRegistry)
        expect(vitals.connecting).toHaveLength(1)
        expect(vitals.open).toHaveLength(1)
        expect(vitals.closing).toHaveLength(1)
        expect(vitals.closed).toHaveLength(1)
        expect(vitals.all).toHaveLength(4)
        expect(getConnectionIds(vitals.all)).toEqual([vitals.connecting[0].vital.websocket.id])

        const closed = vitals.closed[0].vital.websocket
        expect(closed.tracking_end_reason).toBe('close_event')
        expect(closed.snapshot!.outbound.message_count).toBe(1)
        expect(closed.snapshot!.outbound.message_size_total).toBe(DEFAULT_WS_OUT_MESSAGE.length)
        expect(closed.snapshot!.inbound.message_count).toBe(1)
        expect(closed.snapshot!.inbound.message_size_total).toBe(expectedWsEchoMessage().length)
      })

    createTest('reports a connection closed by the server, without a closing vital')
      .withRum(RUM_CONFIGURATION)
      .withBody(WebSocketPage.testBody())
      .run(async ({ intakeRegistry, flushEvents, page, servers }) => {
        const ws = new WebSocketPage(page)

        await ws.open()
        servers.base.app.closeEchoWebSockets!()
        await ws.expectClosed()

        await flushEvents()

        const vitals = getWebSocketVitals(intakeRegistry)
        expect(vitals.closing).toHaveLength(0)
        expect(vitals.closed).toHaveLength(1)
        expect(vitals.closed[0].vital.websocket.tracking_end_reason).toBe('close_event')
      })

    createTest('ends tracking with session_end on the view that was active when the session expires')
      .withRum(RUM_CONFIGURATION)
      .withBody(WebSocketPage.testBody())
      .run(async ({ intakeRegistry, flushEvents, page, browserContext }) => {
        const ws = new WebSocketPage(page)

        await ws.open()
        await expireSession(page, browserContext)

        await flushEvents()

        const vitals = getWebSocketVitals(intakeRegistry)
        expect(vitals.closed).toHaveLength(1)
        const closedVital = vitals.closed[0]
        const closed = closedVital.vital.websocket
        expect(closed.tracking_end_reason).toBe('session_end')
        expect(closed.close_code).toBeUndefined()
        expect(closed.close_reason).toBeUndefined()
        expect(closed.was_clean).toBeUndefined()
        expect(closedVital.session.id).toBe(vitals.connecting[0].session.id)

        // the session expiry closes the view history too, and the closed vital must still get a view
        expect(closedVital.view.id).toBe(vitals.connecting[0].view.id)
        const associatedView = intakeRegistry.rumViewEvents.find((event) => event.view.id === closedVital.view.id)
        expect(associatedView).toBeDefined()
        const viewEndTime = associatedView!.date + associatedView!.view.time_spent / NANOSECONDS_PER_MILLISECOND
        expect(closedVital.date).toBeLessThanOrEqual(viewEndTime)
      })

    createTest('ends tracking with page_terminated when the page unloads with the connection still open')
      .withRum(RUM_CONFIGURATION)
      .withBody(WebSocketPage.testBody())
      .run(async ({ intakeRegistry, flushEvents, page, browserName }) => {
        test.skip(
          browserName === 'firefox',
          'Firefox closes the socket and fires its close event before pagehide, so a real close ends tracking first'
        )
        const ws = new WebSocketPage(page)

        await ws.open()
        await ws.sendAndExpectEcho()

        // flushing navigates away, which unloads the page for good
        await flushEvents()

        const vitals = getWebSocketVitals(intakeRegistry)
        expect(vitals.closing).toHaveLength(0)
        expect(vitals.closed).toHaveLength(1)
        expect(getConnectionIds(vitals.all)).toEqual([vitals.connecting[0].vital.websocket.id])
        const closed = vitals.closed[0].vital.websocket
        expect(closed.tracking_end_reason).toBe('page_terminated')
        expect(closed.close_code).toBeUndefined()
        expect(closed.close_reason).toBeUndefined()
        expect(closed.was_clean).toBeUndefined()
        expect(closed.snapshot_version).toBe(vitals.open.length + 1)
        expect(closed.snapshot!.outbound.message_count).toBe(1)
        expect(closed.snapshot!.inbound.message_count).toBe(1)
      })

    createTest('reports session_end when the session is stopped, then renewed by user activity')
      .withRum(RUM_CONFIGURATION)
      .withBody(WebSocketPage.testBody())
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        const ws = new WebSocketPage(page)

        await ws.open()
        await page.evaluate(() => {
          window.DD_RUM!.stopSession()
          // Generate user activity to trigger session renewal
          document.documentElement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        })

        await flushEvents()

        const vitals = getWebSocketVitals(intakeRegistry)
        expect(vitals.closed).toHaveLength(1)
        expect(vitals.closed[0].vital.websocket.tracking_end_reason).toBe('session_end')
      })

    createTest('does not track websocket activity after the session is renewed')
      .withRum(RUM_CONFIGURATION)
      .withBody(WebSocketPage.testBody())
      .run(async ({ intakeRegistry, flushEvents, page, browserContext }) => {
        const ws = new WebSocketPage(page)

        await ws.open()
        await ws.sendAndExpectEcho()
        await renewSession(page, browserContext)
        await ws.sendAndExpectEcho()
        await ws.close()

        await flushEvents()

        const vitals = getWebSocketVitals(intakeRegistry)
        expect(vitals.closing).toHaveLength(0)
        expect(vitals.closed).toHaveLength(1)
        const closed = vitals.closed[0].vital.websocket
        expect(closed.tracking_end_reason).toBe('session_end')
        expect(closed.snapshot!.outbound.message_count).toBe(1)
        expect(closed.snapshot!.inbound.message_count).toBe(1)
      })

    createTest('does not collect websocket vitals when trackResources is false')
      .withRum({ ...RUM_CONFIGURATION, trackResources: false })
      .withBody(WebSocketPage.testBody())
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        const ws = new WebSocketPage(page)

        await ws.open()
        await ws.close()

        await flushEvents()

        expect(getWebSocketVitals(intakeRegistry).all).toHaveLength(0)
      })

    createTest('attributes each vital to the view active when it was reported')
      .withRum(RUM_CONFIGURATION)
      .withBody(WebSocketPage.testBody())
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        const ws = new WebSocketPage(page)

        await page.evaluate(() => {
          window.DD_RUM!.startView('view-a')
        })
        await ws.open()
        await page.evaluate(() => {
          window.DD_RUM!.startView('view-b')
        })
        await ws.close()

        await flushEvents()

        const vitals = getWebSocketVitals(intakeRegistry)
        expect(vitals.connecting[0].view.name).toBe('view-a')
        expect(vitals.closed[0].view.name).toBe('view-b')
        expect(vitals.connecting[0].view.id).not.toBe(vitals.closed[0].view.id)
      })
  })

  test.describe('phases', () => {
    createTest('reports the closing phase of a connection closed before it opened')
      .withRum(RUM_CONFIGURATION)
      .withBody(WebSocketPage.testBody())
      .run(async ({ intakeRegistry, flushEvents, page, withBrowserLogs, flushBrowserLogs }) => {
        const ws = new WebSocketPage(page)

        await ws.openAndCloseWhileConnecting()

        await flushEvents()

        const vitals = getWebSocketVitals(intakeRegistry)
        expect(vitals.open).toHaveLength(0)
        expect(vitals.closing).toHaveLength(1)
        expect(vitals.closed).toHaveLength(1)
        expect(vitals.closed[0].vital.websocket.snapshot).toBeUndefined()

        // Firefox logs connection errors for a socket closed during its handshake. They are expected,
        // but any other error must still fail the test.
        withBrowserLogs((logs) => {
          const errors = logs.filter((log) => log.level === 'error')
          expect(errors.every((error) => error.message.includes('/ws-echo'))).toBe(true)
        })
        flushBrowserLogs()
      })

    createTest('reports the closing phase once however many times close() is called')
      .withRum(RUM_CONFIGURATION)
      .withBody(WebSocketPage.testBody())
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        const ws = new WebSocketPage(page)

        await ws.open()
        await ws.closeTwice()

        await flushEvents()

        const vitals = getWebSocketVitals(intakeRegistry)
        expect(vitals.closing).toHaveLength(1)
        expect(vitals.closed).toHaveLength(1)
      })
  })

  test.describe('periodic report', () => {
    createTest('reports the open vital with a new snapshot version while the connection stays open')
      .withRum(RUM_CONFIGURATION)
      .withBody(WebSocketPage.testBody())
      .withMockClock()
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        const ws = new WebSocketPage(page)

        await ws.open()
        await page.clock.runFor(WEBSOCKET_PERIODIC_REPORT_INTERVAL)
        await ws.sendAndExpectEcho()
        await page.clock.runFor(WEBSOCKET_PERIODIC_REPORT_INTERVAL)
        await ws.close()

        await flushEvents()

        const vitals = getWebSocketVitals(intakeRegistry)
        const openVitals = sortByDate(vitals.open)
        expect(openVitals.map((vital) => vital.vital.websocket.snapshot_version)).toEqual([1, 2, 3])
        expect(openVitals.map((vital) => vital.vital.websocket.snapshot.outbound.message_count)).toEqual([0, 0, 1])
        expect(vitals.closed[0].vital.websocket.snapshot_version).toBe(4)
      })

    createTest('grows longest_silence across periodic reports on a quiet connection')
      .withRum(RUM_CONFIGURATION)
      .withBody(WebSocketPage.testBody())
      .withMockClock()
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        const ws = new WebSocketPage(page)

        await ws.open()
        // longest_silence includes the silence still open since the last message
        await ws.sendAndExpectEcho()
        await page.clock.runFor(WEBSOCKET_PERIODIC_REPORT_INTERVAL)
        await page.clock.runFor(WEBSOCKET_PERIODIC_REPORT_INTERVAL)
        await ws.close()

        await flushEvents()

        const [, firstReport, secondReport] = sortByDate(getWebSocketVitals(intakeRegistry).open)
        const firstSilence = firstReport.vital.websocket.snapshot.inbound.longest_silence
        const secondSilence = secondReport.vital.websocket.snapshot.inbound.longest_silence
        expect(firstSilence).toBeGreaterThan(0)
        expect(secondSilence).toBeGreaterThan(firstSilence)
      })

    createTest('stops reporting once the connection is closed')
      .withRum(RUM_CONFIGURATION)
      .withBody(WebSocketPage.testBody())
      .withMockClock()
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        const ws = new WebSocketPage(page)

        await ws.open()
        await ws.close()
        await page.clock.runFor(2 * WEBSOCKET_PERIODIC_REPORT_INTERVAL)

        await flushEvents()

        // only the vital reported when the connection opened
        expect(getWebSocketVitals(intakeRegistry).open).toHaveLength(1)
      })

    createTest('reports the open vital when the page is hidden, without waiting for the interval')
      .withRum(RUM_CONFIGURATION)
      .withBody(WebSocketPage.testBody())
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        const ws = new WebSocketPage(page)

        await ws.open()
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
          document.dispatchEvent(new Event('visibilitychange'))
          delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState
          document.dispatchEvent(new Event('visibilitychange'))
        })
        await ws.close()

        await flushEvents()

        // the test runs in far less than an interval, so the second one can only come from the page
        // being hidden
        const openVitals = sortByDate(getWebSocketVitals(intakeRegistry).open)
        expect(openVitals.map((vital) => vital.vital.websocket.snapshot_version)).toEqual([1, 2])
      })
  })

  test.describe('beforeSend', () => {
    createTest('keeps WebSocket vitals that beforeSend dismisses, but not other vitals')
      .withRum({
        ...RUM_CONFIGURATION,
        beforeSend: (event) => {
          if (event.type === 'vital') {
            window.dismissedVitalNames = (window.dismissedVitalNames || []).concat(event.vital.name!)
            return false
          }
          return true
        },
      })
      .withBody(WebSocketPage.testBody())
      .run(async ({ intakeRegistry, flushEvents, page, withBrowserLogs }) => {
        const ws = new WebSocketPage(page)

        await page.evaluate(() => {
          window.DD_RUM!.addDurationVital('custom-vital', { startTime: Date.now(), duration: 10 })
        })
        await ws.open()
        await ws.close()
        // proves the custom vital was produced and offered to beforeSend, so its absence below is
        // the dismissal and not a vital that never existed
        expect(await page.evaluate(() => window.dismissedVitalNames)).toContain('custom-vital')

        await flushEvents()

        const vitals = getWebSocketVitals(intakeRegistry)
        expect(vitals.all).toHaveLength(4)
        expect(intakeRegistry.rumVitalEvents).toHaveLength(4)
        withBrowserLogs((logs) => {
          expect(logs).toContainEqual(
            expect.objectContaining({
              level: 'warning',
              message: expect.stringContaining("Can't dismiss WebSocket vital events using beforeSend!"),
            })
          )
        })
      })

    createTest('lets beforeSend redact the sensitive fields of WebSocket vitals')
      .withRum({
        ...RUM_CONFIGURATION,
        beforeSend: (event: any) => {
          if (event.type === 'vital' && event.vital.type === 'websocket') {
            const websocket = event.vital.websocket
            if ('url' in websocket) {
              websocket.url = 'ws://redacted.example/'
            }
            if ('requested_protocols' in websocket) {
              websocket.requested_protocols = ['redacted']
            }
            if ('selected_protocol' in websocket) {
              websocket.selected_protocol = 'redacted'
            }
            if ('close_reason' in websocket) {
              websocket.close_reason = 'redacted'
            }
          }
          return true
        },
      })
      .withBody(WebSocketPage.testBody())
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        const ws = new WebSocketPage(page)

        await ws.open({ protocols: ['e2e-protocol'] })
        await ws.close(4000, 'e2e-reason')

        await flushEvents()

        const vitals = getWebSocketVitals(intakeRegistry)
        expect(vitals.connecting[0].vital.websocket.url).toBe('ws://redacted.example/')
        expect(vitals.connecting[0].vital.websocket.requested_protocols).toEqual(['redacted'])
        expect(vitals.open[0].vital.websocket.selected_protocol).toBe('redacted')
        expect(vitals.closed[0].vital.websocket.url).toBe('ws://redacted.example/')
        expect(vitals.closed[0].vital.websocket.close_code).toBe(4000)
        expect(vitals.closed[0].vital.websocket.close_reason).toBe('redacted')
      })

    createTest('ignores beforeSend changes to the other fields of WebSocket vitals')
      .withRum({
        ...RUM_CONFIGURATION,
        beforeSend: (event: any) => {
          if (event.type === 'vital' && event.vital.type === 'websocket') {
            event.vital.websocket.id = 'tampered'
            event.vital.websocket.selected_extensions = 'tampered'
          }
          return true
        },
      })
      .withBody(WebSocketPage.testBody())
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        const ws = new WebSocketPage(page)

        await ws.open()
        await ws.close()

        await flushEvents()

        const vitals = getWebSocketVitals(intakeRegistry)
        expect(vitals.all).toHaveLength(4)
        const connectionIds = getConnectionIds(vitals.all)
        expect(connectionIds).toHaveLength(1)
        expect(connectionIds[0]).not.toBe('tampered')
        expect(vitals.open[0].vital.websocket.selected_extensions).toBeUndefined()
      })

    createTest('removes the query string from the reported URL')
      .withRum(RUM_CONFIGURATION)
      .withBody(WebSocketPage.testBody())
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        const ws = new WebSocketPage(page)

        await ws.open({ query: 'token=secret' })
        await ws.close()

        await flushEvents()

        const vitals = getWebSocketVitals(intakeRegistry)
        const connectingUrl = new URL(vitals.connecting[0].vital.websocket.url)
        const closedUrl = new URL(vitals.closed[0].vital.websocket.url)
        expect(connectingUrl.pathname).toBe('/ws-echo')
        expect(connectingUrl.search).toBe('')
        expect(closedUrl.href).toBe(connectingUrl.href)
      })
  })

  test.describe('before init', () => {
    createTest('reports a connection opened and closed before init once RUM starts')
      .withRum(RUM_CONFIGURATION)
      .withRumInit(deferRumInit)
      .withBody(WebSocketPage.testBody())
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        const ws = new WebSocketPage(page)

        await ws.open()
        await ws.sendAndExpectEcho()
        await ws.close()
        await initRum(page)

        await flushEvents()

        const vitals = getWebSocketVitals(intakeRegistry)
        expect(vitals.connecting).toHaveLength(1)
        expect(vitals.open).toHaveLength(1)
        expect(vitals.closing).toHaveLength(1)
        expect(vitals.closed).toHaveLength(1)
        expect(getConnectionIds(vitals.all)).toEqual([vitals.connecting[0].vital.websocket.id])

        const closed = vitals.closed[0].vital.websocket
        expect(closed.tracking_end_reason).toBe('close_event')
        expect(closed.snapshot!.outbound.message_count).toBe(1)
        expect(closed.snapshot!.inbound.message_count).toBe(1)
      })

    createTest('keeps tracking a connection opened before init once RUM starts')
      .withRum(RUM_CONFIGURATION)
      .withRumInit(deferRumInit)
      .withBody(WebSocketPage.testBody())
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        const ws = new WebSocketPage(page)

        await ws.open()
        await ws.sendAndExpectEcho()
        await initRum(page)
        await ws.sendAndExpectEcho()
        await ws.close()

        await flushEvents()

        // the open report RUM makes as it starts, the connecting and open vitals collected before
        // init, replayed right after, then the closing and closed vitals reported live
        const vitals = getWebSocketVitals(intakeRegistry)
        expect(vitals.connecting).toHaveLength(1)
        expect(vitals.open).toHaveLength(2)
        expect(vitals.closing).toHaveLength(1)
        expect(vitals.closed).toHaveLength(1)
        expect(getConnectionIds(vitals.all)).toEqual([vitals.connecting[0].vital.websocket.id])

        // what was exchanged on either side of init adds up on the one connection
        const closed = vitals.closed[0].vital.websocket
        expect(closed.snapshot!.outbound.message_count).toBe(2)
        expect(closed.snapshot!.inbound.message_count).toBe(2)
      })

    createTest('attributes the vitals collected before init to the initial view and its URL')
      .withRum(RUM_CONFIGURATION)
      .withRumInit(deferRumInit)
      .withBody(WebSocketPage.testBody())
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        const ws = new WebSocketPage(page)

        // kept open across init, so that RUM reports it as it starts
        await ws.open()
        await initRum(page)
        await ws.close()

        await flushEvents()

        // the open report RUM makes as it starts is emitted as soon as startWebSocketCollection runs:
        // were it moved above startViewCollection in startRumEventCollection, assembly would find
        // neither the initial view nor its URL in the histories, and would discard that report. The
        // vitals collected before init are replayed in the following microtask, once the view exists.
        const initialView = intakeRegistry.rumViewEvents[0].view
        const vitals = getWebSocketVitals(intakeRegistry)
        expect(sortByDate(vitals.open).map((vital) => vital.vital.websocket.snapshot_version)).toEqual([1, 2])
        expect(vitals.all).toHaveLength(5)
        for (const { view } of vitals.all) {
          expect(view).toEqual(expect.objectContaining({ id: initialView.id, url: initialView.url }))
        }
      })

    createTest('never reports a connection opened before init whose phases the early buffer dropped')
      .withRum(RUM_CONFIGURATION)
      .withRumInit(deferRumInit)
      .withBody(WebSocketPage.testBody())
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        const ws = new WebSocketPage(page)

        // each connection buffers its connecting and open phases, so one connection more than the
        // buffer holds drops the two oldest phases: those of the connection opened first
        const connectionCount = EARLY_PHASES_BUFFER_CAPACITY / 2 + 1
        for (let i = 0; i < connectionCount; i++) {
          await ws.open()
        }
        await initRum(page)
        // send and close act on the connection opened last
        await ws.sendAndExpectEcho()
        await ws.close()

        await flushEvents()

        // the connection opened first lost its connecting phase, so it is forgotten rather than
        // reported incomplete: every connection reported has its connecting vital
        const vitals = getWebSocketVitals(intakeRegistry)
        const connectionIds = getConnectionIds(vitals.all)
        expect(connectionIds).toHaveLength(connectionCount - 1)
        expect(getConnectionIds(vitals.connecting)).toEqual(expect.arrayContaining(connectionIds))
        expect(vitals.closing).toHaveLength(1)
      })

    createTest('reports a connection opened before init as soon as RUM starts, then periodically')
      .withRum(RUM_CONFIGURATION)
      .withRumInit(deferRumInit)
      .withBody(WebSocketPage.testBody())
      .withMockClock()
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        const ws = new WebSocketPage(page)

        await ws.open()
        await initRum(page)
        await page.clock.runFor(WEBSOCKET_PERIODIC_REPORT_INTERVAL)
        await ws.close()

        await flushEvents()

        const openVitals = sortByDate(getWebSocketVitals(intakeRegistry).open)
        expect(openVitals.map((vital) => vital.vital.websocket.snapshot_version)).toEqual([1, 2, 3])
      })
  })
})

type WebSocketVital =
  | RumVitalWebsocketConnectingEvent
  | RumVitalWebsocketOpenEvent
  | RumVitalWebsocketClosingEvent
  | RumVitalWebsocketClosedEvent

function isWebSocketVital(event: RumEvent): event is WebSocketVital {
  return event.type === 'vital' && event.vital.type === 'websocket'
}

function isWebSocketConnectingVital(event: RumEvent): event is RumVitalWebsocketConnectingEvent {
  return isWebSocketVital(event) && event.vital.name === 'websocket_connecting'
}

function isWebSocketOpenVital(event: RumEvent): event is RumVitalWebsocketOpenEvent {
  return isWebSocketVital(event) && event.vital.name === 'websocket_open'
}

function isWebSocketClosingVital(event: RumEvent): event is RumVitalWebsocketClosingEvent {
  return isWebSocketVital(event) && event.vital.name === 'websocket_closing'
}

function isWebSocketClosedVital(event: RumEvent): event is RumVitalWebsocketClosedEvent {
  return isWebSocketVital(event) && event.vital.name === 'websocket_closed'
}

function getWebSocketVitals(intakeRegistry: IntakeRegistry) {
  const events = intakeRegistry.rumVitalEvents
  return {
    all: events.filter(isWebSocketVital),
    connecting: events.filter(isWebSocketConnectingVital),
    open: events.filter(isWebSocketOpenVital),
    closing: events.filter(isWebSocketClosingVital),
    closed: events.filter(isWebSocketClosedVital),
  }
}

function getConnectionIds(vitals: WebSocketVital[]) {
  return Array.from(new Set(vitals.map((vital) => vital.vital.websocket.id)))
}

function sortByDate<T extends WebSocketVital>(vitals: T[]) {
  return [...vitals].sort((a, b) => a.date - b.date)
}

/**
 * Replaces the init call `withRumInit` makes, so that the test can open connections between the SDK
 * load and init, and then call init itself with `initRum`.
 */
function deferRumInit(configuration: RumInitConfiguration) {
  window.deferredRumInit = () => window.DD_RUM!.init(configuration)
}

/**
 * Calls the deferred init and waits for RUM to start. It starts once the session is resolved, after
 * init returns, which is when the connections collected before init are reported and the collection
 * takes over their tracking.
 */
async function initRum(page: Page) {
  await page.evaluate(() => window.deferredRumInit!())
  await expect.poll(() => page.evaluate(() => window.DD_RUM!.getInternalContext())).toBeDefined()
}
