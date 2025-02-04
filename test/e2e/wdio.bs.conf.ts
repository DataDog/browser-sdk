import type { Options } from '@wdio/types'
import { getBuildInfos } from '../envUtils'
import { browserConfigurations } from './browsers.conf'
import { config as baseConfig } from './wdio.base.conf'

export const config: Options.Testrunner = {
  ...baseConfig,

  specFileRetries: 1,
  exclude: [...baseConfig.exclude!, './scenario/rum/s8sInject.scenario.ts'],
  capabilities: browserConfigurations.map((configuration) =>
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
