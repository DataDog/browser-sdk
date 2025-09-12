import path from 'path'
import { expect } from '@playwright/test'
import { createExtension, createTest } from '../../lib/framework'

const developerExtensionPath = path.join(process.cwd(), 'developer-extension', 'dist')

createTest('should switch between tabs')
  .withExtension(createExtension(developerExtensionPath))
  .run(async ({ page, getExtensionId, flushBrowserLogs }) => {
    const extensionId = await getExtensionId()

    await page.goto(`chrome-extension://${extensionId}/panel.html`)

    const getSelectedTab = () => page.getByRole('tab', { selected: true })
    const getTab = (name: string) => page.getByRole('tab', { name })

    expect(await getSelectedTab().innerText()).toEqual('Events')

    await getTab('Infos').click()
    expect(await getSelectedTab().innerText()).toEqual('Infos')

    flushBrowserLogs()
  })
