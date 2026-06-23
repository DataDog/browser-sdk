import type { RumResourceEvent } from '@datadog/browser-rum'
import type { RawRumEvent } from '@datadog/browser-rum-core'
import { expect, test } from '@playwright/test'
import { createTest } from '../../lib/framework'
import { expireSession, renewSession } from '../../lib/helpers/session'
import { DEFAULT_WS_OUT_MESSAGE, expectedWsEchoMessage, WebSocketPage } from '../../lib/pages/webSocketPage'

type RawRumResource = Extract<RawRumEvent, { type: 'resource' }>
type WebSocketResourceProperties = NonNullable<RawRumResource['resource']['websocket']>

/**
 * RUM resource event for our /ws-echo fixture with `resource.websocket` populated. Public
 * {@link RumResourceEvent} omits `websocket` until rum-events-format is updated — use
 * {@link isWebSocketResource} instead of casting at every filter/call site.
 */
type RumResourceEventWithWebSocket = RumResourceEvent & {
  resource: RumResourceEvent['resource'] & {
    websocket: WebSocketResourceProperties
  }
}

test.describe('rum websockets', () => {
  createTest('collect websocket-connecting vital and websocket resource when the connection closes')
    .withRum({ enableExperimentalFeatures: ['track_web_sockets'] })
    .withBody(WebSocketPage.testBody())
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const ws = new WebSocketPage(page)

      await ws.open()
      await ws.sendDefaultMessageAndExpectEcho()
      await ws.closeFromClient()

      await flushEvents()

      const connectingVital = intakeRegistry.rumVitalEvents.find((e) => e.vital.name === 'websocket-connecting')
      expect(connectingVital).toBeDefined()

      const rumEvent = getLastRumResourceEventWithWebSocket(intakeRegistry.rumResourceEvents)
      expect(rumEvent).toBeDefined()

      const { websocket } = rumEvent!.resource

      expect(websocket.connection_id).toBe(connectingVital!.vital.id)
      expect(websocket.tracking_end_reason).toBe('close_event')
      expect(websocket.messages_out.count).toBe(1)
      expect(websocket.messages_out.size).toBe(DEFAULT_WS_OUT_MESSAGE.length)
      expect(websocket.messages_in.count).toBe(1)
      expect(websocket.messages_in.size).toBe(expectedWsEchoMessage().length)
    })

  createTest('websocket resource ends with close_event when the server closes the echo socket')
    .withRum({ enableExperimentalFeatures: ['track_web_sockets'] })
    .withBody(WebSocketPage.testBody())
    .run(async ({ intakeRegistry, flushEvents, page, servers }) => {
      const ws = new WebSocketPage(page)

      await ws.open()

      servers.base.app.closeEchoWebSockets!()
      await ws.expectClosed()

      await flushEvents()

      const rumEvent = getLastRumResourceEventWithWebSocket(intakeRegistry.rumResourceEvents)
      expect(rumEvent).toBeDefined()

      expect(rumEvent!.resource.websocket.tracking_end_reason).toBe('close_event')
    })

  createTest('websocket resource is reported with session_end when the session expires')
    .withRum({ enableExperimentalFeatures: ['track_web_sockets'] })
    .withBody(WebSocketPage.testBody())
    .run(async ({ intakeRegistry, flushEvents, page, browserContext }) => {
      const ws = new WebSocketPage(page)

      await ws.open()
      await expireSession(page, browserContext)

      await flushEvents()

      const wsWithSessionEnd = getWebSocketResources(intakeRegistry.rumResourceEvents).find(
        (e) => e.resource.websocket.tracking_end_reason === 'session_end'
      )
      expect(wsWithSessionEnd).toBeDefined()
    })

  createTest(
    'websocket resource with session_end is still reported when the session is renewed before resource assembly'
  )
    .withRum({ enableExperimentalFeatures: ['track_web_sockets'] })
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

      const wsWithSessionEnd = getWebSocketResources(intakeRegistry.rumResourceEvents).find(
        (e) => e.resource.websocket.tracking_end_reason === 'session_end'
      )
      expect(wsWithSessionEnd).toBeDefined()
    })

  createTest('does not track websocket activity after the session is renewed')
    .withRum({ enableExperimentalFeatures: ['track_web_sockets'] })
    .withBody(WebSocketPage.testBody())
    .run(async ({ intakeRegistry, flushEvents, page, browserContext }) => {
      const ws = new WebSocketPage(page)

      await ws.open()
      await ws.sendDefaultMessageAndExpectEcho()
      await renewSession(page, browserContext)
      await ws.sendDefaultMessageAndExpectEcho()
      await ws.closeFromClient()

      await flushEvents()

      const wsResources = getWebSocketResources(intakeRegistry.rumResourceEvents)
      expect(wsResources).toHaveLength(1)
      expect(wsResources[0].resource.websocket.tracking_end_reason).toBe('session_end')
      expect(wsResources[0].resource.websocket.messages_out.count).toBe(1)
      expect(wsResources[0].resource.websocket.messages_in.count).toBe(1)
    })

  createTest('websocket resource keeps end_view_id when the session expires')
    .withRum({ enableExperimentalFeatures: ['track_web_sockets'] })
    .withBody(WebSocketPage.testBody())
    .run(async ({ intakeRegistry, flushEvents, page, browserContext }) => {
      const ws = new WebSocketPage(page)

      await ws.open()
      await expireSession(page, browserContext)

      await flushEvents()

      const wsWithSessionEnd = getWebSocketResources(intakeRegistry.rumResourceEvents).find(
        (e) => e.resource.websocket.tracking_end_reason === 'session_end'
      )
      expect(wsWithSessionEnd).toBeDefined()

      expect(wsWithSessionEnd!.resource.websocket.start_view_id).toBeDefined()
      // Test websocketCollection is resilient to the session expiration event being emitted after the view history is closed.
      expect(wsWithSessionEnd!.resource.websocket.end_view_id).toBeDefined()
      expect(wsWithSessionEnd!.resource.websocket.end_view_id).toBe(wsWithSessionEnd!.resource.websocket.start_view_id)
    })

  // This behavior might be updated when we're able to link the websocket connection with APM traces.
  createTest('does not collect websocket vital or resource when trackResources is false')
    .withRum({ enableExperimentalFeatures: ['track_web_sockets'], trackResources: false })
    .withBody(WebSocketPage.testBody())
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const ws = new WebSocketPage(page)

      await ws.open()
      await ws.closeFromClient()

      await flushEvents()

      const connectingVital = intakeRegistry.rumVitalEvents.find((e) => e.vital.name === 'websocket-connecting')
      expect(connectingVital).toBeUndefined()

      const wsResources = getWebSocketResources(intakeRegistry.rumResourceEvents)
      expect(wsResources).toHaveLength(0)
    })

  createTest('websocket resource records different start and end views when it spanned multiple views')
    .withRum({ enableExperimentalFeatures: ['track_web_sockets'] })
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
      await ws.wsCloseButton.click()

      await flushEvents()

      const rumEvent = getLastRumResourceEventWithWebSocket(intakeRegistry.rumResourceEvents)
      expect(rumEvent).toBeDefined()

      const { websocket } = rumEvent!.resource

      expect(websocket.start_view_id).toBeDefined()
      expect(websocket.end_view_id).toBeDefined()
      expect(websocket.start_view_id).not.toBe(websocket.end_view_id)
    })
})

function isWebSocketResource(event: RumResourceEvent): event is RumResourceEventWithWebSocket {
  // Public RumResourceEvent.resource omits `websocket` until rum-events-format is updated.
  const resource = event.resource as unknown as {
    url: unknown
    type?: string
    websocket?: WebSocketResourceProperties
  }

  return resource.type === 'websocket' && resource.websocket !== null
}

function getWebSocketResources(events: RumResourceEvent[]): RumResourceEventWithWebSocket[] {
  return events.filter(isWebSocketResource)
}

function getLastRumResourceEventWithWebSocket(events: RumResourceEvent[]): RumResourceEventWithWebSocket | undefined {
  const list = getWebSocketResources(events)
  return list.length === 0 ? undefined : list[list.length - 1]
}
