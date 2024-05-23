import path from 'path'
import type { Options } from '@wdio/types'
import { config as baseConfig } from './wdio.base.conf'

export const config: Options.Testrunner = {
  ...baseConfig,

  onPrepare() {},

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

  specs: ['./scenario/developer-extension/*.scenario.ts'],
  exclude: [],
}
