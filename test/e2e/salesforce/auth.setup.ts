import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { test as setup } from '@playwright/test'
import { getSalesforceTargets } from './support/salesforceTargets'

const authDirectory = path.resolve(__dirname, '../test-results/.auth')
const lightningStorageState = path.join(authDirectory, 'salesforce-lightning.json')

setup('authenticate Lightning Experience via sf org open', async ({ page }) => {
  const { loginUrl } = getSalesforceTargets()
  await page.goto(loginUrl, { waitUntil: 'commit' })
  await page.waitForURL('**/lightning/page/home', { timeout: 30_000 })
  mkdirSync(authDirectory, { recursive: true })
  await page.context().storageState({ path: lightningStorageState })
})
