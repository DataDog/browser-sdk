import { browserExecuteAsync } from './browserHelpers'
import { getTestServers, waitForServersIdle } from './servers'

export async function flushEvents() {
  // wait to process user actions + event loop before switching page
  await browserExecuteAsync((done) =>
    setTimeout(() => {
      done(undefined)
    }, 200)
  )
  await waitForServersIdle()
  const servers = await getTestServers()
  await browser.url(`${servers.base.url}/empty`)
  await waitForServersIdle()
}
