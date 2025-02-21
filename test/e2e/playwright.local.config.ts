import { defineConfig, devices } from '@playwright/test'
import { config as baseConfig } from './playwright.base.config'

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  ...baseConfig,
  projects: [
    getConfig('chromium', 'Desktop Chrome'),
    getConfig('firefox', 'Desktop Firefox'),
    getConfig('webkit', 'Desktop Safari'),
    getConfig('android', 'Pixel 7'),
  ],
})

function getConfig(browser: string, device: string) {
  return {
    name: browser,
    metadata: {
      sessionName: device,
      name: browser,
    },
    use: devices[device],
  }
}
