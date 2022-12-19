const path = require('path')
const { unlinkSync, mkdirSync } = require('fs')
const { getRunId } = require('../utils')
const getTestReportDirectory = require('../getTestReportDirectory')
const APPLICATION_ID = '37fe52bf-b3d5-4ac7-ad9b-44882d479ec8'

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
  specs: ['./scenario/**/*.scenario.ts'],
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
      project: './tsconfig.json',
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
