const karmaBaseConf = require('./karma.base.conf')

module.exports = function(config) {
  config.set({
    ...karmaBaseConf,
    browsers: ['ChromeHeadlessNoSandbox'],
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox'],
      },
    },
  })
}
