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

  if (name.includes('webkit')) {
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

export class BrowserLogsManager {
  private logs: BrowserLog[] = []

  add(log: BrowserLog) {
    this.logs.push(log)
  }

  get() {
    const filteredLogs = this.logs.filter((log) => !log.message.includes('Ignoring unsupported entryTypes: '))

    if (this.logs.some((log) => log.message.includes('Ignoring unsupported entryTypes: '))) {
      // FIXME: fix this at the perfomance observer level as it is visible to customers
      // It used to pass before because it was only happening in Firefox but wdio io did not support console logs for FF
      addTag('fixme', 'Unnexpected Console log message: "Ignoring unsupported entryTypes: *"')
    }

    return filteredLogs
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
