import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const lightningStorageState = path.resolve(__dirname, 'test-results/.auth/salesforce-lightning.json')
const dreamhouseAuraLightningStorageState = path.resolve(
  __dirname,
  'test-results/.auth/salesforce-dreamhouse-aura-lightning.json'
)

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  testDir: './salesforce',
  testMatch: ['**/*.spec.ts'],
  tsconfig: './tsconfig.json',
  fullyParallel: false,
  timeout: 60_000,
  workers: 1,
  reporter: [['line'], ['./noticeReporter.ts'], ['html']],
  use: {
    // So we can send to the intake from the Salesforce Domain.
    bypassCSP: true,
    // We'll ignore HTTPS errors since we're using self-signed certificates.
    ignoreHTTPSErrors: true,
    // So we can send to the intake from the Salesforce Domain.
    permissions: ['local-network-access'],
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: ['**/auth.setup.ts'],
      use: {
        ...devices['Desktop Chrome'],
        trace: 'off',
        screenshot: 'off',
        video: 'off',
      },
    },
    {
      name: 'experience-chromium',
      dependencies: ['setup'],
      testMatch: ['**/experienceCloud.spec.ts'],
      use: devices['Desktop Chrome'],
    },
    {
      name: 'lightning-chromium',
      dependencies: ['setup'],
      testMatch: ['**/lightningExperience.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: lightningStorageState,
      },
    },
    {
      name: 'dreamhouse-aura-setup',
      testMatch: ['**/dreamhouseAuraAuth.setup.ts'],
      use: {
        ...devices['Desktop Chrome'],
        trace: 'off',
        screenshot: 'off',
        video: 'off',
      },
    },
    {
      name: 'dreamhouse-aura-lightning-chromium',
      dependencies: ['dreamhouse-aura-setup'],
      testMatch: ['**/dreamhouseAuraLightningExperience.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: dreamhouseAuraLightningStorageState,
      },
    },
  ],
})
