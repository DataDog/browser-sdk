import type { Options } from '@wdio/types'
import { browserConfigurations } from '../browsers.conf'
import { getBuildInfos } from '../envUtils'
import { config as baseConfig } from './wdio.base.conf'

export const config: Options.Testrunner = {
  ...baseConfig,

  specFileRetries: 1,

  capabilities: browserConfigurations
    .filter(
      (configuration) =>
        configuration.sessionName !== 'IE' &&
        // Safari mobile on iOS <= 14.0 does not support
        // the way we flush events on page change
        // TODO check newer version on browserstack
        configuration.sessionName !== 'Safari mobile'
    )
    .map((configuration) =>
      // See https://www.browserstack.com/automate/capabilities?tag=selenium-4
      // Make sure to look at the "W3C Protocol" tab
      ({
        browserName: configuration.name,
        browserVersion: configuration.version,
        'bstack:options': {
          os: configuration.os,
          osVersion: configuration.osVersion,
          deviceName: configuration.device,

          appiumVersion: '1.22.0',
          seleniumVersion: '4.1.2',

          sessionName: configuration.sessionName,
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
