import { Page } from 'puppeteer'

export const wikipediaScenarioDescription = `# Wikipedia

Illustrates a mostly static site scenario.

* Navigate on three Wikipedia articles
* Do a search (with dynamic autocompletion) and go to the first result
`

export async function runWikipediaScenario(page: Page, takeMeasurements: () => Promise<void>) {
  await page.goto('https://en.wikipedia.org/wiki/Event_monitoring')
  await takeMeasurements()

  await page.goto('https://en.wikipedia.org/wiki/Datadog')
  await takeMeasurements()

  await page.type('[type="search"]', 'median', {
    // large delay to trigger the autocomplete menu at each key press
    delay: 400,
  })
  await Promise.all([page.waitForNavigation(), page.keyboard.press('Enter')])
  await takeMeasurements()

  await page.goto('https://en.wikipedia.org/wiki/Ubuntu')
  await takeMeasurements()

  await page.goto('about:blank')
}
