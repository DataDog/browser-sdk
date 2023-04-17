import { readFileSync } from 'fs'
import type { Options } from '@wdio/types'
import { config as baseConfig } from './wdio.base.conf'

const ciConf = readFileSync('.gitlab-ci.yml', { encoding: 'utf-8' })
const CHROME_DRIVER_VERSION = /CHROME_DRIVER_VERSION: (.*)/.exec(ciConf)?.[1]

export const config: Options.Testrunner = {
  ...baseConfig,

  capabilities: [
    {
      browserName: 'chrome',
      'goog:chromeOptions': {
        args: ['--headless', '--no-sandbox'],
      },
    },
  ],
  services: [
    [
      'selenium-standalone',
      {
        installArgs: {
          drivers: {
            chrome: { version: CHROME_DRIVER_VERSION },
          },
        },
        args: {
          drivers: {
            chrome: { version: CHROME_DRIVER_VERSION },
          },
        },
      },
    ],
  ],
}
