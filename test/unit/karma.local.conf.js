const path = require('path')
const { getCoverageReportDirectory } = require('../envUtils')
const karmaBaseConf = require('./karma.base.conf')

const coverageReports = ['text-summary']

const coverageReportDirectory = getCoverageReportDirectory()
if (coverageReportDirectory) {
  coverageReports.push('clover')
}

module.exports = function (config) {
  config.set({
    ...karmaBaseConf,
    reporters: ['coverage-istanbul', ...karmaBaseConf.reporters],
    browsers: ['ChromeHeadlessNoSandbox'],
    coverageIstanbulReporter: {
      reports: coverageReports,
      dir: coverageReportDirectory,
    },
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox'],
      },
    },
    webpack: {
      ...karmaBaseConf.webpack,
      module: withIstanbulRule(karmaBaseConf.webpack.module),
    },
    sourceMapLoader: {
      remapSource: (source) => source.replace(/webpack:\/\//g, path.join(__dirname, '../../')),
    },
  })
}

function withIstanbulRule(module) {
  module.rules.push({
    test: /^.*\.ts$/,
    exclude: [/.*\.spec\.ts$/, /.*\.d\.ts$/, /.*capturedExceptions\.ts$/, /.*specHelper\.ts$/, /node_modules/],
    enforce: 'post',
    use: {
      loader: '@jsdevtools/coverage-istanbul-loader',
      options: {
        esModules: true,
      },
    },
  })
  return module
}
