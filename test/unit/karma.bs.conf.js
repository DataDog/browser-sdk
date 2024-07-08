const { browserConfigurations } = require('../browsers.conf')
const { getBuildInfos } = require('../envUtils')
const karmaBaseConf = require('./karma.base.conf')

module.exports = function (config) {
  config.set({
    ...karmaBaseConf,
    exclude: [
      // Exclude rum-react from BrowserStack because it is using dependencies that are not compatible
      // with IE11 (react and react-router). Just skipping tests with Jasmine `pending` is not
      // enough because those dependencies are failing at module evaluation on IE11. This exclusion
      // can be removed when dropping IE11 support.
      'packages/rum-react/**',

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
