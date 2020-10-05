import cors from 'cors'
import express from 'express'
import * as url from 'url'
import { buildApp, buildLogs, buildRum, Endpoints } from './builds'
import { EventRegistry } from './eventsRegistry'
import { deleteAllCookies, flushEvents, withBrowserLogs } from './helpers'
import { createServer, Server } from './server'

interface TestContext {
  baseUrl: string
  crossOriginUrl: string
  events: EventRegistry
  endpoints: Endpoints
  waitForIdle: () => Promise<unknown>
}
interface Servers {
  base: Server
  intake: Server
  crossOrigin: Server
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

function createTestForSetup(title: string, setup: string, run: (testContext: TestContext) => Promise<void>) {
  it(title, async () => {
    const servers = await getServers()

    const testContext = createTestContext(servers)

    servers.base.bindApp(createMockApp(testContext.endpoints, setup))
    servers.crossOrigin.bindApp(createMockApp(testContext.endpoints, setup))
    servers.intake.bindApp(createIntakeApp(testContext.events))

    await setUpTest(testContext)

    try {
      await run(testContext)
    } finally {
      await tearDownTest(testContext)
    }
  })
}

let memoizedServers: undefined | Servers

async function getServers() {
  if (!memoizedServers) {
    memoizedServers = {
      base: await createServer(),
      crossOrigin: await createServer(),
      intake: await createServer(),
    }
  }
  return memoizedServers
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
    async waitForIdle() {
      return Promise.all([servers.base.waitForIdle(), servers.crossOrigin.waitForIdle(), servers.intake.waitForIdle()])
    },
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

async function setUpTest({ baseUrl, waitForIdle }: TestContext) {
  await browser.url(baseUrl)
  await waitForIdle()
}

async function tearDownTest({ events }: TestContext) {
  await flushEvents()
  expect(events.internalMonitoring).toEqual([])
  await withBrowserLogs((logs) => {
    logs.forEach(console.log)
    expect(logs.filter((l) => (l as any).level === 'SEVERE')).toEqual([])
  })
  await deleteAllCookies()
}
