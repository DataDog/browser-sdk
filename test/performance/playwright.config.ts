import { defineConfig, devices } from '@playwright/test'
import { isContinuousIntegration } from './environment'

const baseConfig = {
  testDir: './scenarios',
  testMatch: '**/*.scenario.ts',
  tsconfig: './tsconfig.json',
  fullyParallel: true,
  retries: 0,
  workers: 1,
  timeout: 90000, // 90 seconds to allow time for profile collection
  projects: [
    {
      name: 'chromium',
      use: {
        ignoreHTTPSErrors: true,
        ...devices['Desktop Chrome'],
      },
    },
  ],
}

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  ...baseConfig,
  ...(isContinuousIntegration && {
    repeatEach: 15,
    workers: 4,
  }),
})
