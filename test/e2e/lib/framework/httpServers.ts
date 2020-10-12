import * as http from 'http'
import { AddressInfo } from 'net'
import { getIp } from '../../../utils'
import { log } from './logger'

const MAX_SERVER_CREATION_RETRY = 5
// Not all port are available with BrowserStack, see https://www.browserstack.com/question/664
// Pick a ports in range 9200-9400
const PORT_MIN = 9200
const PORT_MAX = 9400

type ServerApp = (req: http.IncomingMessage, res: http.ServerResponse) => void

export interface Server {
  url: string
  bindServerApp(serverApp: ServerApp): void
  waitForIdle(): Promise<void>
}

export interface Servers {
  base: Server
  intake: Server
  crossOrigin: Server
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

async function createServer(): Promise<Server> {
  const server = await instantiateServer()
  const { address, port } = server.address() as AddressInfo
  let serverApp: ServerApp | undefined

  server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (serverApp) {
      serverApp(req, res)
    }
  })

  server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
    res.on('close', () => {
      const requestUrl = `${req.headers.host}${req.url}`
      log(`${req.method} ${requestUrl} ${res.statusCode}`)
    })
  })

  return {
    bindServerApp(newServerApp: ServerApp) {
      serverApp = newServerApp
    },
    url: `http://${address}:${port}`,
    waitForIdle: createServerIdleWaiter(server),
  }
}

async function instantiateServer(): Promise<http.Server> {
  for (let tryNumber = 0; tryNumber < MAX_SERVER_CREATION_RETRY; tryNumber += 1) {
    const port = PORT_MIN + Math.floor(Math.random() * (PORT_MAX - PORT_MIN + 1))

    try {
      return await instantiateServerOnPort(port)
    } catch (error) {
      if ((error as any).code === 'EADDRINUSE') {
        continue
      }
      throw error
    }
  }

  throw new Error(`Failed to create a server after ${MAX_SERVER_CREATION_RETRY} retries`)
}

async function instantiateServerOnPort(port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer()
    server.on('error', reject)
    server.listen(port, getIp(), () => {
      resolve(server)
    })
  })
}

function createServerIdleWaiter(server: http.Server) {
  const idleWaiter = createIdleWaiter()

  server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
    idleWaiter.pushActivity(new Promise((resolve) => res.on('close', resolve)))
  })

  return async () => idleWaiter.idlePromise
}

const IDLE_WAIT_DURATION = 500
function createIdleWaiter() {
  let idlePromise = Promise.resolve()

  const pendingActivities = new Set<Promise<void>>()
  let waitTimeoutId: ReturnType<typeof setTimeout>
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
      activity.then(() => {
        pendingActivities.delete(activity)

        if (pendingActivities.size === 0) {
          // If no more activity is pending, wait a bit before switching to idle state.
          waitTimeoutId = setTimeout(() => {
            resolveIdlePromise!()
            resolveIdlePromise = undefined
          }, IDLE_WAIT_DURATION)
        }
      })
    },
    get idlePromise() {
      return idlePromise
    },
  }
}
