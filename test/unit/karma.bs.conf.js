const { getBuildInfos } = require('../envUtils')
const karmaBaseConf = require('./karma.base.conf')
let { browserConfigurations } = require('./browsers.conf')

const isExtension = process.argv.includes('--ext')
browserConfigurations = isExtension
  ? browserConfigurations.filter((configuration) => !['ie', 'safari'].includes(configuration.name))
  : browserConfigurations

module.exports = function (config) {
  config.set({
    ...karmaBaseConf,
    files: isExtension ? [...karmaBaseConf.files, 'developer-extension/src/**/*.spec.ts']: karmaBaseConf.files,
    plugins: [...karmaBaseConf.plugins, 'karma-browserstack-launcher'],
    preprocessors: isExtension ? {
      ...karmaBaseConf.preprocessors,
      'developer-extension/src/**/*.ts': ['webpack', 'sourcemap'],
    } : karmaBaseConf.preprocessors,
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
