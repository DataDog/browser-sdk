const path = require('path')
const { unlinkSync, mkdirSync } = require('fs')
const { getRunId, getTestReportDirectory } = require('../envUtils')
const { APPLICATION_ID } = require('./lib/helpers/constants')

const reporters = [['spec', { onlyFailures: true }]]
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
  specs: ['./test/e2e/scenario/**/*.scenario.ts'],
  maxInstances: 5,
  logLevel: 'warn',
  waitforTimeout: 10000,
  connectionRetryTimeout: 90000,
  connectionRetryCount: 0,
  framework: 'jasmine',
  reporters,
  jasmineOpts: {
    defaultTimeoutInterval: 60000,
  },
  autoCompileOpts: {
    tsNodeOpts: {
      transpileOnly: false,
      files: true,
      project: 'test/e2e/tsconfig.json',
    },
  },
  onPrepare() {
    console.log(
      `[RUM events] https://app.datadoghq.com/rum/explorer?query=${encodeURIComponent(
        `@application.id:${APPLICATION_ID} @context.run_id:"${getRunId()}"`
      )}`
    )
    console.log(`[Log events] https://app.datadoghq.com/logs?query=${encodeURIComponent(`@run_id:"${getRunId()}"`)}\n`)

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
