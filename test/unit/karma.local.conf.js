const path = require('path')
const karmaBaseConf = require('./karma.base.conf')

module.exports = function (config) {
  config.set({
    ...karmaBaseConf,
    // reporters: ['coverage-istanbul', ...karmaBaseConf.reporters],
    browsers: ['ChromeHeadlessNoSandbox'],
    coverageIstanbulReporter: {
      reports: ['html', 'text-summary', 'json'],
      dir: path.join(__dirname, '../../coverage'),
    },
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox'],
      },
    },
  })
}
