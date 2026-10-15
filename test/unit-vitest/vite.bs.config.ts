// Run Vitest Browser Mode on real BrowserStack browsers through the webdriverio provider.
// Used by `yarn test:unit:bs`, which runs through the BrowserStack wrapper (starts BrowserStack
// Local and sets BROWSERSTACK_LOCAL_IDENTIFIER):
//
//   BS_BROWSER=safari-desktop yarn test:unit:bs [<path filters>]
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { transformWithOxc, type Plugin } from 'vite'
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import { webdriverio, type WebdriverBrowserProvider } from '@vitest/browser-webdriverio'
import { browserConfigurations } from '../unit/browsers.conf.ts'
import { getBuildInfos, getTestReportDirectory } from '../envUtils.ts'
import baseConfig from './vite.config.ts'

const selectedBrowser = process.env.BS_BROWSER
const configurations = selectedBrowser
  ? browserConfigurations.filter((configuration) => configuration.id === selectedBrowser)
  : browserConfigurations

if (configurations.length === 0) {
  throw new Error(`Unknown BS_BROWSER "${selectedBrowser}"`)
}

function getWebdriverBrowserName(name: string) {
  const lowerName = name.toLowerCase()
  if (lowerName === 'edge' || lowerName === 'firefox' || lowerName === 'safari') {
    return lowerName
  }
  return 'chrome'
}

const TARGET = 'es2020'
const NODE_MODULES_JS = /\/node_modules\/.*\.m?js$/
// Prebuilt Vitest UI assets, served by Vitest's own static server, bypassing Vite transforms
const STATIC_VITEST_ASSET = /^\/__vitest__\/.*\.js$/

// Vitest's browser client ships ES2021+ syntax (e.g. `||=`) that older browsers can't parse.
// Downlevel every dependency JS file served to the browser.
const downlevelModulesPlugin: Plugin = {
  name: 'downlevel-node-modules',
  enforce: 'post',
  transform(code, id) {
    const [path, query] = id.split('?')
    if (NODE_MODULES_JS.test(path) && !query?.includes('html-proxy')) {
      return transformWithOxc(code, path, { target: TARGET, sourcemap: true })
    }
  },
}

// Route Vitest's static UI assets through the Vite pipeline (via /@fs/) so they get downleveled
// and their imports resolved. 'pre' so the middleware runs before Vitest's static server.
const downlevelStaticAssetsPlugin: Plugin = {
  name: 'downlevel-vitest-static-assets',
  enforce: 'pre',
  configureServer(server) {
    const clientDist = resolve(createRequire(import.meta.url).resolve('@vitest/browser/package.json'), '../dist/client')
    server.middlewares.use((req, _res, next) => {
      const [pathname, query] = (req.url ?? '').split('?')
      if (STATIC_VITEST_ASSET.test(pathname)) {
        req.url = `/@fs${resolve(clientDist, `.${pathname}`)}${query ? `?${query}` : ''}`
      }
      next()
    })
  },
}

// Vitest's client relies on recent built-ins (e.g. Object.hasOwn). The orchestrator page gets the
// polyfills via `orchestratorScripts`; inject them first in the tester page too.
const POLYFILLS_PATH = resolve(import.meta.dirname, 'vitestBrowserPolyfills.js')
const polyfillTesterPlugin: Plugin = {
  name: 'polyfill-tester',
  transformIndexHtml: {
    order: 'pre',
    handler: () => [{ tag: 'script', children: readFileSync(POLYFILLS_PATH, 'utf8'), injectTo: 'head-prepend' }],
  },
}

// Some BrowserStack browsers (e.g. Safari) don't expose console logs: report page errors to the
// Vite server so they show up in the terminal.
const ERROR_REPORTER = `;(function () {
  function report(kind, message) {
    try {
      var xhr = new XMLHttpRequest()
      xhr.open('POST', '/__report_error__')
      xhr.send(kind + ' @ ' + location.pathname + ': ' + message)
    } catch (e) {}
  }
  window.addEventListener('error', function (event) {
    report('error', event.message + ' (' + event.filename + ':' + event.lineno + ':' + event.colno + ')')
  }, true)
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason
    report('unhandledrejection', reason && reason.stack ? reason.stack : String(reason))
  })
  report('loaded', navigator.userAgent)
})()`
const errorReporterPlugin: Plugin = {
  name: 'error-reporter',
  configureServer(server) {
    server.middlewares.use('/__report_error__', (req, res) => {
      let body = ''
      req.on('data', (chunk: Buffer) => (body += chunk.toString()))
      req.on('end', () => {
        console.log(`[browser] ${body}`)
        res.end()
      })
    })
  },
  transformIndexHtml: {
    order: 'pre',
    handler: () => [{ tag: 'script', children: ERROR_REPORTER, injectTo: 'head-prepend' }],
  },
}

