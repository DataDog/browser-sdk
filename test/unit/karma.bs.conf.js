const { getBuildInfos } = require('../envUtils')
let { browserConfigurations } = require('../browsers.conf')
const initKarmaBaseConf = require('./karma.base.conf')

const isExtension = process.argv.includes('--ext')

const testFiles = isExtension
  ? ['packages/*/+(src|test)/**/*.spec.ts', 'developer-extension/src/**/*.spec.ts']
  : ['packages/*/+(src|test)/**/*.spec.ts']
const excludeBrowsers = ['ie', 'safari']
browserConfigurations = isExtension
  ? browserConfigurations.filter((configuration) => !excludeBrowsers.includes(configuration.name))
  : browserConfigurations
const karmaBaseConf = initKarmaBaseConf(testFiles)

module.exports = function (config) {
  config.set({
    ...karmaBaseConf,
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
