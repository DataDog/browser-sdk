const path = require('path')
const getTestReportDirectory = require('../getTestReportDirectory')
const { unlinkSync } = require('fs')
const { CurrentSpecReporter } = require('./currentSpecReporter')

const reporters = ['spec']

const testReportDirectory = getTestReportDirectory()
if (testReportDirectory) {
  reporters.push([
    'junit',
    {
      outputDir: testReportDirectory,
      outputFileFormat: function(options) {
        return `results-${options.cid}.${options.capabilities.browserName}.xml`
      },
    },
  ])
}

module.exports = {
  runner: 'local',
  specs: ['./test/e2e/scenario/**/*.scenario.ts'],
  maxInstances: 5,
  logLevel: 'warn',
  waitforTimeout: 10000,
  connectionRetryTimeout: 90000,
  connectionRetryCount: 0,
  framework: 'jasmine',
  reporters,
  jasmineNodeOpts: {
    defaultTimeoutInterval: 60000,
    requires: [path.resolve(__dirname, './ts-node')],
  },
  onPrepare: function() {
    try {
      unlinkSync('test/server/test-server.log')
    } catch (e) {
      console.log(e.message)
    }
  },
  before: function() {
    jasmine.getEnv().addReporter(new CurrentSpecReporter())
  },
}
