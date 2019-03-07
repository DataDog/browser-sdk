const webpackConfig = require('../../webpack.config')(null, { mode: 'development' })

module.exports = {
  basePath: '../..',
  files: ['src/**/*.spec.ts'],
  frameworks: ['mocha', 'sinon-chai'],
  preprocessors: {
    'src/**/*.spec.ts': ['webpack'],
  },
  reporters: ['mocha'],
  mochaReporter: {
    output: 'minimal',
    showDiff: true,
  },
  singleRun: true,
  webpack: {
    mode: 'development',
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