const config = mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [downlevelStaticAssetsPlugin, downlevelModulesPlugin, polyfillTesterPlugin, errorReporterPlugin],
    // Vite serves sources untranspiled by default; target the oldest browser of the matrix.
    oxc: { target: TARGET },
    optimizeDeps: { rolldownOptions: { transform: { target: TARGET } } },
    test: {
      // The default timeouts are too short for remote browsers
      testTimeout: 30_000,
      hookTimeout: 30_000,
      coverage: { enabled: false },
      browser: {
        headless: false,
        // BrowserStack queues sessions when all parallel sessions are busy, which can take minutes
        connectTimeout: 5 * 60_000,
        // BrowserStack rewrites localhost to bs-local.com for Safari: serve from that host directly
        // (it resolves to 127.0.0.1) so the page is reachable and cookies match the page host. Other
        // browsers keep `localhost`, which is a secure context (needed e.g. for `secure` cookies).
        api: { host: configurations.some(({ name }) => name === 'Safari') ? 'bs-local.com' : 'localhost' },
        orchestratorScripts: [
          { content: ERROR_REPORTER, type: 'text/javascript' },
          { src: POLYFILLS_PATH, type: 'text/javascript' },
        ],
      },
    },
  })
)

// Vitest talks to the page over its own WebSocket, so BrowserStack sees no WebDriver activity and
// kills the session after `idleTimeout`. Send a harmless command periodically to keep it alive.
const KEEPALIVE_INTERVAL = 25_000
function webdriverioWithKeepalive(options: Parameters<typeof webdriverio>[0]) {
  const providerOption = webdriverio(options)
  return {
    ...providerOption,
    providerFactory(project: Parameters<typeof providerOption.providerFactory>[0]) {
      const provider = providerOption.providerFactory(project) as unknown as WebdriverBrowserProvider
      let intervalId: NodeJS.Timeout | undefined
      const openBrowser = provider.openBrowser.bind(provider)
      provider.openBrowser = async () => {
        const browser = await openBrowser()
        intervalId ??= setInterval(() => {
          browser.getWindowHandle().catch(() => undefined)
        }, KEEPALIVE_INTERVAL)
        return browser
      }
      // Vitest resizes the browser window before each test file. The viewport is irrelevant for
      // our specs, so don't fail the run when a remote browser refuses to be resized.
      const setViewport = provider.setViewport.bind(provider)
      provider.setViewport = (options) => setViewport(options).catch(() => undefined)
      const close = provider.close.bind(provider)
      provider.close = () => {
        clearInterval(intervalId)
        return close()
      }
      return provider
    },
  }
}

// mergeConfig concatenates arrays: replace the base reporters, exclusions, provider and instance
// instead

// Print every test so the BrowserStack wrapper doesn't kill the run for lack of output
const testReportDirectory = getTestReportDirectory()
config.test.reporters = testReportDirectory
  ? ['verbose', ['junit', { outputFile: `${testReportDirectory}/results-${selectedBrowser ?? 'all'}.xml` }]]
  : ['verbose']

config.test.exclude = [
  ...configDefaults.exclude,
  // The developer extension is only compatible with Chrome, no point testing it on other browsers
  'developer-extension/**',
  // Angular's signal debugging requires FinalizationRegistry, absent in Chrome/Edge 80 and Firefox 78
  ...(configurations.some(({ id }) => id !== undefined && ['chrome-desktop', 'edge', 'firefox'].includes(id))
    ? ['packages/browser-rum-angular/**']
    : []),
]

config.test.browser.provider = webdriverio()
config.test.browser.instances = configurations.map((configuration) => ({
  browser: getWebdriverBrowserName(configuration.name),
  name: configuration.sessionName,
  provider: webdriverioWithKeepalive({
    protocol: 'https',
    hostname: 'hub.browserstack.com',
    port: 443,
    path: '/wd/hub',
    connectionRetryTimeout: 120_000,
    capabilities: {
      browserVersion: configuration.version,
      'bstack:options': {
        userName: process.env.BS_USERNAME,
        accessKey: process.env.BS_ACCESS_KEY,
        os: configuration.os,
        osVersion: configuration.osVersion,
        deviceName: configuration.device,
        local: true,
        localIdentifier: process.env.BROWSERSTACK_LOCAL_IDENTIFIER,
        projectName: 'browser sdk unit (vitest spike)',
        buildName: getBuildInfos(),
        sessionName: `${configuration.sessionName} (vitest webdriverio spike)`,
        consoleLogs: 'info',
        idleTimeout: 300,
        // BrowserStack defaults to Selenium 2.53 (legacy JSON Wire protocol) for old desktop
        // browsers; webdriverio needs a W3C endpoint (e.g. `POST /window/rect`)
        ...(configuration.device ? {} : { seleniumVersion: '4.0.0' }),
      },
    },
  }),
}))

// eslint-disable-next-line import-x/no-default-export
export default config
