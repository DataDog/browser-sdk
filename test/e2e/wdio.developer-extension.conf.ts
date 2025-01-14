import path from 'path'
import { config as baseConfig } from './wdio.base.conf'

export const config: WebdriverIO.Config = {
  ...baseConfig,

  specs: ['./scenario/developer-extension/*.scenario.ts'],
  exclude: [],

  capabilities: [
    {
      browserName: 'chrome',
      'goog:chromeOptions': {
        args: [
          `--load-extension=${path.join(process.cwd(), 'developer-extension', 'dist')}`,
          '--headless=new', // "new" headless needed for extensions https://www.selenium.dev/blog/2023/headless-is-going-away/
          '--no-sandbox',
        ],
      },
    },
  ],

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onPrepare() {},
}
