import type {
  RumEvent,
  RumVitalWebsocketClosedEvent,
  RumVitalWebsocketClosingEvent,
  RumVitalWebsocketConnectingEvent,
  RumVitalWebsocketOpenEvent,
} from '@datadog/browser-rum-core/src/rumEvent.types'
import { WEBSOCKET_HEARTBEAT_INTERVAL } from '@datadog/browser-rum-core/src/domain/webSocket/webSocketCollection'
import { expect, test } from '@playwright/test'
import type { IntakeRegistry } from '../../lib/framework'
import { createTest } from '../../lib/framework'
import { expireSession, renewSession } from '../../lib/helpers/session'
import { DEFAULT_WS_OUT_MESSAGE, expectedWsEchoMessage, WebSocketPage } from '../../lib/pages/webSocketPage'

declare global {
  interface Window {
    dismissedVitalNames?: string[]
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

  test.describe('heartbeat', () => {
    createTest('beats the open vital with a new snapshot version while the connection stays open')
      .withRum(RUM_CONFIGURATION)
      .withBody(WebSocketPage.testBody())
      .withMockClock()
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        const ws = new WebSocketPage(page)

        await ws.open()
        await page.clock.runFor(WEBSOCKET_HEARTBEAT_INTERVAL)
        await ws.sendAndExpectEcho()
        await page.clock.runFor(WEBSOCKET_HEARTBEAT_INTERVAL)
        await ws.close()

        await flushEvents()

        const vitals = getWebSocketVitals(intakeRegistry)
        const openVitals = sortByDate(vitals.open)
        expect(openVitals.map((vital) => vital.vital.websocket.snapshot_version)).toEqual([1, 2, 3])
        expect(openVitals.map((vital) => vital.vital.websocket.snapshot.outbound.message_count)).toEqual([0, 0, 1])
        expect(vitals.closed[0].vital.websocket.snapshot_version).toBe(4)
      })

    createTest('grows longest_silence across beats on a quiet connection')
      .withRum(RUM_CONFIGURATION)
      .withBody(WebSocketPage.testBody())
      .withMockClock()
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        const ws = new WebSocketPage(page)

        await ws.open()
        // longest_silence includes the silence still open since the last message
        await ws.sendAndExpectEcho()
        await page.clock.runFor(WEBSOCKET_HEARTBEAT_INTERVAL)
        await page.clock.runFor(WEBSOCKET_HEARTBEAT_INTERVAL)
        await ws.close()

        await flushEvents()

        const [, firstBeat, secondBeat] = sortByDate(getWebSocketVitals(intakeRegistry).open)
        const firstSilence = firstBeat.vital.websocket.snapshot.inbound.longest_silence
        const secondSilence = secondBeat.vital.websocket.snapshot.inbound.longest_silence
        expect(firstSilence).toBeGreaterThan(0)
        expect(secondSilence).toBeGreaterThan(firstSilence)
      })

    createTest('stops beating once the connection is closed')
      .withRum(RUM_CONFIGURATION)
      .withBody(WebSocketPage.testBody())
      .withMockClock()
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        const ws = new WebSocketPage(page)

        await ws.open()
        await ws.close()
        await page.clock.runFor(2 * WEBSOCKET_HEARTBEAT_INTERVAL)

        await flushEvents()

        // only the vital reported when the connection opened
        expect(getWebSocketVitals(intakeRegistry).open).toHaveLength(1)
      })

    createTest('beats the open vital when the page is hidden, without waiting for the interval')
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

        const url = new URL(getWebSocketVitals(intakeRegistry).connecting[0].vital.websocket.url)
        expect(url.pathname).toBe('/ws-echo')
        expect(url.search).toBe('')
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
