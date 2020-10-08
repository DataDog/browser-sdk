import cors from 'cors'
import express from 'express'
import * as url from 'url'
import { buildApp, buildLogs, buildRum, Endpoints } from './builds'
import { EventRegistry } from './eventsRegistry'
import { deleteAllCookies, flushEvents, waitForIdle, withBrowserLogs } from './helpers'
import { log } from './logger'
import { getTestServers, Servers } from './servers'

export interface TestContext {
  baseUrl: string
  crossOriginUrl: string
  events: EventRegistry
  endpoints: Endpoints
}
type Setups = { [name: string]: string } | string
export function createTest(title: string, setups: Setups, run: (testContext: TestContext) => Promise<void>) {
  if (typeof setups === 'object') {
    describe(title, () => {
      for (const [name, setup] of Object.entries(setups)) {
        createTestForSetup(name, setup, run)
      }
    })
  } else {
    createTestForSetup(title, setups, run)
  }
}

interface ItResult {
  getFullName(): string
}
declare function it(expectation: string, assertion?: jasmine.ImplementationCallback, timeout?: number): ItResult

function createTestForSetup(title: string, setup: string, run: (testContext: TestContext) => Promise<void>) {
  const spec = it(title, async () => {
    log(`Start '${spec.getFullName()}' in ${getBrowserName()}`)
    const servers = await getTestServers()

    const testContext = createTestContext(servers)

    servers.base.bindApp(createMockApp(testContext.endpoints, setup))
    servers.crossOrigin.bindApp(createMockApp(testContext.endpoints, setup))
    servers.intake.bindApp(createIntakeApp(testContext.events))

    await setUpTest(testContext)

    try {
      await run(testContext)
    } finally {
      await tearDownTest(testContext)
      log(`End '${spec.getFullName()}'`)
    }
  })
}

function getBrowserName() {
  const capabilities = browser.options.capabilities
  return capabilities && (capabilities.browserName || (capabilities as any).browser)
}

function createTestContext(servers: Servers): TestContext {
  return {
    baseUrl: servers.base.url,
    crossOriginUrl: servers.crossOrigin.url,
    endpoints: {
      internalMonitoring: `${servers.intake.url}/v1/input/internalMonitoring`,
      logs: `${servers.intake.url}/v1/input/logs`,
      rum: `${servers.intake.url}/v1/input/rum`,
    },
    events: new EventRegistry(),
  }
}

function createMockApp(endpoints: Endpoints, setup: string) {
  const app = express()

  app.use(cors())
  app.disable('etag') // disable automatic resource caching

  app.get('/empty', (req, res) => {
    res.end()
  })

  app.get('/favicon.ico', (req, res) => {
    res.end()
  })

  app.get('/throw', (req, res) => {
    res.status(500).send('Server error')
  })

  app.get('/unknown', (req, res) => {
    res.status(404).send('Not found')
  })

  app.get('/empty.css', (req, res) => {
    res.header('content-type', 'text/css').end()
  })

  app.get('/ok', (req, res) => {
    if (req.query['timing-allow-origin'] === 'true') {
      res.set('Timing-Allow-Origin', '*')
    }
    const timeoutDuration = req.query.duration ? Number(req.query.duration) : 0
    setTimeout(() => res.send('ok'), timeoutDuration)
  })

  app.get('/redirect', (req, res) => {
    const redirectUri = url.parse(req.originalUrl)
    res.redirect(`ok${redirectUri.search}`)
  })

  app.get('/headers', (req, res) => {
    res.send(JSON.stringify(req.headers))
  })

  app.get('/', (req, res) => {
    res.send(setup)
    res.end()
  })

  app.get('/datadog-logs.js', async (req, res) => {
    res.header('content-type', 'application/javascript').send(await buildLogs(endpoints))
  })

  app.get('/datadog-rum.js', async (req, res) => {
    res.header('content-type', 'application/javascript').send(await buildRum(endpoints))
  })

  app.get('/app.js', async (req, res) => {
    res.header('content-type', 'application/javascript').send(await buildApp(endpoints))
  })

  return app
}

function createIntakeApp(events: EventRegistry) {
  const app = express()

  app.use(express.text())

  app.post('/v1/input/:endpoint', (req, res) => {
    const endpoint = req.params.endpoint
    if (endpoint === 'rum' || endpoint === 'logs' || endpoint === 'internalMonitoring') {
      ;(req.body as string).split('\n').map((rawEvent) => events.push(endpoint, JSON.parse(rawEvent) as any))
    }
    res.end()
  })

  return app
}

async function setUpTest({ baseUrl }: TestContext) {
  await browser.url(baseUrl)
  await waitForIdle()
}

async function tearDownTest({ events }: TestContext) {
  await flushEvents()
  expect(events.internalMonitoring).toEqual([])
  await withBrowserLogs((logs) => {
    logs.forEach((browserLog) => {
      log(`Browser ${browserLog.source}: ${browserLog.level} ${browserLog.message}`)
    })
    expect(logs.filter((l) => (l as any).level === 'SEVERE')).toEqual([])
  })
  await deleteAllCookies()
}
