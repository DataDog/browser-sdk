import { test as base, chromium, Page, type BrowserContext, expect } from '@playwright/test'
import path from 'path'

const test = base.extend<{
  context: BrowserContext
  extensionId: string
  developerExtension: DeveloperExtensionPage
}>({
  context: async ({}, use) => {
    const pathToExtension = path.join(process.cwd(), 'developer-extension', 'dist')

    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${pathToExtension}`, `--load-extension=${pathToExtension}`],
    })
    await use(context)
    await context.close()
  },
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers()
    if (!background) background = await context.waitForEvent('serviceworker')

    const extensionId = background.url().split('/')[2]
    await use(extensionId)
  },
  developerExtension: async ({ page, extensionId }, use) => {
    await page.goto(`chrome-extension://${extensionId}/panel.html`)

    await use(new DeveloperExtensionPage(page))
  },
})

test.describe('developer-extension', () => {
  test('should switch between tabs', async ({ developerExtension: page }) => {
    expect(await page.getSelectedTab().innerText()).toEqual('Events')

    await page.getTab('Infos').click()
    expect(await page.getSelectedTab().innerText()).toEqual('Infos')
  })
})

class DeveloperExtensionPage {
  constructor(public readonly page: Page) {}

  getTab(name: string) {
    return this.page.getByRole('tab', { name })
  }

  getSelectedTab() {
    return this.page.getByRole('tab', { selected: true })
  }
}
