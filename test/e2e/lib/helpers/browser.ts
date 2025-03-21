import type { BrowserContext, Page } from '@playwright/test'
import { addTag } from './tags'

export function getBrowserName(name: string) {
  const lowerCaseName = name.toLowerCase()

  if (lowerCaseName.includes('firefox')) {
    return 'firefox'
  }

  if (lowerCaseName.includes('edge')) {
    return 'msedge'
  }

  if (lowerCaseName.includes('webkit')) {
    return 'webkit'
  }

  return 'chromium'
}

export interface BrowserLog {
  level: 'log' | 'debug' | 'info' | 'error' | 'warning'
  message: string
  source: string
  timestamp: number
}

const IGNORE_LOG_MESSAGES = ['Ignoring unsupported entryTypes:', 'Layout was forced before the page was fully loaded.']

export class BrowserLogsManager {
  private logs: BrowserLog[] = []

  add(log: BrowserLog) {
    this.logs.push(log)
  }

  get() {
    return this.logs.filter((log) => {
      if (IGNORE_LOG_MESSAGES.some((message) => log.message.includes(message))) {
        addTag('test.fixme', `Unnexpected Console log message: "${log.message}"`)
        return false
      }

      return true
    })
  }

  clear() {
    this.logs = []
  }
}

export function deleteAllCookies(context: BrowserContext) {
  return context.clearCookies()
}

export function setCookie(page: Page, name: string, value: string, expiresDelay: number = 0) {
  return page.evaluate(
    ({ name, value, expiresDelay }: { name: string; value: string; expiresDelay: number }) => {
      const expires = new Date(Date.now() + expiresDelay).toUTCString()

      document.cookie = `${name}=${value};expires=${expires};`
    },
    { name, value, expiresDelay }
  )
}

export async function sendXhr(page: Page, url: string, headers: string[][] = []): Promise<string> {
  type State = { state: 'success'; response: string } | { state: 'error' }

  const result: State = await page.evaluate(
    ([url, headers]) =>
      new Promise((resolve) => {
        const xhr = new XMLHttpRequest()
        let state: State = { state: 'error' }
        xhr.addEventListener('load', () => {
          state = { state: 'success', response: xhr.response as string }
        })
        xhr.addEventListener('loadend', () => resolve(state))
        xhr.open('GET', url)
        headers.forEach((header) => xhr.setRequestHeader(header[0], header[1]))
        xhr.send()
      }),
    [url, headers] as const
  )

  if (result.state === 'error') {
    throw new Error(`sendXhr: request to ${url} failed`)
  }
  return result.response
}
