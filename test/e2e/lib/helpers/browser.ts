import * as os from 'os'
import type { BrowserContext, Page } from '@playwright/test'
import { url } from 'inspector'
import { resolve } from 'dns'

// To keep tests sane, ensure we got a fixed list of possible platforms and browser names.
const validPlatformNames = ['windows', 'macos', 'linux', 'ios', 'android'] as const
const validBrowserNames = ['edge', 'safari', 'chrome', 'firefox'] as const

export function getBrowserName(): (typeof validBrowserNames)[number] {
  const capabilities = browser.capabilities

  // Look for the browser name in capabilities. It should always be there as long as we don't change
  // the browser capabilities format.
  if (!('browserName' in capabilities) || typeof capabilities.browserName !== 'string') {
    throw new Error("Can't get browser name (no browser name)")
  }
  let browserName = capabilities.browserName.toLowerCase()
  if (browserName === 'msedge') {
    browserName = 'edge'
  } else if (browserName === 'chrome-headless-shell') {
    browserName = 'chrome'
  }
  if (!includes(validBrowserNames, browserName)) {
    throw new Error(`Can't get browser name (invalid browser name ${browserName})`)
  }

  return browserName
}

export function getPlatformName(): (typeof validPlatformNames)[number] {
  const capabilities = browser.capabilities

  let platformName: string
  if ('bstack:options' in capabilities && capabilities['bstack:options']) {
    // Look for the platform name in browserstack options. It might not be always there, for example
    // when we run the test locally. This should be adjusted when we are changing the browser
    // capabilities format.
    platformName = (capabilities['bstack:options'] as any).os
  } else {
    // The test is run locally, use the local os name
    platformName = os.type()
  }

  platformName = platformName.toLowerCase()
  if (/^(mac ?os|os ?x|mac ?os ?x|darwin)$/.test(platformName)) {
    platformName = 'macos'
  } else if (platformName === 'windows_nt') {
    platformName = 'windows'
  }
  if (!includes(validPlatformNames, platformName)) {
    throw new Error(`Can't get platform name (invalid platform name ${platformName})`)
  }

  return platformName
}

function includes<T>(list: readonly T[], item: unknown): item is T {
  return list.includes(item as any)
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
    return this.logs
  }

  clear() {
    this.logs = []
  }
}

// TODO, see if we can use the browser context to clear cookies or we should keep the previous hack
// wdio method does not work for some browsers
export function deleteAllCookies(context: BrowserContext) {
  return context.clearCookies()
}

export function setCookie(name: string, value: string, expiresDelay: number = 0) {
  return browser.execute(
    (name, value, expiresDelay) => {
      const expires = new Date(Date.now() + expiresDelay).toUTCString()

      document.cookie = `${name}=${value};expires=${expires};`
    },
    name,
    value,
    expiresDelay
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
