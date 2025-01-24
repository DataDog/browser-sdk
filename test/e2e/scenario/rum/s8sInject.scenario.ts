import * as fs from 'fs'
import { RUM_BUNDLE } from '../../lib/framework'
import { APPLICATION_ID, CLIENT_TOKEN } from '../../lib/helpers/configuration'
import puppeteer from 'puppeteer'

describe('Inject RUM with Puppeteer', () => {
  // S8s tests inject RUM with puppeteer evaluateOnNewDocument
  it('should not throw error in chrome', async () => {
    const isInjected = await injectRumWithPuppeteer()
    expect(isInjected).toBe(true)
  })
})

async function injectRumWithPuppeteer() {
  const ddRUM = fs.readFileSync(RUM_BUNDLE, 'utf8')
  const puppeteerBrowser = await puppeteer.launch({ headless: false, devtools: true })
  let injected = true

  await browser.call(async () => {
    const page = await puppeteerBrowser.newPage()
    await page.evaluateOnNewDocument(
      `
        if (location.href !== 'about:blank') {
          ${ddRUM}
          window.DD_RUM._setDebug(true)
          window.DD_RUM.init({
            applicationId: ${APPLICATION_ID},
            clientToken: ${CLIENT_TOKEN},
          })
          window.DD_RUM.startView()
        }
      `
    )
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        injected = false
      }
    })
    await page.goto('https://example.com')
  })
  return injected
}
