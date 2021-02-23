import { getTestServers, waitForServersIdle } from '../framework'
import { browserExecuteAsync, deleteAllCookies } from './browser'

export async function flushEvents() {
  // wait to process actions + event loop before switching page
  await browserExecuteAsync((done) =>
    setTimeout(() => {
      done(undefined)
    }, 200)
  )
  await waitForServersIdle()
  const servers = await getTestServers()

  // TODO: use /empty instead of /ok
  //
  // The rum-recorder code uses a Web Worker to format the request data to be sent to the intake.
  // Because all Worker communication is asynchronous, it cannot send its request during the
  // "beforeunload" event, but a few milliseconds after. Thus, when navigating, if the future page
  // loads very quickly, the page unload may occur before rum-recorder have time to send its last
  // segment.
  //
  // To avoid flaky e2e tests, we currently use /ok with a duration, to allow a bit more time to
  // send requests to intakes when the "beforeunload" event is dispatched.
  //
  // The issue mainly occurs with local e2e tests (not browserstack), because the network latency is
  // very low (same machine), so the request resolves very quickly. In real life conditions, this
  // issue is mitigated, because requests will likely take a few milliseconds to reach the server.
  await browser.url(`${servers.base.url}/ok?duration=200`)
  await waitForServersIdle()
}

export async function renewSession() {
  await expireSession()
  const documentElement = await $('html')
  await documentElement.click()
  expect(await findSessionCookie()).toBeDefined()
}

export async function expireSession() {
  await deleteAllCookies()
  expect(await findSessionCookie()).not.toBeDefined()
  // Cookies are cached for 1s, wait until the cache expires
  await browser.pause(1100)
}

async function findSessionCookie() {
  const cookies = (await browser.getCookies()) || []
  return cookies.find((cookie: any) => cookie.name === '_dd_s')
}
