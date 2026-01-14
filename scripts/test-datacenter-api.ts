import { runMain, printLog } from './lib/executionUtils.ts'
import { getAllDatacentersMetadata } from './lib/datacenter.ts'

/**
 * Test script to verify datacenter API works in CI
 * This is temporary and will be removed before merging
 */

runMain(async () => {
  printLog('Fetching datacenters from runtime-metadata-service...')

  const datacenters = await getAllDatacentersMetadata()
  printLog(`Found ${datacenters.length} datacenters:`)

  for (const dc of datacenters) {
    const site = dc.site
    printLog(`  - [${dc.type}] ${dc.name}: ${site}`)
  }

  printLog('✅ Datacenter API test successful!')
})
