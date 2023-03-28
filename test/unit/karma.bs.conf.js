const browsers = require('../browsers.conf')
const { getBuildInfos, getIp } = require('../envUtils')
const karmaBaseConf = require('./karma.base.conf')

module.exports = function (config) {
  config.set({
    ...karmaBaseConf,
    plugins: [...karmaBaseConf.plugins, 'karma-browserstack-launcher'],
    reporters: [...karmaBaseConf.reporters, 'BrowserStack'],
    browsers: browsers.map((browser) => browser.sessionName),
    concurrency: 5,
    browserDisconnectTolerance: 3,
    hostname: getIp(),
    browserStack: {
      username: process.env.BS_USERNAME,
      accessKey: process.env.BS_ACCESS_KEY,
      project: 'browser sdk unit',
      build: getBuildInfos(),
      video: false,
    },
    customLaunchers: Object.fromEntries(
      browsers.map((browser) => [
        browser.sessionName,
        // See https://github.com/karma-runner/karma-browserstack-launcher#per-browser-options
        {
          base: 'BrowserStack',
          os: browser.os,
          os_version: browser.osVersion,
          browser: browser.name,
          browser_version: browser.version,
          device: browser.device,
          name: browser.sessionName,
        },
      ])
    ),
  })
}
