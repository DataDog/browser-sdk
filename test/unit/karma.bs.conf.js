import { getBuildInfos } from '../envUtils.ts'
import { browserConfigurations } from './browsers.conf.ts'
import karmaBaseConf from './karma.base.conf.js'

const selectedBrowser = process.env.BS_BROWSER
const filteredConfigurations = selectedBrowser
  ? browserConfigurations.filter((configuration) => configuration.id === selectedBrowser)
  : browserConfigurations

if (selectedBrowser && filteredConfigurations.length === 0) {
  const availableIds = browserConfigurations.map((c) => c.id).join(', ')
  throw new Error(`Unknown BS_BROWSER "${selectedBrowser}". Available: ${availableIds}`)
}

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
    browsers: filteredConfigurations.map((configuration) => configuration.sessionName),
    concurrency: filteredConfigurations.length,
    browserDisconnectTolerance: 3,
    captureTimeout: 2 * 60 * 1000,
    browserStack: {
      username: process.env.BS_USERNAME,
      accessKey: process.env.BS_ACCESS_KEY,
      localIdentifier: process.env.BROWSERSTACK_LOCAL_IDENTIFIER,
      project: 'browser sdk unit',
      build: getBuildInfos(),
      video: false,
    },
    customLaunchers: Object.fromEntries(
      filteredConfigurations.map((configuration) => [
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
