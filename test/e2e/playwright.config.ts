import path from 'path'
import { defineConfig, devices } from '@playwright/test'
import { config as baseConfig } from './playwright.base.config'

// Single config covering all e2e browser configurations:
//
// - chromium / firefox / webkit / android: current Playwright (1.58)-bundled browsers.
// - firefox-pinned (FF 119) / webkit-pinned (WK 17.4): replicate the old BrowserStack
//   matrix locally via a pinned Playwright 1.40.1 `run-server` and a translation proxy
//   (test/e2e/scripts/pinnedProxy.ts) that bridges the 1.58 client and the 1.40 server.
//
// The pinned web servers (`run-server` + proxy) only boot when at least one selected
// project is pinned, so non-pinned runs don't pay the boot cost. Selection is read from
// `--project=<name>` flags on argv (Playwright's filter); when no `--project` is passed,
// all projects run and the pinned servers boot.
//
// Initial install of the pinned browser binaries:
//   yarn test:e2e:init

const PINNED_WS_ENDPOINT = 'ws://127.0.0.1:5400/'
const proxyDir = path.join(__dirname, 'scripts')

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

const baseWebServers = (baseConfig.webServer as object[]) ?? []
const webServer = needsPinnedServers() ? [...baseWebServers, ...pinnedWebServers] : baseWebServers

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  ...baseConfig,
  webServer: webServer as never,
  projects: [
    project('chromium', 'Desktop Chrome'),
    project('firefox', 'Desktop Firefox'),
    project('webkit', 'Desktop Safari'),
    project('android', 'Pixel 7'),
    pinnedProject('firefox-pinned', 'Firefox 119', 'Desktop Firefox', '119'),
    pinnedProject('webkit-pinned', 'WebKit 17.4', 'Desktop Safari', '17.4'),
  ],
})

function project(name: string, device: string) {
  return {
    name,
    metadata: { sessionName: device, name },
    use: devices[device],
  }
}

function pinnedProject(name: string, sessionName: string, device: string, version: string) {
  return {
    name,
    metadata: { sessionName, name, version },
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
  const projects: string[] = []
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i]
    if (arg === '--project' || arg === '-p') {
      const next = process.argv[i + 1]
      if (next) {
        projects.push(next)
      }
    } else if (arg.startsWith('--project=')) {
      projects.push(arg.slice('--project='.length))
    }
  }
  return projects
}
