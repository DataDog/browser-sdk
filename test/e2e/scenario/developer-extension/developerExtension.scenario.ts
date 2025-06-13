import path from 'path'
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createTest } from '../../lib/framework'

createTest('should switch between tabs')
  .withExtension(path.join(process.cwd(), 'developer-extension', 'dist'))
  .run(async ({ page, getExtensionId, flushBrowserLogs }) => {
    const extensionId = await getExtensionId()

    await page.goto(`chrome-extension://${extensionId}/panel.html`)

    const developerExtension = new DeveloperExtensionPage(page)

    expect(await developerExtension.getSelectedTab().innerText()).toEqual('Events')

    await developerExtension.getTab('Infos').click()
    expect(await developerExtension.getSelectedTab().innerText()).toEqual('Infos')

    flushBrowserLogs()
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
