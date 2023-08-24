import type { Options } from '@wdio/types'
import { config as baseConfig } from './wdio.base.conf'

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
}
