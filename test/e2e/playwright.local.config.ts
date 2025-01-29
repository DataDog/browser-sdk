import { defineConfig, devices } from '@playwright/test'
import { config as baseConfig } from './playwright.base.config'

const projects = [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
  },
]

if (!process.env.CI) {
  projects.push(
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'android',
      use: { ...devices['Pixel 7'] },
    }
  )
}

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  ...baseConfig,
  projects,
})
