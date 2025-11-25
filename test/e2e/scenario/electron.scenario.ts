import { test, expect } from '@playwright/test'
import { createTest, flushElectronEvents, npmSetup } from '../lib/framework'

test.describe('electron sdk', () => {
  createTest('should track a view on the main process')
    .withSetup(npmSetup)
    .withRum()
    .withElectron()
    .run(async ({ intakeRegistry, page }) => {
      await flushElectronEvents(page)

      const viewEvent = intakeRegistry.rumViewEvents[0]
      expect(viewEvent).toBeDefined()
      expect(viewEvent.source).toBe('browser')
      expect(viewEvent.view.name).toBe('ApplicationLaunch')
      expect(viewEvent.view.url).toBe('ApplicationLaunch')
    })
})
