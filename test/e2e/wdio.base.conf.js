const path = require('path')
const { unlinkSync, mkdirSync } = require('fs')
const getTestReportDirectory = require('../getTestReportDirectory')

const reporters = ['spec']
let logsPath

const testReportDirectory = getTestReportDirectory()
if (testReportDirectory) {
  reporters.push([
    'junit',
    {
      outputDir: testReportDirectory,
      outputFileFormat(options) {
        return `results-${options.cid}.${options.capabilities.browserName}.xml`
      },
    },
  ])
  logsPath = path.join(testReportDirectory, 'specs.log')
} else if (!process.env.LOGS_STDOUT) {
  logsPath = 'specs.log'
}

module.exports = {
  runner: 'local',
  specs: ['./test/e2e/scenario/**/recorder.scenario.ts'],
  maxInstances: 5,
  logLevel: 'warn',
  waitforTimeout: 10000,
  connectionRetryTimeout: 90000,
  connectionRetryCount: 0,
  framework: 'jasmine',
  reporters,
  jasmineNodeOpts: {
    defaultTimeoutInterval: 60000,
    requires: [path.resolve(__dirname, './tsNode')],
  },
  onPrepare() {
    if (testReportDirectory) {
      try {
        mkdirSync(testReportDirectory, { recursive: true })
      } catch (e) {
        console.log(`Failed to create the test report directory: ${e.message}`)
      }
    }

    if (logsPath) {
      try {
        unlinkSync(logsPath)
      } catch (e) {
        if (e.code !== 'ENOENT') {
          console.log(`Failed to remove previous logs: ${e.message}`)
        }
      }
    }
  },

  logsPath,
}
