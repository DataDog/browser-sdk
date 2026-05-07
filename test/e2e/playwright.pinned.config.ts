import path from 'path'
import { defineConfig, devices } from '@playwright/test'
import { config as baseConfig } from './playwright.base.config'

// Local equivalent of the BrowserStack matrix in browsers.conf.js (Firefox 119 + WebKit 17.4)
// without BrowserStack. The pipeline:
//   1) `playwright run-server` on port 5401 from Playwright 1.40.1 (bundles FF 119, WK 17.4).
//   2) A small translation proxy on port 5400 (test/e2e/scripts/pinnedProxy.ts) that
//      spoofs the User-Agent the 1.40 server's version check expects, and patches
//      __create__ messages so the 1.58 client's strict initializer validators accept
//      messages produced by the 1.40 server.
//   3) The current @playwright/test (1.58) client connects to the proxy via wsEndpoint.
//
// Initial install of the 1.40 browser binaries:
//   yarn test:e2e:pinned:init
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

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  ...baseConfig,
  webServer: [...((baseConfig.webServer as object[]) ?? []), ...pinnedWebServers] as never,
  projects: [
    {
      name: 'firefox',
      metadata: { sessionName: 'Firefox 119', name: 'firefox' },
      use: {
        ...devices['Desktop Firefox'],
        connectOptions: { wsEndpoint: PINNED_WS_ENDPOINT },
      },
    },
    {
      name: 'webkit',
      metadata: { sessionName: 'WebKit 17.4', name: 'webkit' },
      use: {
        ...devices['Desktop Safari'],
        connectOptions: { wsEndpoint: PINNED_WS_ENDPOINT },
      },
    },
  ],
})
