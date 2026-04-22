import { execFileSync } from 'node:child_process'
import { URL } from 'node:url'
import { expect, type Page, type Request } from '@playwright/test'

export interface RumViewEventPayload {
  type: 'view'
  view: {
    name?: string
    url?: string
  }
}

export function normalizePathname(pathname: string) {
  if (!pathname.trim()) {
    return '/'
  }

  let normalizedPathname = pathname.trim()
  if (!normalizedPathname.startsWith('/')) {
    normalizedPathname = `/${normalizedPathname}`
  }
  if (normalizedPathname.length > 1) {
    normalizedPathname = normalizedPathname.replace(/\/+$/, '')
  }
  return normalizedPathname || '/'
}

export function createRumViewTracker(page: Page) {
  const viewEvents: RumViewEventPayload[] = []

  page.on('request', (request) => {
    if (!isRumIntakeRequest(request)) {
      return
    }

    for (const event of parseRumPayload(request)) {
      if (event.type === 'view') {
        viewEvents.push(event as RumViewEventPayload)
      }
    }
  })

  return {
    viewEvents,
    async waitForViewCount(expectedCount: number) {
      await expect
        .poll(
          () => viewEvents.length,
          {
            timeout: 30_000,
            message: `Expected at least ${expectedCount} RUM view events from Salesforce navigation`,
          }
        )
        .toBeGreaterThanOrEqual(expectedCount)
    },
  }
}

export async function flushRumEvents(page: Page) {
  await page.goto('about:blank')
}

export async function openLightningWithSf(page: Page, orgAlias: string, path: string) {
  const rawResponse = execFileSync('sf', ['org', 'open', '-o', orgAlias, '-p', path, '-r', '--json'], {
    encoding: 'utf8',
  })
  const response = JSON.parse(rawResponse) as { result?: { url?: string } }
  const url = response.result?.url

  if (!url) {
    throw new Error(`Unable to open Salesforce org '${orgAlias}' with a one-time login URL.`)
  }

  await page.goto(url)
}

export function getExpectedViewUrl(baseUrl: string, pathname: string) {
  return new URL(pathname, `${baseUrl.replace(/\/+$/, '')}/`).href
}

function isRumIntakeRequest(request: Request) {
  const url = request.url()
  return request.method() === 'POST' && /\/api\/v2\/rum(?:[/?]|$)/.test(url)
}

function parseRumPayload(request: Request) {
  const bodyBuffer = request.postDataBuffer()
  if (!bodyBuffer?.length) {
    return []
  }

  return bodyBuffer
    .toString('utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type?: string })
}
