import type { Options } from '@wdio/types'
import browsers from '../browsers.conf'
import { getBuildInfos } from '../envUtils'
import { config as baseConfig } from './wdio.base.conf'

export const config: Options.Testrunner = {
  ...baseConfig,

  specFileRetries: 1,

  capabilities: browsers
    .filter(
      (browser) =>
        browser.sessionName !== 'IE' &&
        // Safari mobile on iOS 12.0 does not support
        // the way we flush events on page change
        // TODO check newer version on browserstack
        browser.sessionName !== 'Safari mobile'
    )
    .map((browser) =>
      // See https://www.browserstack.com/automate/capabilities?tag=selenium-4
      // Make sure to look at the "W3C Protocol" tab
      ({
        browserName: browser.name,
        browserVersion: browser.version,
        'bstack:options': {
          os: browser.os,
          osVersion: browser.osVersion,
          deviceName: browser.device,

          appiumVersion: '1.22.0',
          seleniumVersion: '4.1.2',

          sessionName: browser.sessionName,
          projectName: 'browser sdk e2e',
          buildName: getBuildInfos(),
        },
      })
    ),
  logLevels: {
    '@wdio/browserstack-service': 'info',
  },
  services: [
    [
      'browserstack',
      {
        browserstackLocal: true,
      },
    ],
  ],
  user: process.env.BS_USERNAME,
  key: process.env.BS_ACCESS_KEY,
}
