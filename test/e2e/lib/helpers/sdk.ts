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
  await browser.url(`${servers.base.url}/empty`)
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
