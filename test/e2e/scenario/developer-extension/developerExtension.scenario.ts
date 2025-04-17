import path from 'path'
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createExtensionTest } from '../utils/extensionFixture'

const pathToExtension = path.join(process.cwd(), 'developer-extension', 'dist')
const test = createExtensionTest(pathToExtension).extend<{
  developerExtension: DeveloperExtensionPage
}>({
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
