const karmaBaseConf = require('./karma.base.conf')
const browsers = require('../browsers.conf')
const { getBuildInfos, getIp } = require('../utils')

module.exports = function (config) {
  config.set({
    ...karmaBaseConf,
    plugins: [...karmaBaseConf.plugins, 'karma-browserstack-launcher'],
    reporters: [...karmaBaseConf.reporters, 'BrowserStack'],
    browsers: Object.keys(browsers),
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
      Object.entries(browsers).map(([key, browser]) => [key, { ...browser, name: key.toLowerCase() }])
    ),
  })
}
