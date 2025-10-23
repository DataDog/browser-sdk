import { defineConfig, devices } from '@playwright/test'

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  testDir: './scenarios',
  testMatch: '**/*.scenario.ts',
  tsconfig: './tsconfig.json',
  fullyParallel: true,
  workers: 1,
  retries: 0,
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
})
