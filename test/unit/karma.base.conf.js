const webpackConfig = require('../../webpack.base')('development')

module.exports = {
  basePath: '../..',
  files: ['packages/*/+(src|test)/**/*.ts'],
  frameworks: ['jasmine'],
  client: {
    jasmine: {
      random: true,
    },
  },
  preprocessors: {
    'packages/*/+(src|test)/**/*.ts': ['webpack'],
  },
  reporters: ['spec'],
  specReporter: {
    suppressErrorSummary: true,
    suppressPassed: true,
    suppressSkipped: true,
  },
  singleRun: true,
  webpack: {
    mode: webpackConfig.mode,
    stats: 'minimal',
    module: webpackConfig.module,
    plugins: webpackConfig.plugins,
    resolve: webpackConfig.resolve,
  },
  webpackMiddleware: {
    stats: 'errors-only',
    logLevel: 'warn',
  },
}
