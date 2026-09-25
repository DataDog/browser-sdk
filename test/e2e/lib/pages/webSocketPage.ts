import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { html } from '../framework'

declare global {
  interface Window {
    webSocketPage?: WebSocketPageApi
  }
}

interface WebSocketPageApi {
  open: (options?: WebSocketOpenOptions) => void
  send: (text: string) => void
  close: (code?: number, reason?: string) => void
}

export interface WebSocketOpenOptions {
  protocols?: string[]
  /** Query string to open the `/ws-echo` URL with, without the leading `?` */
  query?: string
}

const ELEMENT_IDS = {
  status: 'ws-status',
  lastMessage: 'ws-last-message',
  receivedCount: 'ws-received-count',
} as const

export const DEFAULT_WS_OUT_MESSAGE = 'e2e-ws-ping'

export function expectedWsEchoMessage(out = DEFAULT_WS_OUT_MESSAGE) {
  return `echo: ${out}`
}

/**
 * Drives one WebSocket on the `/ws-echo` fixture. The page reflects the socket's state in the DOM so
 * that each step can wait for the browser to have observed it.
 */
export class WebSocketPage {
  private readonly status: Locator
  private readonly lastMessage: Locator
  private readonly receivedCount: Locator

  constructor(private readonly page: Page) {
    this.status = page.locator(`#${ELEMENT_IDS.status}`)
    this.lastMessage = page.locator(`#${ELEMENT_IDS.lastMessage}`)
    this.receivedCount = page.locator(`#${ELEMENT_IDS.receivedCount}`)
  }

  static testBody(): string {
    return html`
      <p id="${ELEMENT_IDS.status}"></p>
      <p id="${ELEMENT_IDS.lastMessage}"></p>
      <p id="${ELEMENT_IDS.receivedCount}"></p>
      <script>
        ;(function () {
          var ws
          var status = document.getElementById('${ELEMENT_IDS.status}')
          var lastMessage = document.getElementById('${ELEMENT_IDS.lastMessage}')
          var receivedCount = document.getElementById('${ELEMENT_IDS.receivedCount}')

          function wsUrl(query) {
            var url = new URL('/ws-echo', location.href)
            url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
            if (query) {
              url.search = query
            }
            return url.toString()
          }

          window.webSocketPage = {
            open: function (options) {
              options = options || {}
              ws = options.protocols
                ? new WebSocket(wsUrl(options.query), options.protocols)
                : new WebSocket(wsUrl(options.query))
              status.textContent = 'connecting'
              receivedCount.textContent = '0'
              ws.addEventListener('open', function () {
                status.textContent = 'open'
              })
              ws.addEventListener('message', function (event) {
                lastMessage.textContent = event.data
                receivedCount.textContent = String(Number(receivedCount.textContent) + 1)
              })
              ws.addEventListener('close', function () {
                status.textContent = 'closed'
              })
            },
            send: function (text) {
              ws.send(text)
            },
            close: function (code, reason) {
              ws.close(code, reason)
            },
          }
        })()
      </script>
    `
  }

  async open(options: WebSocketOpenOptions = {}) {
    await this.page.evaluate((options) => window.webSocketPage!.open(options), options)
    await this.expectStatus('open')
  }

  /** Calls `close()` in the same task as the constructor, so the opening handshake cannot complete first. */
  async openAndCloseWhileConnecting() {
    await this.page.evaluate(() => {
      window.webSocketPage!.open()
      window.webSocketPage!.close()
    })
    await this.expectStatus('closed')
  }

  async sendAndExpectEcho(text = DEFAULT_WS_OUT_MESSAGE) {
    const receivedCountBefore = Number(await this.receivedCount.textContent())
    await this.page.evaluate((text) => window.webSocketPage!.send(text), text)
    await expect(this.receivedCount).toHaveText(String(receivedCountBefore + 1))
    await expect(this.lastMessage).toHaveText(expectedWsEchoMessage(text))
  }

  async close(code?: number, reason?: string) {
    await this.page.evaluate(({ code, reason }) => window.webSocketPage!.close(code, reason), { code, reason })
    await this.expectClosed()
  }

  /** Calls `close()` a second time in the same task, so it always finds the socket closing. */
  async closeTwice() {
    await this.page.evaluate(() => {
      window.webSocketPage!.close()
      window.webSocketPage!.close()
    })
    await this.expectClosed()
  }

  async expectClosed() {
    await this.expectStatus('closed')
  }

  private async expectStatus(status: 'open' | 'closed') {
    await expect(this.status).toHaveText(status)
  }
}
