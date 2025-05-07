import path from 'path'
import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'

const pathToExtension = path.join(__dirname, '../../../../test/apps/extension')

test.describe('browser extensions', () => {
  console.log('test')
  createTest('popup page should load extension popup and display expected content')
    .withExtension(pathToExtension)
    .run(async ({ page, extensionId }) => {
      await page.goto(`chrome-extension://${extensionId}/src/popup.html`)
      await expect(page.locator('body')).toHaveText(/Extension Popup/)
    })
})
