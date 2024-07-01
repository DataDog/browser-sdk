import path from 'path'
import { unlinkSync, mkdirSync } from 'fs'
import type { Options, Reporters } from '@wdio/types'
import { browser, $, $$ } from '@wdio/globals'
import { getRunId, getTestReportDirectory } from '../envUtils'
import { APPLICATION_ID } from './lib/helpers/configuration'

const reporters: Reporters.ReporterEntry[] = [['spec', { onlyFailures: true }]]
let logsPath: string | undefined

const testReportDirectory = getTestReportDirectory()
if (testReportDirectory) {
  reporters.push([
    'junit',
    {
      outputDir: testReportDirectory,
      outputFileFormat(options) {
        const browserName = 'browserName' in options.capabilities ? String(options.capabilities.browserName) : 'unknown'
        return `results-${options.cid}.${browserName}.xml`
      },
    },
  ])
  logsPath = path.join(testReportDirectory, 'specs.log')
} else if (!process.env.LOGS_STDOUT) {
  logsPath = 'specs.log'
}

type OptionsWithLogsPath = Options.Testrunner & { logsPath?: string }
export const config: OptionsWithLogsPath = {
  runner: 'local',
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {
      project: './tsconfig.json',
    },
  },
  // We do not inject @wdio globals to keep Jasmine's expect
  injectGlobals: false,
  specs: ['./scenario/**/*.scenario.ts'],
  exclude: ['./scenario/developer-extension/*.scenario.ts'],
  capabilities: [],
  maxInstances: 5,
  logLevel: 'warn',
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 90000,
  connectionRetryCount: 0,
  framework: 'jasmine',
  reporters,
  jasmineOpts: {
    defaultTimeoutInterval: 60000,
  },
  onPrepare: (_config, _capabilities) => {
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
        console.log(`Failed to create the test report directory: ${(e as Error).message}`)
      }
    }

    if (logsPath) {
      try {
        unlinkSync(logsPath)
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.log(`Failed to remove previous logs: ${(e as Error).message}`)
        }
      }
    }
  },
  beforeSession: (_config, _capabilities, _specs, _cid) => {
    // Expose everything besides expect, as we want to keep the one from Jasmine
    global.browser = browser
    global.$ = $
    global.$$ = $$
  },
  logsPath,
}
