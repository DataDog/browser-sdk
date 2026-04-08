import { getBuildInfos } from '../envUtils.ts'
import { browserConfigurations } from './browsers.conf.ts'
import karmaBaseConf from './karma.base.conf.js'

const browserStackHostname = process.env.BROWSER_STACK_HOSTNAME || 'bs-local.com'

// eslint-disable-next-line import/no-default-export
export default function (config) {
  config.set({
    ...karmaBaseConf,
    exclude: [
      // Exclude developer-extension from BrowserStack because it is is only compatible with Chrome
      // so there is no point to test it on other browsers.
      'developer-extension/**',
    ],
    plugins: [...karmaBaseConf.plugins, 'karma-browserstack-launcher'],
    reporters: [...karmaBaseConf.reporters, 'BrowserStack'],
    browsers: browserConfigurations.map((configuration) => configuration.sessionName),
    concurrency: 5,
    // BrowserStack sessions can take a while to reconnect after transient network hiccups.
    browserDisconnectTimeout: 30 * 1000,
    browserDisconnectTolerance: 3,
    captureTimeout: 2 * 60 * 1000,
    pingTimeout: 2 * 60 * 1000,
    browserNoActivityTimeout: 2 * 60 * 1000,
    // BrowserStack recommends using bs-local.com for Safari/iOS local sessions instead of relying
    // on the localhost rewrite, which avoids capture failures on real iOS devices.
    hostname: browserStackHostname,
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
          real_mobile: configuration.realMobile,
          name: configuration.sessionName,
        },
      ])
    ),
  })
}
