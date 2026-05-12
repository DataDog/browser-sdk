import path from 'path'
import { parseArgs } from 'node:util'
import { defineConfig, devices } from '@playwright/test'
import type { ReporterDescription } from '@playwright/test'
import { getTestReportDirectory } from '../envUtils'
import type { BrowserConfiguration } from '../browsers.conf'

// Single config covering all e2e browser configurations:
//
// - chromium / firefox / webkit / android: current Playwright (1.58)-bundled browsers.
// - chromium-pinned (Chrome 120) / firefox-pinned (FF 119) / webkit-pinned (WK 17.4):
//   replicate the old BrowserStack matrix locally via a pinned Playwright 1.40.1
//   `run-server` and a translation proxy (test/e2e/scripts/pinnedProxy.ts) that bridges
//   the 1.58 client and the 1.40 server.
//
// The pinned web servers (`run-server` + proxy) only boot when at least one selected
// project is pinned, so non-pinned runs don't pay the boot cost. Selection is read from
// `--project=<name>` flags on argv (Playwright's filter); when no `--project` is passed,
// all projects run and the pinned servers boot.
//
// Initial install of the pinned browser binaries:
//   yarn test:e2e:init

const isCi = !!process.env.CI
const isLocal = !isCi

const PINNED_WS_ENDPOINT = 'ws://127.0.0.1:5400/'
const proxyDir = path.join(__dirname, 'scripts')

const reporters: ReporterDescription[] = [['line'], ['./noticeReporter.ts']]
const testReportDirectory = getTestReportDirectory()
if (testReportDirectory) {
  // Multiple matrix cells (one per --project) write into the same folder; include the
  // project name in the filename so they don't collide. PW_BROWSER is set by CI; locally
  // it falls back to a single shared filename.
  const junitFilename = process.env.PW_BROWSER ? `results-${process.env.PW_BROWSER}.xml` : 'results.xml'
  reporters.push(['junit', { outputFile: path.join(process.cwd(), testReportDirectory, junitFilename) }])
} else {
  reporters.push(['html'])
}

const baseWebServers = [
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
]

const pinnedWebServers = [
  {
    name: 'pinned playwright run-server',
    stdout: 'pipe' as const,
    cwd: proxyDir,
    command: 'yarn dlx -p playwright@1.40.1 playwright run-server --port 5401',
    wait: { stdout: /Listening on/ },
  },
  {
    name: 'pinned proxy',
    stdout: 'pipe' as const,
    cwd: proxyDir,
    command: 'node pinnedProxy.ts --listen 5400 --upstream 127.0.0.1:5401',
    wait: { stdout: /pinnedProxy] listening/ },
  },
]

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  testDir: './scenario',
  testMatch: ['**/*.scenario.ts'],
  tsconfig: './tsconfig.json',
  fullyParallel: true,
  forbidOnly: isCi,
  maxFailures: 0,
  retries: isCi ? 2 : 0,
  workers: 5,
  reporter: reporters,
  use: {
    trace: isCi ? 'off' : 'retain-on-failure',
  },
  webServer: needsPinnedServers() ? [...baseWebServers, ...pinnedWebServers] : baseWebServers,
  projects: [
    project('chromium', 'Desktop Chrome'),
    project('firefox', 'Desktop Firefox'),
    project('webkit', 'Desktop Safari'),
    project('android', 'Pixel 7'),
    pinnedProject('chromium-pinned', 'Chromium 120', 'Desktop Chrome', '120'),
    pinnedProject('firefox-pinned', 'Firefox 119', 'Desktop Firefox', '119'),
    pinnedProject('webkit-pinned', 'WebKit 17.4', 'Desktop Safari', '17.4'),
  ],
})

function project(name: string, device: string) {
  return {
    name,
    metadata: { sessionName: device, name } satisfies BrowserConfiguration,
    use: devices[device],
  }
}

function pinnedProject(name: string, sessionName: string, device: string, version: string) {
  return {
    name,
    metadata: { sessionName, name, version } satisfies BrowserConfiguration,
    use: {
      ...devices[device],
      connectOptions: { wsEndpoint: PINNED_WS_ENDPOINT },
    },
  }
}

function needsPinnedServers(): boolean {
  const selected = getSelectedProjects()
  if (selected.length === 0) {
    return true
  }
  return selected.some((p) => p.endsWith('-pinned'))
}

function getSelectedProjects(): string[] {
  const {
    values: { project },
  } = parseArgs({
    args: process.argv.slice(2),
    options: {
      project: {
        type: 'string',
        short: 'p',
        multiple: true,
      },
    },
    strict: false,
  })
  return (project as string[] | undefined) ?? []
}
