import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { html } from '../framework'

const ELEMENT_IDS = {
  status: 'ws-status',
  lastMessage: 'ws-last-message',
  messageInput: 'ws-message',
  open: 'ws-open',
  send: 'ws-send',
  closeClient: 'ws-close-client',
} as const

export const DEFAULT_WS_OUT_MESSAGE = 'e2e-ws-ping'

export function expectedWsEchoMessage(out = DEFAULT_WS_OUT_MESSAGE) {
  return `echo: ${out}`
}

/** In-page expression evaluating to the /ws-echo URL for the current origin. */
const WS_ECHO_URL = `(function () {
  var url = new URL('/ws-echo', location.href)
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
})()`

/** Handle exposed by {@link preInitWebSocketScript} to drive the socket it opened. */
interface PreInitWebSocketHandle {
  closed: boolean
  close: () => void
}

declare global {
  interface Window {
    preInitWebSocket?: PreInitWebSocketHandle
  }
}

export class WebSocketPage {
  readonly wsOpenButton: Locator
  readonly wsStatusParagraph: Locator
  readonly wsSendButton: Locator
  readonly wsCloseButton: Locator
  readonly wsLastMessageParagraph: Locator
  readonly wsMessageInput: Locator

  constructor(page: Page) {
    this.wsOpenButton = page.locator(`#${ELEMENT_IDS.open}`)
    this.wsStatusParagraph = page.locator(`#${ELEMENT_IDS.status}`)
    this.wsSendButton = page.locator(`#${ELEMENT_IDS.send}`)
    this.wsCloseButton = page.locator(`#${ELEMENT_IDS.closeClient}`)
    this.wsLastMessageParagraph = page.locator(`#${ELEMENT_IDS.lastMessage}`)
    this.wsMessageInput = page.locator(`#${ELEMENT_IDS.messageInput}`)
  }

  static testBody(outMessage = DEFAULT_WS_OUT_MESSAGE): string {
    return html`
      <p id="${ELEMENT_IDS.status}"></p>
      <p id="${ELEMENT_IDS.lastMessage}"></p>
      <input id="${ELEMENT_IDS.messageInput}" type="text" value="${outMessage}" />
      <button type="button" id="${ELEMENT_IDS.open}">ws-open</button>
      <button type="button" id="${ELEMENT_IDS.send}">ws-send</button>
      <button type="button" id="${ELEMENT_IDS.closeClient}">ws-close-client</button>
      <script>
        ;(function () {
          var ws
          function wsUrl() {
            var u = new URL('/ws-echo', location.href)
            u.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
            return u.toString()
          }
          document.getElementById('${ELEMENT_IDS.open}').addEventListener('click', function () {
            ws = new WebSocket(wsUrl())
            var status = document.getElementById('${ELEMENT_IDS.status}')
            var last = document.getElementById('${ELEMENT_IDS.lastMessage}')
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
          document.getElementById('${ELEMENT_IDS.send}').addEventListener('click', function () {
            var text = document.getElementById('${ELEMENT_IDS.messageInput}').value
            ws.send(text)
          })
          document.getElementById('${ELEMENT_IDS.closeClient}').addEventListener('click', function () {
            ws.close()
          })
        })()
      </script>
    `
  }

  async open() {
    await this.wsOpenButton.click()
    await this.expectOpen()
  }

  async sendMessage(text?: string) {
    if (text !== undefined) {
      await this.wsMessageInput.fill(text)
    }
    await this.wsSendButton.click()
  }

  async sendDefaultMessageAndExpectEcho(outMessage = DEFAULT_WS_OUT_MESSAGE) {
    await this.sendMessage()
    await this.expectLastMessage(expectedWsEchoMessage(outMessage))
  }

  async closeFromClient() {
    await this.wsCloseButton.click()
    await this.expectClosed()
  }

  async expectOpen() {
    await expect(this.wsStatusParagraph).toHaveText('open')
  }

  async expectClosed() {
    await expect(this.wsStatusParagraph).toContainText('closed')
  }

  async expectLastMessage(text: string) {
    await expect(this.wsLastMessageParagraph).toHaveText(text)
  }
}

/**
 * Script for `createTest().withPreInitScript()`: opens a socket to /ws-echo and exchanges a
 * message before `init()` runs. It returns a promise, so the exchange — and, with
 * `closeBeforeInit`, the close as well — is guaranteed to complete while the SDK is only
 * buffering. The socket is left open otherwise, and can be closed later with
 * {@link closePreInitWebSocket}.
 *
 * It has no DOM dependency: it runs in the page `<head>`, before the body exists.
 */
export function preInitWebSocketScript({ closeBeforeInit = false } = {}) {
  return `
    var socket = new WebSocket(${WS_ECHO_URL})
    var handle = {
      closed: false,
      close: function () {
        socket.close()
      },
    }
    window.preInitWebSocket = handle
    return new Promise(function (resolve) {
      socket.addEventListener('open', function () {
        socket.send(${JSON.stringify(DEFAULT_WS_OUT_MESSAGE)})
      })
      socket.addEventListener('message', function () {
        ${closeBeforeInit ? 'socket.close()' : 'resolve()'}
      })
      // Also covers a failed handshake: an 'error' is always followed by a 'close', so init() is
      // never held back forever.
      socket.addEventListener('close', function () {
        handle.closed = true
        resolve()
      })
    })
  `
}

export async function closePreInitWebSocket(page: Page) {
  // page.goto() only waits for the load event, which can happen before the SDK bundle is
  // evaluated (async setup) and therefore before the pre-init script has run.
  await page.waitForFunction(() => window.preInitWebSocket !== undefined)
  await page.evaluate(() => window.preInitWebSocket!.close())
  await page.waitForFunction(() => window.preInitWebSocket!.closed)
}
