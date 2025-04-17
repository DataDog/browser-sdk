import { test as base, chromium } from '@playwright/test'
import type { BrowserContext, Worker } from '@playwright/test'

export interface ExtensionFixture {
  context: BrowserContext
  extensionId: string
}

async function waitForServiceWorker(context: BrowserContext, maxAttempts = 3, delayMs = 1000): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const workers = context.serviceWorkers()
    const existingExtensionId = workers[0]?.url().split('/')[2]
    if (existingExtensionId) {
      return existingExtensionId
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  // If we still don't have a service worker, wait for one with a timeout
  const worker = await Promise.race([
    (await context.waitForEvent('serviceworker', { timeout: 5000 })) as unknown as Promise<Worker>,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Service worker timeout')), 5000)),
  ])
  return worker.url().split('/')[2]
}

export function createExtensionTest(extensionPath: string) {
  return base.extend<ExtensionFixture>({
    // eslint-disable-next-line no-empty-pattern
    context: async ({}, use, testInfo) => {
      testInfo.skip(testInfo.project.name !== 'chromium', 'Extension tests only run in Chromium')

      const context = await chromium.launchPersistentContext('', {
        channel: 'chromium',
        args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
      })
      await use(context)
      await context.close()
    },
    extensionId: async ({ context }, use) => {
      try {
        const extensionId = await waitForServiceWorker(context)
        await use(extensionId)
      } catch (error) {
        console.error('Failed to get extension ID:', error)
        throw error
      }
    },
  })
}
