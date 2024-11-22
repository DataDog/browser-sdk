import { injectRumWithPuppeteer } from '../../lib/framework'
describe('Inject RUM with Puppeteer', () => {
  // S8s tests inject RUM with puppeteer evaluateOnNewDocument
  it('should not throw error in chrome', async () => {
    const isInjected = await injectRumWithPuppeteer()
    expect(isInjected).toBe(true)
  })
})
