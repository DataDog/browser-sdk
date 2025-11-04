import path from 'node:path'
import { getCoverageReportDirectory } from '../envUtils.ts'
import karmaBaseConf from './karma.base.conf.js'

const coverageReports = ['text-summary', 'html']

if (process.env.CI) {
  coverageReports.push('clover')
}

// eslint-disable-next-line import/no-default-export
export default function (config) {
  config.set({
    ...karmaBaseConf,
    reporters: ['coverage-istanbul', ...karmaBaseConf.reporters],
    browsers: ['ChromeHeadlessNoSandbox'],
    coverageIstanbulReporter: {
      reports: coverageReports,
      dir: getCoverageReportDirectory(),
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
      remapSource: (source) => source.replace(/webpack:\/\//g, path.join(import.meta.dirname, '../../')),
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
