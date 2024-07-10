import type { Scenario } from '../profiling.types'

export const wikipediaScenario: Scenario = {
  description: `# Wikipedia

Illustrates a mostly static site scenario.

* Navigate on three Wikipedia articles
* Do a search (with dynamic autocompletion) and go to the first result
`,

  async run(page, takeMeasurements) {
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
  },
}
