import { config as baseConfig } from './wdio.base.conf'

export const config: WebdriverIO.Config = {
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
