import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { test as setup } from '@playwright/test'
import { getDreamhouseAuraSalesforceTargets } from './support/salesforceTargets'

const authDirectory = path.resolve(__dirname, '../test-results/.auth')
const lightningStorageState = path.join(authDirectory, 'salesforce-dreamhouse-aura-lightning.json')

setup('authenticate DreamHouse Aura Lightning Experience via sf org open', async ({ page }) => {
  const { loginUrl } = getDreamhouseAuraSalesforceTargets()
  await page.goto(loginUrl, { waitUntil: 'commit' })
  await page.waitForURL('**/lightning/n/Property_Finder', { timeout: 30_000 })
  mkdirSync(authDirectory, { recursive: true })
  await page.context().storageState({ path: lightningStorageState })
})
