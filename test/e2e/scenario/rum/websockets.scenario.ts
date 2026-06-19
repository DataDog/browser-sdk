import type { RumResourceEvent } from '@datadog/browser-rum'
import type { RawRumEvent } from '@datadog/browser-rum-core'
import { expect, test } from '@playwright/test'
import { createTest, html } from '../../lib/framework'
import { expireSession } from '../../lib/helpers/session'

const KNOWN_OUT_WS_MESSAGE = 'e2e-ws-ping'
const KNOWN_IN_WS_MESSAGE = `echo: ${KNOWN_OUT_WS_MESSAGE}`

const WEBSOCKET_TEST_BODY = html`
  <p id="ws-status"></p>
  <p id="ws-last-message"></p>
  <input id="ws-message" type="text" value="${KNOWN_OUT_WS_MESSAGE}" />
  <button type="button" id="ws-open">ws-open</button>
  <button type="button" id="ws-send">ws-send</button>
  <button type="button" id="ws-close-client">ws-close-client</button>
  <script>
    ;(function () {
      var ws
      function wsUrl() {
        var u = new URL('/ws-echo', location.href)
        u.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
        return u.toString()
      }
      document.getElementById('ws-open').addEventListener('click', function () {
        ws = new WebSocket(wsUrl())
        var status = document.getElementById('ws-status')
        var last = document.getElementById('ws-last-message')
        ws.addEventListener('open', function () {
          status.textContent = 'open'
        })
        ws.addEventListener('message', function (ev) {
          last.textContent = ev.data
          status.textContent = (status.textContent || '') + '|message'
        })
        ws.addEventListener('close', function () {
          status.textContent = (status.textContent || '') + '|closed'
        })
        ws.addEventListener('error', function () {
          status.textContent = (status.textContent || '') + '|error'
        })
      })
      document.getElementById('ws-send').addEventListener('click', function () {
        var text = document.getElementById('ws-message').value
        ws.send(text)
      })
      document.getElementById('ws-close-client').addEventListener('click', function () {
        ws.close()
      })
    })()
  </script>
`

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
    .withBody(WEBSOCKET_TEST_BODY)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.locator('#ws-open').click()
      await expect(page.locator('#ws-status')).toHaveText('open')
      await page.locator('#ws-send').click()
      await expect(page.locator('#ws-last-message')).toHaveText(KNOWN_IN_WS_MESSAGE)
      await page.locator('#ws-close-client').click()
      await expect(page.locator('#ws-status')).toContainText('closed')

      await flushEvents()

      const connectingVital = intakeRegistry.rumVitalEvents.find((e) => e.vital.name === 'websocket-connecting')
      expect(connectingVital).toBeDefined()

      const rumEvent = getLastRumResourceEventWithWebSocket(intakeRegistry.rumResourceEvents)
      expect(rumEvent).toBeDefined()

      const { websocket: ws } = rumEvent!.resource

      expect(ws.connection_id).toBe(connectingVital!.vital.id)
      expect(ws.tracking_end_reason).toBe('close_event')
      expect(ws.messages_out.count).toBe(1)
      expect(ws.messages_out.size).toBe(KNOWN_OUT_WS_MESSAGE.length)
      expect(ws.messages_in.count).toBe(1)
      expect(ws.messages_in.size).toBe(KNOWN_IN_WS_MESSAGE.length)
    })

  createTest('websocket resource ends with close_event when the server closes the echo socket')
    .withRum({ enableExperimentalFeatures: ['track_web_sockets'] })
    .withBody(WEBSOCKET_TEST_BODY)
    .run(async ({ intakeRegistry, flushEvents, page, servers }) => {
      await page.locator('#ws-open').click()
      await expect(page.locator('#ws-status')).toHaveText('open')

      servers.base.app.closeEchoWebSockets!()
      await expect(page.locator('#ws-status')).toContainText('closed')

      await flushEvents()

      const rumEvent = getLastRumResourceEventWithWebSocket(intakeRegistry.rumResourceEvents)
      expect(rumEvent).toBeDefined()

      expect(rumEvent!.resource.websocket.tracking_end_reason).toBe('close_event')
    })

  createTest('websocket resource is reported with session_end when the session expires')
    .withRum({ enableExperimentalFeatures: ['track_web_sockets'] })
    .withBody(WEBSOCKET_TEST_BODY)
    .run(async ({ intakeRegistry, flushEvents, page, browserContext }) => {
      await page.locator('#ws-open').click()
      await expect(page.locator('#ws-status')).toHaveText('open')
      await expireSession(page, browserContext)

      await flushEvents()

      const wsWithSessionEnd = getWebSocketResources(intakeRegistry.rumResourceEvents).find(
        (e) => e.resource.websocket.tracking_end_reason === 'session_end'
      )
      expect(wsWithSessionEnd).toBeDefined()
    })

  createTest('websocket resource records different start and end views when it spanned multiple views')
    .withRum({ enableExperimentalFeatures: ['track_web_sockets'] })
    .withBody(WEBSOCKET_TEST_BODY)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.DD_RUM!.startView('view-a')
      })
      await page.locator('#ws-open').click()
      await expect(page.locator('#ws-status')).toHaveText('open')
      await page.evaluate(() => {
        window.DD_RUM!.startView('view-b')
      })
      await page.locator('#ws-close-client').click()

      await flushEvents()

      const rumEvent = getLastRumResourceEventWithWebSocket(intakeRegistry.rumResourceEvents)
      expect(rumEvent).toBeDefined()

      const { websocket: ws } = rumEvent!.resource

      expect(ws.start_view_id).toBeDefined()
      expect(ws.end_view_id).toBeDefined()
      expect(ws.start_view_id).not.toBe(ws.end_view_id)
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
