import type {
  RumEvent,
  RumVitalWebsocketClosedEvent,
  RumVitalWebsocketClosingEvent,
  RumVitalWebsocketConnectingEvent,
  RumVitalWebsocketOpenEvent,
} from '@datadog/browser-rum-core/src/rumEvent.types'
import { expect, test } from '@playwright/test'
import type { IntakeRegistry } from '../../lib/framework'
import { createTest } from '../../lib/framework'
import { expireSession, renewSession } from '../../lib/helpers/session'
import { DEFAULT_WS_OUT_MESSAGE, expectedWsEchoMessage, WebSocketPage } from '../../lib/pages/webSocketPage'

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
