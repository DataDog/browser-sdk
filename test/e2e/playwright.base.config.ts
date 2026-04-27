import path from 'path'
import type { ReporterDescription, Config } from '@playwright/test'
import { getTestReportDirectory } from '../envUtils'

const isCi = !!process.env.CI
const isLocal = !isCi

const testReportDirectory = getTestReportDirectory()
const reporters: ReporterDescription[] = [['line'], ['./noticeReporter.ts']]

if (testReportDirectory) {
  reporters.push(['junit', { outputFile: path.join(process.cwd(), testReportDirectory, 'results.xml') }])
} else {
  reporters.push(['html'])
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export const config: Config = {
  testDir: './scenario',
  testMatch: ['**/*.scenario.ts'],
  tsconfig: './tsconfig.json',
  fullyParallel: true,
  forbidOnly: isCi,
  maxFailures: isCi ? 1 : 0,
  retries: isCi ? 2 : 0,
  workers: 5,
  reporter: reporters,
  use: {
    trace: isCi ? 'off' : 'retain-on-failure',
  },

  webServer: [
    ...(isLocal
      ? [
          {
            name: 'dev server',
            stdout: 'pipe' as const,
            cwd: path.join(__dirname, '../..'),
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
      cwd: path.join(__dirname, '../apps/nextjs'),
      command: 'yarn start',
      wait: {
        stdout: /- Local:\s+http:\/\/localhost:(?<nextjs_app_router_port>\d+)/,
      },
    },
    {
      name: 'vue router app',
      stdout: 'pipe' as const,
      cwd: path.join(__dirname, '../apps/vue-router-app'),
      command: isLocal ? 'yarn dev' : 'yarn preview',
      // NO_COLOR=1 prevents Vite from wrapping "Local" in ANSI bold codes when
      // FORCE_COLOR=1 is set in CI, which would break the wait.stdout regex.
      env: { NO_COLOR: '1' },
      wait: {
        stdout: /Local:\s+http:\/\/localhost:(?<vue_router_app_port>\d+)/,
      },
    },
    {
      name: 'nuxt app',
      stdout: 'pipe' as const,
      cwd: path.join(__dirname, '../apps/nuxt-app'),
      command: isLocal ? 'yarn dev' : 'yarn start',
      env: { NO_COLOR: '1' },
      wait: {
        // yarn dev logs:   "➜ Local:  http://localhost:PORT"
        // yarn start logs: "Listening on http://[::]:PORT"
        stdout: /(?:Local:\s+http:\/\/localhost|Listening on http:\/\/(?:\[[^\]]+\]|[^:]+)):(?<nuxt_app_port>\d+)/,
      },
    },
  ],
}
