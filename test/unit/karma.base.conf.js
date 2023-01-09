const webpack = require('webpack')
const webpackConfig = require('../../webpack.base')({
  mode: 'development',
  types: ['jasmine'],
  // do not replace build env variables in unit test in order to test different build behaviors
  keepBuildEnvVariables: true,
})
const getTestReportDirectory = require('../getTestReportDirectory')
const jasmineSeedReporterPlugin = require('./jasmineSeedReporterPlugin')

const reporters = ['spec', 'jasmine-seed']

const testReportDirectory = getTestReportDirectory()
if (testReportDirectory) {
  reporters.push('junit')
}

module.exports = {
  basePath: '../..',
  files: ['packages/*/+(src|test)/**/*.spec.ts'],
  frameworks: ['jasmine', 'webpack'],
  client: {
    jasmine: {
      random: true,
      stopSpecOnExpectationFailure: true,
    },
  },
  preprocessors: {
    'packages/*/+(src|test)/**/*.ts': ['webpack', 'sourcemap'],
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
  webpack: {
    stats: 'minimal',
    module: webpackConfig.module,
    resolve: webpackConfig.resolve,
    target: webpackConfig.target,
    devtool: false,
    mode: 'development',
    plugins: [
      new webpack.SourceMapDevToolPlugin({
        test: /\.(ts|js)($|\?)/i,
      }),
    ],
    optimization: {
      // By default, karma-webpack creates a bundle with one entry point for each spec file, but
      // with all dependencies shared.  Our test suite does not support sharing dependencies, each
      // spec bundle should include its own copy of dependencies.
      runtimeChunk: false,
      splitChunks: false,
    },
  },
  webpackMiddleware: {
    stats: 'errors-only',
    logLevel: 'warn',
  },
  plugins: ['karma-*', jasmineSeedReporterPlugin],
}
