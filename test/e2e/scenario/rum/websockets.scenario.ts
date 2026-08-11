import type { RumResourceEvent } from '@datadog/browser-rum'
import type { RawRumEvent, RumInitConfiguration } from '@datadog/browser-rum-core'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { createTest } from '../../lib/framework'
import { expireSession, renewSession } from '../../lib/helpers/session'
import {
  closePreInitWebSocket,
  DEFAULT_WS_OUT_MESSAGE,
  expectedWsEchoMessage,
  preInitWebSocketScript,
  WebSocketPage,
} from '../../lib/pages/webSocketPage'

declare global {
  interface Window {
    RUM_INIT_TIME?: number
  }
}

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

const NANOSECONDS_PER_MILLISECOND = 1e6

test.describe('rum websockets', () => {
  createTest('collect websocket vitals and websocket resource when the connection closes')
    .withRum({ enableExperimentalFeatures: ['track_websockets'] })
    .withBody(WebSocketPage.testBody())
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const ws = new WebSocketPage(page)

      await ws.open()
      await ws.sendDefaultMessageAndExpectEcho()
      await ws.closeFromClient()

      await flushEvents()

      const connectingVital = intakeRegistry.rumVitalEvents.find((e) => e.vital.name === 'websocket-connecting')
      expect(connectingVital).toBeDefined()

      const closedVital = intakeRegistry.rumVitalEvents.find((e) => e.vital.name === 'websocket-closed')
      expect(closedVital).toBeDefined()

      const rumEvent = getLastRumResourceEventWithWebSocket(intakeRegistry.rumResourceEvents)
      expect(rumEvent).toBeDefined()

      const { websocket } = rumEvent!.resource

      expect(websocket.connection_id).toBe(connectingVital!.context!.connection_id)
      expect(closedVital!.context!.connection_id).toBe(websocket.connection_id)
      expect(closedVital!.date).toBe(websocket.end_time)
      expect(websocket.tracking_end_reason).toBe('close_event')
      expect(websocket.messages_out.count).toBe(1)
      expect(websocket.messages_out.size).toBe(DEFAULT_WS_OUT_MESSAGE.length)
      expect(websocket.messages_in.count).toBe(1)
      expect(websocket.messages_in.size).toBe(expectedWsEchoMessage().length)
    })

  createTest('websocket resource ends with close_event when the server closes the echo socket')
    .withRum({ enableExperimentalFeatures: ['track_websockets'] })
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

  createTest('collects the websocket-closed vital when the session expires')
    .withRum({ enableExperimentalFeatures: ['track_websockets'] })
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

      const closedVital = intakeRegistry.rumVitalEvents.find((e) => e.vital.name === 'websocket-closed')
      expect(closedVital).toBeDefined()
      expect(closedVital!.context!.connection_id).toBe(wsWithSessionEnd!.resource.websocket.connection_id)
      expect(closedVital!.date).toBe(wsWithSessionEnd!.resource.websocket.end_time)
      expect(closedVital!.session.id).toBe(wsWithSessionEnd!.session.id)
      expect(closedVital!.view.id).toBe(wsWithSessionEnd!.resource.websocket.end_view_id)
      expect(closedVital!.view.url).toBe(wsWithSessionEnd!.view.url)

      const associatedView = intakeRegistry.rumViewEvents.find((event) => event.view.id === closedVital!.view.id)
      expect(associatedView).toBeDefined()

      const viewEndTime = associatedView!.date + associatedView!.view.time_spent / NANOSECONDS_PER_MILLISECOND
      expect(closedVital!.date).toBeLessThanOrEqual(viewEndTime)
      expect(wsWithSessionEnd!.resource.websocket.end_time).toBeLessThanOrEqual(viewEndTime)
    })

  createTest(
    'websocket resource with session_end is still reported when the session is renewed before resource assembly'
  )
    .withRum({ enableExperimentalFeatures: ['track_websockets'] })
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
    .withRum({ enableExperimentalFeatures: ['track_websockets'] })
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
    .withRum({ enableExperimentalFeatures: ['track_websockets'] })
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
    .withRum({ enableExperimentalFeatures: ['track_websockets'], trackResources: false })
    .withBody(WebSocketPage.testBody())
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      const ws = new WebSocketPage(page)

      await ws.open()
      await ws.closeFromClient()

      await flushEvents()

      const connectingVital = intakeRegistry.rumVitalEvents.find((e) => e.vital.name === 'websocket-connecting')
      expect(connectingVital).toBeUndefined()

      const closedVital = intakeRegistry.rumVitalEvents.find((e) => e.vital.name === 'websocket-closed')
      expect(closedVital).toBeUndefined()

      const wsResources = getWebSocketResources(intakeRegistry.rumResourceEvents)
      expect(wsResources).toHaveLength(0)
    })

  createTest('collects a websocket opened and used before init()')
    .withRum({ enableExperimentalFeatures: ['track_websockets'] })
    .withRumInit(recordInitTime)
    .withPreInitScript(preInitWebSocketScript())
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await closePreInitWebSocket(page)

      // Read before flushing: flushEvents() navigates away and drops the page state.
      const initTime = await getInitTime(page)

      await flushEvents()

      const rumEvent = getLastRumResourceEventWithWebSocket(intakeRegistry.rumResourceEvents)
      expect(rumEvent).toBeDefined()

      const { websocket } = rumEvent!.resource

      // The message was exchanged before init(): it is only counted if the SDK buffered it.
      expect(websocket.messages_out.count).toBe(1)
      expect(websocket.messages_out.size).toBe(DEFAULT_WS_OUT_MESSAGE.length)
      expect(websocket.messages_in.count).toBe(1)
      expect(websocket.messages_in.size).toBe(expectedWsEchoMessage().length)

      // Timings come from the constructor call, not from init().
      expect(websocket.start_time).toBeLessThan(initTime)
      expect(websocket.handshake_succeeded).toBe(true)
      expect(websocket.start_time + websocket.setup_duration / NANOSECONDS_PER_MILLISECOND).toBeLessThanOrEqual(
        initTime
      )

      const connectingVital = intakeRegistry.rumVitalEvents.find((e) => e.vital.name === 'websocket-connecting')
      expect(connectingVital).toBeDefined()
      expect(connectingVital!.context!.connection_id).toBe(websocket.connection_id)
      expect(connectingVital!.date).toBeLessThan(initTime)
    })

  createTest('collects a websocket whose whole lifecycle happened before init()')
    .withRum({ enableExperimentalFeatures: ['track_websockets'] })
    .withRumInit(recordInitTime)
    .withPreInitScript(preInitWebSocketScript({ closeBeforeInit: true }))
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      // Read before flushing: flushEvents() navigates away and drops the page state.
      const initTime = await getInitTime(page)

      await flushEvents()

      const rumEvent = getLastRumResourceEventWithWebSocket(intakeRegistry.rumResourceEvents)
      expect(rumEvent).toBeDefined()

      const { websocket } = rumEvent!.resource

      expect(websocket.tracking_end_reason).toBe('close_event')
      expect(websocket.messages_out.count).toBe(1)
      expect(websocket.messages_in.count).toBe(1)

      // The connection was opened, used and closed while the SDK was only buffering.
      expect(websocket.start_time).toBeLessThan(initTime)
      expect(websocket.end_time).toBeLessThanOrEqual(initTime)

      const closedVital = intakeRegistry.rumVitalEvents.find((e) => e.vital.name === 'websocket-closed')
      expect(closedVital).toBeDefined()
      expect(closedVital!.context!.connection_id).toBe(websocket.connection_id)
    })

  createTest('websocket resource records different start and end views when it spanned multiple views')
    .withRum({ enableExperimentalFeatures: ['track_websockets'] })
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
      await ws.closeFromClient()

      await flushEvents()

      const rumEvent = getLastRumResourceEventWithWebSocket(intakeRegistry.rumResourceEvents)
      expect(rumEvent).toBeDefined()

      const { websocket } = rumEvent!.resource

      expect(websocket.start_view_id).toBeDefined()
      expect(websocket.end_view_id).toBeDefined()
      expect(websocket.start_view_id).not.toBe(websocket.end_view_id)
    })
})

/**
 * Serialized into the page, so it must stay self-contained. Marks the moment init() runs, to
 * assert that pre-init timings are measured from the real WebSocket constructor call.
 */
function recordInitTime(configuration: RumInitConfiguration) {
  window.RUM_INIT_TIME = Date.now()
  window.DD_RUM!.init(configuration)
}

/**
 * init() is held back until the pre-init WebSocket exchange completes, which can outlast the load
 * event page.goto() waits for — so wait for the marker rather than assuming it is already set.
 */
async function getInitTime(page: Page) {
  await page.waitForFunction(() => window.RUM_INIT_TIME !== undefined)
  const initTime = await page.evaluate(() => window.RUM_INIT_TIME)
  return initTime!
}

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
