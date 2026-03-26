import path from 'path'
import type { ReporterDescription } from '@playwright/test'
import { defineConfig } from '@playwright/test'
import { getTestReportDirectory } from '../../envUtils'

const isLocal = !process.env.CI
const NEXTJS_PORT = 9100

// Set eagerly so test workers can read it at import time via process.env
process.env.NEXTJS_APP_ROUTER_PORT = String(NEXTJS_PORT)

const testReportDirectory = getTestReportDirectory()
const reporters: ReporterDescription[] = [['line']]

if (testReportDirectory) {
  reporters.push(['junit', { outputFile: path.join(process.cwd(), testReportDirectory, 'results.xml') }])
} else {
  reporters.push(['html'])
}

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  testDir: '../scenario',
  testMatch: ['**/*.scenario.ts'],
  tsconfig: '../tsconfig.json',
  globalSetup: './globalSetup.ts',
  globalTeardown: './globalTeardown.ts',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 60_000,
  reporter: reporters,
  projects: [{ name: 'android' }],
  use: {
    trace: 'retain-on-failure',
  },
  webServer: [
    ...(isLocal
      ? [
          {
            name: 'dev server',
            stdout: 'pipe' as const,
            cwd: path.join(__dirname, '../../..'),
            command: 'yarn dev-server start --no-daemon',
            wait: {
              stdout: /Dev server listening on port (?<dev_server_port>\d+)/,
            },
          },
        ]
      : []),
    {
      name: 'nextjs app router',
      stdout: 'pipe' as const,
      cwd: path.join(__dirname, '../../apps/nextjs'),
      command: `lsof -ti :${NEXTJS_PORT} | xargs kill -9 2>/dev/null; yarn start --port ${NEXTJS_PORT}`,
      wait: {
        stdout: /- Local:\s+http:\/\/localhost:(?<nextjs_app_router_port>\d+)/,
      },
    },
  ],
})
