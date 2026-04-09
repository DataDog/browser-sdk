import { getBuildInfos } from '../envUtils.ts'
import { browserConfigurations } from './browsers.conf.ts'
import karmaBaseConf from './karma.base.conf.js'

const BROWSERSTACK_IOS_SAFE_HOSTNAME = 'bs-local.com'

// eslint-disable-next-line import/no-default-export
export default function (config) {
  config.set({
    ...karmaBaseConf,
    // BrowserStack iOS sessions do not reliably capture Karma through localhost.
    // Serve the unit test page through bs-local.com directly so Mobile Safari uses
    // the BrowserStack local tunnel hostname instead of relying on the redirect.
    hostname: BROWSERSTACK_IOS_SAFE_HOSTNAME,
    listenAddress: '0.0.0.0',
    exclude: [
      // Exclude developer-extension from BrowserStack because it is is only compatible with Chrome
      // so there is no point to test it on other browsers.
      'developer-extension/**',
    ],
    plugins: [...karmaBaseConf.plugins, 'karma-browserstack-launcher'],
    reporters: [...karmaBaseConf.reporters, 'BrowserStack'],
    browsers: browserConfigurations.map((configuration) => configuration.sessionName),
    concurrency: 5,
    browserDisconnectTolerance: 3,
    captureTimeout: 2 * 60 * 1000,
    browserStack: {
      username: process.env.BS_USERNAME,
      accessKey: process.env.BS_ACCESS_KEY,
      project: 'browser sdk unit',
      build: getBuildInfos(),
      video: false,
    },
    customLaunchers: Object.fromEntries(
      browserConfigurations.map((configuration) => [
        configuration.sessionName,
        // See https://github.com/karma-runner/karma-browserstack-launcher#per-browser-options
        {
          base: 'BrowserStack',
          os: configuration.os,
          os_version: configuration.osVersion,
          browser: configuration.name,
          browser_version: configuration.version,
          device: configuration.device,
          name: configuration.sessionName,
        },
      ])
    ),
  })
}
