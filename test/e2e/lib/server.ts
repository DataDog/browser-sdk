import * as http from 'http'
import { AddressInfo, Socket } from 'net'
import { getIp } from '../../utils'

const MAX_SERVER_CREATION_RETRY = 5
// Not all port are available with BrowserStack, see https://www.browserstack.com/question/664
// Pick a ports in range 9200-9400
const PORT_MIN = 9200
const PORT_MAX = 9400

type App = (req: http.IncomingMessage, res: http.ServerResponse) => void
export interface Server {
  url: string
  bindApp(app: App): void
  waitForIdle(): Promise<void>
}

export async function createServer(): Promise<Server> {
  const server = await instantiateServer()
  const { address, port } = server.address() as AddressInfo
  let app: App | undefined

  server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (app) {
      app(req, res)
    }
  })

  server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
    res.on('close', () => {
      const requestUrl = `${req.headers.host}${req.url}`
      console.log(`${new Date().toISOString()}: ${req.method} ${requestUrl} ${res.statusCode}`)
    })
  })

  return {
    bindApp(newApp: App) {
      app = newApp
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
