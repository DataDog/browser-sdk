const alias = require('esbuild-plugin-alias')
const getTestReportDirectory = require('../getTestReportDirectory')
const esbuildPluginTransformToEs5 = require('../../scripts/build/esbuildPluginTransformToEs5.js')
const jasmineSeedReporterPlugin = require('./jasmineSeedReporterPlugin')

const reporters = ['spec', 'jasmine-seed']

const testReportDirectory = getTestReportDirectory()
if (testReportDirectory) {
  reporters.push('junit')
}

module.exports = {
  basePath: '../..',
  files: [
    {
      pattern: 'packages/*/+(src|test)/**/*.spec.ts',
      type: 'js',
    },
  ],
  frameworks: ['jasmine'],
  client: {
    jasmine: {
      random: true,
      oneFailurePerSpec: true,
    },
  },
  preprocessors: {
    'packages/*/+(src|test)/**/*.ts': ['esbuild'],
  },
  reporters,
  specReporter: {
    suppressErrorSummary: true,
    suppressPassed: true,
    suppressSkipped: true,
  },
  junitReporter: {
    outputDir: testReportDirectory,
  },
  singleRun: true,
  plugins: [
    'karma-esbuild',
    'karma-spec-reporter',
    'karma-junit-reporter',
    'karma-jasmine',
    'karma-chrome-launcher',
    jasmineSeedReporterPlugin,
  ],

  esbuild: {
    plugins: [
      alias({
        // By default, a non-bundled version of sinon is pulled in, which require the nodejs 'util'
        // module. We don't have a polyfill for node modules. Use a bundled version of sinon which
        // have its own 'util' module polyfill.
        sinon: require.resolve('sinon/pkg/sinon.js'),
      }),
      esbuildPluginTransformToEs5,
    ],
    // This tells esbuild to ignore the `sideEffects: false` field in package.json, else it will
    // skip all spec files.
    ignoreAnnotations: true,

    // Karma-esbuild specific options
    singleBundle: false,
  },
}
