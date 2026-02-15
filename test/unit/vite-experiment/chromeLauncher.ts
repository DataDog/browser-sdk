import { type Browser, launch } from 'puppeteer'

export interface Chrome {
  goTo(url: string): Promise<void>
  close(): Promise<void>
}

export async function startChrome(): Promise<Chrome> {
  console.log('Launching Chrome with Puppeteer...')

  const browser: Browser = await launch({
    headless: true,
  })

  return {
    async goTo(url: string) {
      const page = (await browser.pages())[0]
      await page.goto(url)
    },

    async close() {
      console.log('Closing Chrome...')
      await browser.close()
    },
  }
}
