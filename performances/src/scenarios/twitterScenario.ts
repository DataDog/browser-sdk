import { trackNetwork } from '../trackNetwork'
import type { Scenario } from '../profilingTypes'

export const twitterScenario: Scenario = {
  description: `# Twitter

Illustrates a SPA scenario.

* Navigate to the top trending topics
* Click on the first trending topic
* Click on Top, Latest, People, Photos and Videos tabs
* Navigate to the Settings page
* Click on a few checkboxes
`,

  async run(page, takeMeasurements) {
    const { waitForNetworkIdle } = trackNetwork(page)

    // Consent to all cookies
    await page.setCookie({
      name: 'd_prefs',
      value: Buffer.from('1:1,consent_version:2,text_version:1000').toString('base64'),
      domain: 'twitter.com',
    })

    await page.goto('https://twitter.com/explore')
    await waitForNetworkIdle()

    // Even if the network is idle, sometimes links take a bit longer to render
    await page.waitForSelector('[data-testid="trend"]')
    await takeMeasurements()
    await page.click('[data-testid="trend"]')
    await waitForNetworkIdle()
    await takeMeasurements()

    // Click on all tabs
    const tabs = await page.$$('[role="tab"]')
    for (const tab of tabs) {
      await tab.click()
      await waitForNetworkIdle()
      await takeMeasurements()
    }

    await page.click('[aria-label="Settings"]')
    await waitForNetworkIdle()
    await takeMeasurements()

    // Scroll to the bottom of the page, because some checkboxes may be hidden below fixed banners
    await page.evaluate('scrollTo(0, 100000)')

    // Click on all checkboxes except the first one
    const checkboxes = await page.$$('input[type="checkbox"]')
    for (const checkbox of checkboxes.slice(1)) {
      await checkbox.click()
      await waitForNetworkIdle()
      await takeMeasurements()
    }

    await page.goto('about:blank')
  },
}
