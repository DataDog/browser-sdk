import { test as base, chromium } from '@playwright/test'
import type { BrowserContext } from '@playwright/test'

export interface ExtensionFixture {
  context: BrowserContext
  extensionId: string
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
      const workers = context.serviceWorkers()
      const extensionId = workers[0]?.url().split('/')[2]
      if (!extensionId) {
        const worker = await context.waitForEvent('serviceworker')
        const id = worker.url().split('/')[2]
        await use(id)
      } else {
        await use(extensionId)
      }
    },
  })
}
