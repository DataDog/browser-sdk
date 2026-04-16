import * as http from 'http'
import type { AddressInfo } from 'net'
import { test } from '@playwright/test'
import type { Browser } from '@playwright/test'
import { getIp } from '../../../envUtils'

const MAX_SERVER_CREATION_RETRY = 5
// Not all port are available with BrowserStack, see https://www.browserstack.com/question/664
// Pick a ports in range 9200-9400
const PORT_MIN = 9200
const PORT_MAX = 9400

export type ServerApp = (req: http.IncomingMessage, res: http.ServerResponse) => any

export type MockServerApp = ServerApp & {
  getLargeResponseWroteSize(): number
}

export interface Server<App extends ServerApp> {
  origin: string
  app: App
  bindServerApp(serverApp: App): void
  waitForIdle(): Promise<void>
}

export interface Servers {
  base: Server<MockServerApp>
  intake: Server<ServerApp>
  crossOrigin: Server<MockServerApp>
}

let serversSingleton: undefined | Servers

export async function getTestServers() {
  if (!serversSingleton) {
    serversSingleton = {
      base: await createServer(),
      crossOrigin: await createServer(),
      intake: await createServer(),
    }
  }
  return serversSingleton
}

export async function waitForServersIdle() {
  const servers = await getTestServers()
  return Promise.all([servers.base.waitForIdle(), servers.crossOrigin.waitForIdle(), servers.intake.waitForIdle()])
}

async function createServer<App extends ServerApp>(): Promise<Server<App>> {
  const server = await instantiateServer()
  const address = getIp()
  const { port } = server.address() as AddressInfo
  let serverApp: App | undefined

  server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (serverApp) {
      serverApp(req, res)
    } else {
      res.writeHead(202)
      res.end()
    }
  })

  return {
    bindServerApp(newServerApp: App) {
      serverApp = newServerApp
    },
    get app() {
      if (!serverApp) {
        throw new Error('no server app bound')
      }
      return serverApp
    },
    origin: `http://${address}:${port}`,
    waitForIdle: createServerIdleWaiter(server),
  }
}

async function instantiateServer(): Promise<http.Server> {
  for (let tryNumber = 0; tryNumber < MAX_SERVER_CREATION_RETRY; tryNumber += 1) {
    const port = PORT_MIN + Math.floor(Math.random() * (PORT_MAX - PORT_MIN + 1))

    try {
      return await instantiateServerOnPort(port)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        continue
      }
      throw error
    }
  }

  throw new Error(`Failed to create a server after ${MAX_SERVER_CREATION_RETRY} retries`)
}

function instantiateServerOnPort(port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer()
    server.on('error', reject)
    server.listen(port, () => {
      resolve(server)
    })
  })
}

function createServerIdleWaiter(server: http.Server) {
  const idleWaiter = createIdleWaiter()

  server.on('request', (_, res: http.ServerResponse) => {
    idleWaiter.pushActivity(new Promise((resolve) => res.on('close', resolve)))
  })

  return () => idleWaiter.idlePromise
}

let idleWaitDuration = 500

test.beforeAll(async ({ browser }) => {
  const latency = await measureServerLatency(browser)
  idleWaitDuration = Math.max(500, latency * 1.5)
  console.log(`Server latency: ${latency}ms`)
})

async function measureServerLatency(browser: Browser): Promise<number> {
  // We measure the round-trip time to the test server to calibrate how long we wait after the
  // last pending request before considering the server idle. In BrowserStack, the browser runs
  // remotely, so this latency can be significant.
  const { intake: server } = await getTestServers()
  const page = await browser.newPage()
  const start = Date.now()
  await page.goto(server.origin)
  return Date.now() - start
}

function createIdleWaiter() {
  let idlePromise = Promise.resolve()

  const pendingActivities = new Set<Promise<void>>()
  let waitTimeoutId: NodeJS.Timeout
  let resolveIdlePromise: undefined | (() => void)

  return {
    pushActivity(activity: Promise<void>) {
      if (!resolveIdlePromise) {
        // Before this activity, we were idle, so create a new promise that will be resolved when we
        // are idle again.
        idlePromise = new Promise((resolve) => {
          resolveIdlePromise = resolve
        })
      }

      // Cancel any timeout that would resolve the idle promise.
      clearTimeout(waitTimeoutId)

      pendingActivities.add(activity)
      void activity.then(() => {
        pendingActivities.delete(activity)

        if (pendingActivities.size === 0) {
          // If no more activity is pending, wait a bit before switching to idle state.
          waitTimeoutId = setTimeout(() => {
            resolveIdlePromise!()
            resolveIdlePromise = undefined
          }, idleWaitDuration)
        }
      })
    },
    get idlePromise() {
      return idlePromise
    },
  }
}
